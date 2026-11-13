"""Διαχείριση. Ο admin βλέπει όλα τα καταστήματα, ο καταστηματάρχης (owner)
μόνο τα δικά του - το φίλτρο εφαρμόζεται εδώ, στον server, όχι στην εφαρμογή."""

from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from mysql.connector import errors as mysql_errors

from .. import booking_rules as rules
from .. import db
from ..mailer import send_booking_email
from ..schemas import AdminUserCreateIn, BookingTimeIn, UserUpdateIn
from ..security import ensure_can_manage, hash_password, managed_beach_ids, require_admin, require_manager
from ..services import bookings as booking_service
from ..services import stats as stats_service

router = APIRouter(prefix="/admin", tags=["Διαχείριση"])


def _public(booking: dict) -> dict:
    booking.pop("checkin_code", None)  # ο κωδικός εισόδου είναι μόνο για τον πελάτη
    return booking


# ---------------------------------------------------------------- κρατήσεις
@router.get("/bookings")
def all_bookings(
    beach_id: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    status: Optional[Literal["confirmed", "cancelled"]] = None,
    q: Optional[str] = Query(None, max_length=100, description="Όνομα ή email πελάτη"),
    limit: int = Query(300, ge=1, le=1000),
    user: dict = Depends(require_manager),
):
    return booking_service.list_all(beach_id, date_from, date_to, status, q, limit, beach_ids=managed_beach_ids(user))


@router.post("/bookings/{booking_id}/cancel")
def cancel_booking(booking_id: int, background: BackgroundTasks, user: dict = Depends(require_manager)):
    booking = booking_service.cancel(booking_id, user_id=None, beach_ids=managed_beach_ids(user))
    background.add_task(send_booking_email, dict(booking), "cancelled")
    return _public(booking)


@router.put("/bookings/{booking_id}/time")
def change_time(booking_id: int, data: BookingTimeIn, background: BackgroundTasks, user: dict = Depends(require_manager)):
    booking = booking_service.update_times(
        booking_id,
        rules.parse_time(data.start_time),
        rules.parse_time(data.end_time),
        user_id=None,
        beach_ids=managed_beach_ids(user),
    )
    background.add_task(send_booking_email, dict(booking), "updated")
    return _public(booking)


# ---------------------------------------------------------------- χρήστες
@router.get("/users")
def list_users(
    q: Optional[str] = Query(None, max_length=100),
    role: Optional[Literal["user", "staff", "owner", "admin"]] = None,
    _: dict = Depends(require_admin),
):
    where, params = [], []
    if q:
        where.append("(u.username LIKE %s OR u.email LIKE %s)")
        params += [f"%{q.strip()}%", f"%{q.strip()}%"]
    if role:
        where.append("u.role = %s")
        params.append(role)
    sql = """SELECT u.id, u.username, u.email, u.role, u.created_at,
                    COUNT(r.id) AS bookings,
                    COALESCE(SUM(CASE WHEN r.status = 'confirmed' THEN r.price END), 0) AS spent,
                    (SELECT GROUP_CONCAT(b.name ORDER BY b.name SEPARATOR ', ')
                       FROM beaches b WHERE b.owner_id = u.id) AS owns
             FROM users u LEFT JOIN reserves r ON r.user_id = u.id"""
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " GROUP BY u.id, u.username, u.email, u.role, u.created_at ORDER BY u.username"
    rows = db.fetch_all(sql, params)
    for r in rows:
        r["spent"] = float(r["spent"])
        r["bookings"] = int(r["bookings"])
    return rows


@router.post("/users", status_code=201)
def create_user(data: AdminUserCreateIn, _: dict = Depends(require_admin)):
    """Νέος χρήστης από τον διαχειριστή: ενεργός αμέσως (δεν χρειάζεται κωδικό email)."""
    try:
        _, user_id = db.execute(
            "INSERT INTO users (username, email, password, role, email_verified) VALUES (%s, %s, %s, %s, 1)",
            (data.username, data.email.lower(), hash_password(data.password), data.role),
        )
    except mysql_errors.IntegrityError:
        raise HTTPException(status_code=409, detail="Υπάρχει ήδη λογαριασμός με αυτό το email.")
    return db.fetch_one("SELECT id, username, email, role FROM users WHERE id = %s", (user_id,))


@router.delete("/users/{user_id}")
def delete_user(user_id: int, cancel_future: bool = False, admin: dict = Depends(require_admin)):
    """Διαγραφή χρήστη. Οι παλιές κρατήσεις του μένουν ανώνυμα (για τα στατιστικά).
    Αν έχει μελλοντικές κρατήσεις, πρέπει να δοθεί cancel_future=true για να ακυρωθούν."""
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Δεν μπορείς να διαγράψεις τον εαυτό σου.")
    with db.transaction() as cur:
        cur.execute("SELECT id, username, role FROM users WHERE id = %s FOR UPDATE", (user_id,))
        target = cur.fetchone()
        if target is None:
            raise HTTPException(status_code=404, detail="Ο χρήστης δεν βρέθηκε.")
        if target["role"] == "admin":
            cur.execute("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'")
            if cur.fetchone()["n"] <= 1:
                raise HTTPException(status_code=409, detail="Δεν μπορείς να διαγράψεις τον τελευταίο διαχειριστή.")
        cur.execute(
            """SELECT COUNT(*) AS n FROM reserves
               WHERE user_id = %s AND status = 'confirmed' AND res_date >= %s""",
            (user_id, rules.today()),
        )
        future = cur.fetchone()["n"]
        if future and not cancel_future:
            raise HTTPException(
                status_code=409,
                detail=f"Ο χρήστης έχει {future} μελλοντικές κρατήσεις. Θα ακυρωθούν αν συνεχίσεις.",
                headers={"X-Future-Bookings": str(future)},
            )
        if future:
            cur.execute(
                """UPDATE reserves SET status = 'cancelled', cancelled_at = NOW()
                   WHERE user_id = %s AND status = 'confirmed' AND res_date >= %s""",
                (user_id, rules.today()),
            )
        cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
    return {"deleted": user_id, "username": target["username"], "cancelled_bookings": future}


@router.put("/users/{user_id}")
def update_user(user_id: int, data: UserUpdateIn, admin: dict = Depends(require_admin)):
    current = db.fetch_one("SELECT id, username, email, role FROM users WHERE id = %s", (user_id,))
    if current is None:
        raise HTTPException(status_code=404, detail="Ο χρήστης δεν βρέθηκε.")
    if user_id == admin["id"] and data.role and data.role != "admin":
        raise HTTPException(status_code=400, detail="Δεν μπορείς να αφαιρέσεις τον ρόλο admin από τον εαυτό σου.")
    try:
        with db.transaction() as cur:
            cur.execute(
                "UPDATE users SET username = %s, email = %s, role = %s WHERE id = %s",
                (
                    data.username or current["username"],
                    (data.email or current["email"]).lower(),
                    data.role or current["role"],
                    user_id,
                ),
            )
            # Αν δεν είναι πια καταστηματάρχης, αποσυνδέεται από τα καταστήματα.
            if (data.role or current["role"]) != "owner":
                cur.execute("UPDATE beaches SET owner_id = NULL WHERE owner_id = %s", (user_id,))
    except mysql_errors.IntegrityError:
        raise HTTPException(status_code=409, detail="Το email χρησιμοποιείται ήδη.")
    return db.fetch_one("SELECT id, username, email, role FROM users WHERE id = %s", (user_id,))


# ---------------------------------------------------------------- στατιστικά
@router.get("/stats")
def stats(
    beach_id: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    user: dict = Depends(require_manager),
):
    """Dashboard. Προεπιλογή: η τρέχουσα (ή η πιο πρόσφατη) σεζόν."""
    season_start, season_end = rules.current_or_last_season()
    date_from = date_from or season_start
    date_to = date_to or season_end
    if date_to < date_from:
        raise HTTPException(status_code=400, detail="Το 'έως' είναι πριν από το 'από'.")
    if (date_to - date_from).days > 400:
        raise HTTPException(status_code=400, detail="Μέγιστη περίοδος: 400 ημέρες.")
    if beach_id:
        ensure_can_manage(user, beach_id)
        scope = [beach_id]
    else:
        scope = managed_beach_ids(user)
    return stats_service.dashboard(date_from, date_to, beach_ids=scope, heat_beach_id=beach_id)
