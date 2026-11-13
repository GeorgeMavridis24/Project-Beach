"""Αιτήσεις συνεργατών και μηνύματα. Τα email στέλνονται στο παρασκήνιο."""

from typing import Literal, Optional

from fastapi import APIRouter, BackgroundTasks, Depends

from ..mailer import send_simple_email
from ..schemas import DecisionIn, MessageIn, PartnerRequestIn
from ..security import get_current_user, require_admin
from ..services import partners as partner_service

router = APIRouter(tags=["Συνεργάτες"])


def _notify_admins(background: BackgroundTasks, subject: str, lines: list[str]) -> None:
    for email in partner_service.admin_emails():
        background.add_task(send_simple_email, email, subject, "Αιτήσεις συνεργατών", lines)


def _notify_applicant(background: BackgroundTasks, req: dict, subject: str, lines: list[str], color: str = "#007c80") -> None:
    background.add_task(send_simple_email, req["email"], subject, subject, [f"Γεια σου {req['username']},", *lines], color)


# ------------------------------------------------------------------ χρήστης
@router.get("/partner/requests/me")
def my_requests(mark_read: bool = False, user: dict = Depends(get_current_user)):
    return partner_service.list_for_user(user["id"], mark_read)


@router.post("/partner/requests", status_code=201)
def create_request(data: PartnerRequestIn, background: BackgroundTasks, user: dict = Depends(get_current_user)):
    req = partner_service.create(user, data)
    _notify_admins(
        background,
        f"Νέα αίτηση συνεργάτη: {req['business_name']}",
        [
            f"Ο χρήστης {req['username']} ({req['email']}, τηλ. {req['phone']}) ζητά να γίνει συνεργάτης.",
            f"Κατάστημα: {req['business_name']} · ωράριο {req['open_time']}-{req['close_time']} · "
            f"{req['total_sunbeds']} ξαπλώστρες.",
            "Δες την αίτηση στην εφαρμογή: Προφίλ → Αιτήσεις συνεργατών.",
        ],
    )
    return req


@router.put("/partner/requests/{request_id}")
def update_request(request_id: int, data: PartnerRequestIn, user: dict = Depends(get_current_user)):
    return partner_service.update(user, request_id, data)


@router.delete("/partner/requests/{request_id}")
def withdraw_request(request_id: int, user: dict = Depends(get_current_user)):
    partner_service.withdraw(user, request_id)
    return {"deleted": request_id}


@router.post("/partner/requests/{request_id}/messages")
def send_message(request_id: int, data: MessageIn, background: BackgroundTasks, user: dict = Depends(get_current_user)):
    req = partner_service.add_message(user, request_id, data.body)
    if user["role"] == "admin" and user["id"] != req["user_id"]:
        _notify_applicant(background, req, "Νέο μήνυμα από το SmartBeach", [data.body, "Απάντησε από την εφαρμογή: Προφίλ → Η αίτησή μου."])
    else:
        _notify_admins(background, f"Νέο μήνυμα για την αίτηση «{req['business_name']}»", [f"{user['username']}: {data.body}"])
    return req


# ------------------------------------------------------------------ διαχειριστής
@router.get("/admin/partner-requests")
def admin_requests(status: Optional[Literal["pending", "approved", "rejected"]] = None, _: dict = Depends(require_admin)):
    return partner_service.admin_list(status)


@router.get("/admin/partner-requests/{request_id}")
def admin_request(request_id: int, _: dict = Depends(require_admin)):
    return partner_service.admin_get(request_id)


@router.post("/admin/partner-requests/{request_id}/approve")
def approve(request_id: int, data: DecisionIn, background: BackgroundTasks, _: dict = Depends(require_admin)):
    req = partner_service.approve(request_id, data.note)
    _notify_applicant(
        background,
        req,
        "Η αίτησή σου εγκρίθηκε!",
        [
            f"Το κατάστημα «{req['business_name']}» δημιουργήθηκε με {req['total_sunbeds']} ξαπλώστρες "
            f"και ωράριο {req['open_time']}-{req['close_time']}.",
            *( [f"Σχόλιο διαχειριστή: {data.note}"] if data.note else [] ),
            "Αποσυνδέσου και συνδέσου ξανά στην εφαρμογή. Από το Προφίλ θα βρεις «Το κατάστημά μου», "
            "τις κρατήσεις, τα στατιστικά και το check-in.",
        ],
    )
    return req


@router.post("/admin/partner-requests/{request_id}/reject")
def reject(request_id: int, data: DecisionIn, background: BackgroundTasks, _: dict = Depends(require_admin)):
    req = partner_service.reject(request_id, data.note)
    _notify_applicant(
        background,
        req,
        "Σχετικά με την αίτησή σου",
        [
            f"Η αίτηση για το «{req['business_name']}» δεν εγκρίθηκε.",
            *( [f"Σχόλιο διαχειριστή: {data.note}"] if data.note else [] ),
            "Μπορείς να μας απαντήσεις από την εφαρμογή ή να κάνεις νέα αίτηση.",
        ],
        color="#c62828",
    )
    return req
