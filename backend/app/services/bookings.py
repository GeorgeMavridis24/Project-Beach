"""Κρατήσεις: δημιουργία, αλλαγή ωραρίου, ακύρωση, λίστες, check-in.

Πρόληψη διπλής κράτησης (race condition)
-----------------------------------------
Αν δύο χρήστες πατήσουν "Κράτηση" στην ίδια ξαπλώστρα ταυτόχρονα, ένας απλός
έλεγχος "υπάρχει ήδη κράτηση;" και μετά INSERT δεν αρκεί: και οι δύο θα δουν
"όχι" και θα γράψουν. Γι' αυτό κάθε εγγραφή γίνεται σε transaction που πρώτα
κλειδώνει τη γραμμή της ξαπλώστρας (SELECT ... FOR UPDATE). Το δεύτερο
transaction περιμένει μέχρι να τελειώσει το πρώτο και μετά βλέπει την κράτησή
του (READ COMMITTED), οπότε απορρίπτεται με 409.
"""

import secrets
from datetime import date, datetime, time
from typing import Optional

from .. import booking_rules as rules
from .. import db
from ..errors import ConflictError, NotFoundError

BOOKING_SELECT = """
    SELECT r.id AS booking_id, r.res_date,
           TIME_FORMAT(r.res_time, '%H:%i') AS start_time,
           TIME_FORMAT(r.leave_time, '%H:%i') AS end_time,
           r.price, r.status, r.checkin_code, r.checked_in_at, r.cancelled_at, r.created_at,
           s.id AS sunbed_id, s.grid_x, s.grid_y, s.type,
           b.id AS beach_id, b.name AS beach_name,
           u.id AS user_id, u.username, u.email
    FROM reserves r
    JOIN sunbeds s ON s.id = r.sunbed_id
    JOIN beaches b ON b.id = s.beach_id
    JOIN users u ON u.id = r.user_id
"""

OVERLAP_SQL = """
    SELECT id FROM reserves
    WHERE sunbed_id = %s AND res_date = %s AND status = 'confirmed'
      AND res_time < %s AND leave_time > %s
"""


def _iso(v) -> Optional[str]:
    return v.isoformat() if isinstance(v, (date, datetime)) else v


def _present(row: dict, include_code: bool) -> dict:
    start = rules.parse_time(row["start_time"])
    end = rules.parse_time(row["end_time"])
    res_date = row["res_date"]
    started = rules.has_started(res_date, start)
    finished = datetime.combine(res_date, end) <= rules.now()
    active = row["status"] == "confirmed"
    item = {
        "booking_id": row["booking_id"],
        "res_date": res_date.isoformat(),
        "start_time": row["start_time"],
        "end_time": row["end_time"],
        "price": float(row["price"]),
        "status": row["status"],
        "checked_in": row["checked_in_at"] is not None,
        "checked_in_at": _iso(row["checked_in_at"]),
        "cancelled_at": _iso(row["cancelled_at"]),
        "created_at": _iso(row["created_at"]),
        "sunbed_id": row["sunbed_id"],
        "grid_x": row["grid_x"],
        "grid_y": row["grid_y"],
        "type": row["type"],
        "beach_id": row["beach_id"],
        "beach_name": row["beach_name"],
        "user_id": row["user_id"],
        "username": row["username"],
        "email": row["email"],
        "is_past": finished,
        "can_cancel": active and not started and row["checked_in_at"] is None,
        "can_modify": active and not started and row["checked_in_at"] is None,
    }
    if include_code:
        item["checkin_code"] = row["checkin_code"]
    return item


def get_booking(booking_id: int, include_code: bool = False) -> dict:
    row = db.fetch_one(BOOKING_SELECT + " WHERE r.id = %s", (booking_id,))
    if row is None:
        raise NotFoundError("Η κράτηση δεν βρέθηκε.")
    return _present(row, include_code)


def quote(sunbed_id: int, res_date: date, start: time, end: time) -> dict:
    """Ελέγχει αν μια κράτηση είναι εφικτή ΧΩΡΙΣ να τη δημιουργήσει.
    Χρησιμοποιείται από τον AI βοηθό για να προτείνει κράτηση."""
    rules.validate_window(res_date, start, end)
    sunbed = db.fetch_one(
        """SELECT s.id, s.grid_x, s.grid_y, s.type, s.price, s.status, b.id AS beach_id, b.name AS beach_name
           FROM sunbeds s JOIN beaches b ON b.id = s.beach_id WHERE s.id = %s""",
        (sunbed_id,),
    )
    if sunbed is None:
        raise NotFoundError("Η ξαπλώστρα δεν υπάρχει.")
    if sunbed["status"] != "active":
        raise ConflictError("Η ξαπλώστρα είναι εκτός λειτουργίας.")
    if db.fetch_all(OVERLAP_SQL, (sunbed_id, res_date, end, start)):
        raise ConflictError("Η ξαπλώστρα είναι ήδη κλεισμένη σε αυτό το διάστημα.")
    return {
        "sunbed_id": sunbed["id"],
        "beach_id": sunbed["beach_id"],
        "beach_name": sunbed["beach_name"],
        "grid_x": sunbed["grid_x"],
        "grid_y": sunbed["grid_y"],
        "type": sunbed["type"],
        "res_date": res_date.isoformat(),
        "start_time": rules.fmt_time(start),
        "end_time": rules.fmt_time(end),
        "price": float(rules.compute_price(sunbed["price"], start, end)),
    }


def create_booking(user_id: int, sunbed_id: int, res_date: date, start: time, end: time) -> dict:
    rules.validate_window(res_date, start, end)
    code = secrets.token_hex(6).upper()
    with db.transaction(isolation_level="READ COMMITTED") as cur:
        cur.execute("SELECT id, price, status FROM sunbeds WHERE id = %s FOR UPDATE", (sunbed_id,))
        sunbed = cur.fetchone()
        if sunbed is None:
            raise NotFoundError("Η ξαπλώστρα δεν υπάρχει.")
        if sunbed["status"] != "active":
            raise ConflictError("Η ξαπλώστρα είναι εκτός λειτουργίας.")
        cur.execute(OVERLAP_SQL, (sunbed_id, res_date, end, start))
        if cur.fetchall():
            raise ConflictError("Η ξαπλώστρα είναι ήδη κλεισμένη σε αυτό το διάστημα.")
        price = rules.compute_price(sunbed["price"], start, end)
        cur.execute(
            """INSERT INTO reserves (user_id, sunbed_id, res_date, res_time, leave_time, price, status, checkin_code)
               VALUES (%s, %s, %s, %s, %s, %s, 'confirmed', %s)""",
            (user_id, sunbed_id, res_date, start, end, price, code),
        )
        booking_id = cur.lastrowid
    return get_booking(booking_id, include_code=True)


def _load_for_change(cur, booking_id: int, user_id: Optional[int]) -> dict:
    cur.execute(
        """SELECT r.id, r.user_id, r.sunbed_id, r.res_date, r.res_time, r.status, r.checked_in_at, s.price
           FROM reserves r JOIN sunbeds s ON s.id = r.sunbed_id WHERE r.id = %s""",
        (booking_id,),
    )
    row = cur.fetchone()
    if row is None or (user_id is not None and row["user_id"] != user_id):
        raise NotFoundError("Η κράτηση δεν βρέθηκε.")
    if row["status"] != "confirmed":
        raise ConflictError("Η κράτηση είναι ήδη ακυρωμένη.")
    if row["checked_in_at"] is not None:
        raise ConflictError("Έχει γίνει ήδη check-in σε αυτή την κράτηση.")
    return row


def update_times(booking_id: int, start: time, end: time, user_id: Optional[int] = None) -> dict:
    """Αλλαγή ωραρίου. user_id=None σημαίνει admin (οποιαδήποτε κράτηση)."""
    with db.transaction(isolation_level="READ COMMITTED") as cur:
        cur.execute("SELECT sunbed_id FROM reserves WHERE id = %s", (booking_id,))
        found = cur.fetchone()
        if found is None:
            raise NotFoundError("Η κράτηση δεν βρέθηκε.")
        cur.execute("SELECT id FROM sunbeds WHERE id = %s FOR UPDATE", (found["sunbed_id"],))
        cur.fetchall()
        row = _load_for_change(cur, booking_id, user_id)
        res_date = row["res_date"]
        old_start = rules.parse_time(rules.fmt_time(row["res_time"]))
        if user_id is not None and rules.has_started(res_date, old_start):
            raise ConflictError("Η κράτηση έχει ήδη ξεκινήσει και δεν αλλάζει.")
        rules.validate_window(res_date, start, end)
        cur.execute(OVERLAP_SQL + " AND id <> %s", (row["sunbed_id"], res_date, end, start, booking_id))
        if cur.fetchall():
            raise ConflictError("Το νέο διάστημα συμπίπτει με άλλη κράτηση.")
        price = rules.compute_price(row["price"], start, end)
        cur.execute(
            "UPDATE reserves SET res_time = %s, leave_time = %s, price = %s WHERE id = %s",
            (start, end, price, booking_id),
        )
    return get_booking(booking_id, include_code=user_id is not None)


def cancel(booking_id: int, user_id: Optional[int] = None) -> dict:
    """Ακύρωση = αλλαγή status (soft delete). Το ιστορικό μένει για στατιστικά."""
    with db.transaction() as cur:
        row = _load_for_change(cur, booking_id, user_id)
        start = rules.parse_time(rules.fmt_time(row["res_time"]))
        if user_id is not None and rules.has_started(row["res_date"], start):
            raise ConflictError("Δεν μπορείς να ακυρώσεις κράτηση που έχει ήδη ξεκινήσει.")
        cur.execute(
            "UPDATE reserves SET status = 'cancelled', cancelled_at = NOW() WHERE id = %s",
            (booking_id,),
        )
    return get_booking(booking_id, include_code=False)


def list_for_user(user_id: int, scope: str = "upcoming") -> list[dict]:
    rows = db.fetch_all(
        BOOKING_SELECT + " WHERE r.user_id = %s ORDER BY r.res_date DESC, r.res_time DESC",
        (user_id,),
    )
    items = [_present(r, include_code=True) for r in rows]
    if scope == "upcoming":
        items = [b for b in items if b["status"] == "confirmed" and not b["is_past"]]
        items.reverse()  # η πιο κοντινή πρώτη
    elif scope == "past":
        items = [b for b in items if b["status"] == "confirmed" and b["is_past"]]
    elif scope == "cancelled":
        items = [b for b in items if b["status"] == "cancelled"]
    return items


def list_all(
    beach_id: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    status: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = 300,
) -> list[dict]:
    where, params = [], []
    if beach_id:
        where.append("b.id = %s")
        params.append(beach_id)
    if date_from:
        where.append("r.res_date >= %s")
        params.append(date_from)
    if date_to:
        where.append("r.res_date <= %s")
        params.append(date_to)
    if status in ("confirmed", "cancelled"):
        where.append("r.status = %s")
        params.append(status)
    if q:
        where.append("(u.username LIKE %s OR u.email LIKE %s)")
        params += [f"%{q.strip()}%", f"%{q.strip()}%"]
    sql = BOOKING_SELECT
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY r.res_date DESC, r.res_time ASC LIMIT %s"
    params.append(max(1, min(limit, 1000)))
    return [_present(r, include_code=False) for r in db.fetch_all(sql, params)]


def check_in(code: str, require_today: bool) -> dict:
    code = "".join(code.split()).upper()  # δέχεται και "a1b2 c3d4 e5f6"
    with db.transaction() as cur:
        cur.execute(
            "SELECT id, res_date, status, checked_in_at FROM reserves WHERE checkin_code = %s FOR UPDATE",
            (code,),
        )
        row = cur.fetchone()
        if row is None:
            raise NotFoundError("Δεν βρέθηκε κράτηση με αυτόν τον κωδικό.")
        if row["status"] != "confirmed":
            raise ConflictError("Η κράτηση είναι ακυρωμένη.")
        if row["checked_in_at"] is not None:
            raise ConflictError(f"Έχει ήδη γίνει check-in ({row['checked_in_at']:%d/%m %H:%M}).")
        if require_today and row["res_date"] != rules.today():
            raise ConflictError(f"Η κράτηση είναι για {row['res_date']:%d/%m/%Y}, όχι για σήμερα.")
        cur.execute("UPDATE reserves SET checked_in_at = NOW() WHERE id = %s", (row["id"],))
    return get_booking(row["id"])


def list_for_day(day: date, beach_id: Optional[int] = None) -> list[dict]:
    sql = BOOKING_SELECT + " WHERE r.res_date = %s AND r.status = 'confirmed'"
    params: list = [day]
    if beach_id:
        sql += " AND b.id = %s"
        params.append(beach_id)
    sql += " ORDER BY b.name, r.res_time, s.grid_x, s.grid_y"
    return [_present(r, include_code=False) for r in db.fetch_all(sql, params)]
