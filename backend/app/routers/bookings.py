import threading
import time
from collections import defaultdict, deque
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from .. import booking_rules as rules
from ..config import settings
from ..mailer import build_booking_email, deliver, send_booking_email
from ..schemas import BookingCreateIn, BookingEmailIn, BookingTimeIn
from ..security import get_current_user
from ..services import bookings as booking_service

router = APIRouter(prefix="/bookings", tags=["Κρατήσεις πελάτη"])


@router.post("", status_code=201)
def create_booking(data: BookingCreateIn, background: BackgroundTasks, user: dict = Depends(get_current_user)):
    booking = booking_service.create_booking(
        user["id"],
        data.sunbed_id,
        data.res_date,
        rules.parse_time(data.start_time),
        rules.parse_time(data.end_time),
    )
    background.add_task(send_booking_email, booking, "created")  # email επιβεβαίωσης με QR
    return booking


@router.get("/me")
def my_bookings(
    scope: Literal["upcoming", "past", "cancelled", "all"] = "upcoming",
    user: dict = Depends(get_current_user),
):
    return booking_service.list_for_user(user["id"], scope)


@router.put("/{booking_id}/time")
def change_my_time(
    booking_id: int, data: BookingTimeIn, background: BackgroundTasks, user: dict = Depends(get_current_user)
):
    booking = booking_service.update_times(
        booking_id, rules.parse_time(data.start_time), rules.parse_time(data.end_time), user_id=user["id"]
    )
    background.add_task(send_booking_email, booking, "updated")
    return booking


@router.post("/{booking_id}/cancel")
def cancel_my_booking(booking_id: int, background: BackgroundTasks, user: dict = Depends(get_current_user)):
    booking = booking_service.cancel(booking_id, user_id=user["id"])
    background.add_task(send_booking_email, booking, "cancelled")
    return booking


# Όριο για να μη γίνει η εφαρμογή εργαλείο spam: 10 αποστολές / ώρα ανά χρήστη.
EMAIL_LIMIT = 10
_sent: dict[int, deque] = defaultdict(deque)
_sent_lock = threading.Lock()


def _check_rate(user_id: int) -> None:
    now = time.monotonic()
    with _sent_lock:
        q = _sent[user_id]
        while q and now - q[0] > 3600:
            q.popleft()
        if len(q) >= EMAIL_LIMIT:
            raise HTTPException(status_code=429, detail="Έστειλες πολλά email. Δοκίμασε ξανά σε λίγο.")
        q.append(now)


@router.post("/{booking_id}/email")
def email_booking(booking_id: int, data: BookingEmailIn, user: dict = Depends(get_current_user)):
    """Στέλνει την κράτηση (με QR) στο email του χρήστη ή σε άλλη διεύθυνση (π.χ. σε φίλο)."""
    booking = next((b for b in booking_service.list_for_user(user["id"], "all") if b["booking_id"] == booking_id), None)
    if booking is None:
        raise HTTPException(status_code=404, detail="Η κράτηση δεν βρέθηκε.")
    if booking["status"] != "confirmed":
        raise HTTPException(status_code=409, detail="Η κράτηση είναι ακυρωμένη.")
    to = (data.to or user["email"]).strip().lower()
    _check_rate(user["id"])
    kind = "resend" if to == user["email"].lower() else "shared"
    try:
        where = deliver(build_booking_email(booking, kind, to=to))
    except Exception:  # noqa: BLE001
        raise HTTPException(
            status_code=502,
            detail="Δεν ήταν δυνατή η αποστολή. Έλεγξε τις ρυθμίσεις email του server (3-RYTHMISI-EMAIL.bat).",
        )
    if not settings.smtp_host:
        return {
            "sent": False,
            "to": to,
            "detail": "Η αποστολή email δεν έχει ρυθμιστεί ακόμα στον server. Το email αποθηκεύτηκε "
            "στον φάκελο backend/outbox. Τρέξε το 3-RYTHMISI-EMAIL.bat για πραγματική αποστολή.",
            "saved_to": where,
        }
    return {"sent": True, "to": to, "detail": f"Η κράτηση στάλθηκε στο {to}."}
