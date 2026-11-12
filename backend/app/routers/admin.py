from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from mysql.connector import errors as mysql_errors

from .. import booking_rules as rules
from .. import db
from ..schemas import BookingTimeIn, UserUpdateIn
from ..security import require_admin
from ..services import bookings as booking_service
from ..services import stats as stats_service

router = APIRouter(prefix="/admin", tags=["Διαχείριση"])


# ---------------------------------------------------------------- κρατήσεις
@router.get("/bookings")
def all_bookings(
    beach_id: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    status: Optional[Literal["confirmed", "cancelled"]] = None,
    q: Optional[str] = Query(None, max_length=100, description="Όνομα ή email πελάτη"),
    limit: int = Query(300, ge=1, le=1000),
    _: dict = Depends(require_admin),
):
    return booking_service.list_all(beach_id, date_from, date_to, status, q, limit)


@router.post("/bookings/{booking_id}/cancel")
def cancel_booking(booking_id: int, _: dict = Depends(require_admin)):
    return booking_service.cancel(booking_id, user_id=None)


@router.put("/bookings/{booking_id}/time")
def change_time(booking_id: int, data: BookingTimeIn, _: dict = Depends(require_admin)):
    return booking_service.update_times(
        booking_id, rules.parse_time(data.start_time), rules.parse_time(data.end_time), user_id=None
    )


# ---------------------------------------------------------------- χρήστες
@router.get("/users")
def list_users(
    q: Optional[str] = Query(None, max_length=100),
    role: Optional[Literal["user", "staff", "admin"]] = None,
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
                    COALESCE(SUM(CASE WHEN r.status = 'confirmed' THEN r.price END), 0) AS spent
             FROM users u LEFT JOIN reserves r ON r.user_id = u.id"""
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " GROUP BY u.id, u.username, u.email, u.role, u.created_at ORDER BY u.username"
    rows = db.fetch_all(sql, params)
    for r in rows:
        r["spent"] = float(r["spent"])
        r["bookings"] = int(r["bookings"])
    return rows


@router.put("/users/{user_id}")
def update_user(user_id: int, data: UserUpdateIn, admin: dict = Depends(require_admin)):
    current = db.fetch_one("SELECT id, username, email, role FROM users WHERE id = %s", (user_id,))
    if current is None:
        raise HTTPException(status_code=404, detail="Ο χρήστης δεν βρέθηκε.")
    if user_id == admin["id"] and data.role and data.role != "admin":
        raise HTTPException(status_code=400, detail="Δεν μπορείς να αφαιρέσεις τον ρόλο admin από τον εαυτό σου.")
    try:
        db.execute(
            "UPDATE users SET username = %s, email = %s, role = %s WHERE id = %s",
            (
                data.username or current["username"],
                (data.email or current["email"]).lower(),
                data.role or current["role"],
                user_id,
            ),
        )
    except mysql_errors.IntegrityError:
        raise HTTPException(status_code=409, detail="Το email χρησιμοποιείται ήδη.")
    return db.fetch_one("SELECT id, username, email, role FROM users WHERE id = %s", (user_id,))


# ---------------------------------------------------------------- στατιστικά
@router.get("/stats")
def stats(
    beach_id: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    _: dict = Depends(require_admin),
):
    """Dashboard. Προεπιλογή: η τρέχουσα (ή η πιο πρόσφατη) σεζόν."""
    season_start, season_end = rules.current_or_last_season()
    date_from = date_from or season_start
    date_to = date_to or season_end
    if date_to < date_from:
        raise HTTPException(status_code=400, detail="Το 'έως' είναι πριν από το 'από'.")
    if (date_to - date_from).days > 400:
        raise HTTPException(status_code=400, detail="Μέγιστη περίοδος: 400 ημέρες.")
    return stats_service.dashboard(date_from, date_to, beach_id)
