"""Αιτήσεις συνεργατών ("Γίνε επαγγελματίας") και επικοινωνία με τον διαχειριστή.

Ροή:
  1. Ο χρήστης περιγράφει τον χώρο του (θέση, ωράριο, διάταξη ξαπλωστρών) και
     υποβάλλει αίτηση. Μπορεί να τη διορθώσει ή να την ακυρώσει όσο εκκρεμεί.
  2. Αιτών και διαχειριστής ανταλλάσσουν μηνύματα πάνω στην αίτηση.
  3. Ο διαχειριστής εγκρίνει: σε ΕΝΑ transaction δημιουργούνται το κατάστημα,
     οι ξαπλώστρες και ο χρήστης γίνεται καταστηματάρχης. Ή απορρίπτει με σχόλιο.
"""

from datetime import datetime
from typing import Optional

from .. import booking_rules as rules
from .. import db
from ..errors import ConflictError, NotFoundError
from ..schemas import PartnerRequestIn

REQUEST_SELECT = """
    SELECT pr.id, pr.user_id, pr.business_name, pr.description, pr.phone, pr.ltd, pr.lgd,
           TIME_FORMAT(pr.open_time, '%H:%i') AS open_time,
           TIME_FORMAT(pr.close_time, '%H:%i') AS close_time,
           pr.grid_rows, pr.grid_cols, pr.premium_rows, pr.premium_price, pr.price,
           pr.status, pr.admin_note, pr.beach_id, pr.unread_user, pr.unread_admin,
           pr.created_at, pr.decided_at,
           u.username, u.email, u.role AS user_role
    FROM partner_requests pr JOIN users u ON u.id = pr.user_id
"""


def _iso(v) -> Optional[str]:
    return v.isoformat() if isinstance(v, datetime) else v


def _present(row: dict, messages: Optional[list[dict]] = None) -> dict:
    item = {
        "id": row["id"],
        "user_id": row["user_id"],
        "username": row["username"],
        "email": row["email"],
        "user_role": row["user_role"],
        "business_name": row["business_name"],
        "description": row["description"] or "",
        "phone": row["phone"],
        "ltd": float(row["ltd"]),
        "lgd": float(row["lgd"]),
        "open_time": row["open_time"],
        "close_time": row["close_time"],
        "rows": row["grid_rows"],
        "cols": row["grid_cols"],
        "premium_rows": row["premium_rows"],
        "premium_price": float(row["premium_price"]),
        "price": float(row["price"]),
        "total_sunbeds": row["grid_rows"] * row["grid_cols"],
        "status": row["status"],
        "admin_note": row["admin_note"],
        "beach_id": row["beach_id"],
        "unread_user": row["unread_user"],
        "unread_admin": row["unread_admin"],
        "created_at": _iso(row["created_at"]),
        "decided_at": _iso(row["decided_at"]),
    }
    if messages is not None:
        item["messages"] = messages
    return item


def _messages(request_id: int) -> list[dict]:
    rows = db.fetch_all(
        """SELECT m.id, m.sender_id, m.body, m.created_at, u.username AS sender_name, u.role AS sender_role
           FROM partner_messages m LEFT JOIN users u ON u.id = m.sender_id
           WHERE m.request_id = %s ORDER BY m.created_at, m.id""",
        (request_id,),
    )
    return [
        {
            "id": r["id"],
            "sender_id": r["sender_id"],
            "sender_name": r["sender_name"] or "SmartBeach",
            "sender_role": r["sender_role"],
            "is_system": r["sender_id"] is None,
            "body": r["body"],
            "created_at": _iso(r["created_at"]),
        }
        for r in rows
    ]


def get(request_id: int, with_messages: bool = True) -> dict:
    row = db.fetch_one(REQUEST_SELECT + " WHERE pr.id = %s", (request_id,))
    if row is None:
        raise NotFoundError("Η αίτηση δεν βρέθηκε.")
    return _present(row, _messages(request_id) if with_messages else None)


def _own(cur, request_id: int, user_id: int) -> dict:
    cur.execute("SELECT id, user_id, status FROM partner_requests WHERE id = %s FOR UPDATE", (request_id,))
    row = cur.fetchone()
    if row is None or row["user_id"] != user_id:
        raise NotFoundError("Η αίτηση δεν βρέθηκε.")
    return row


def _validate(data: PartnerRequestIn) -> None:
    rules.validate_hours(rules.parse_time(data.open_time), rules.parse_time(data.close_time))


def _fields(data: PartnerRequestIn) -> tuple:
    return (
        data.business_name, data.description, data.phone, data.ltd, data.lgd, data.open_time, data.close_time,
        data.rows, data.cols, data.premium_rows, data.premium_price, data.price,
    )


# ------------------------------------------------------------------ χρήστης
def list_for_user(user_id: int, mark_read: bool = False) -> list[dict]:
    if mark_read:
        db.execute("UPDATE partner_requests SET unread_user = 0 WHERE user_id = %s", (user_id,))
    rows = db.fetch_all(REQUEST_SELECT + " WHERE pr.user_id = %s ORDER BY pr.created_at DESC, pr.id DESC", (user_id,))
    return [_present(r, _messages(r["id"])) for r in rows]


def create(user: dict, data: PartnerRequestIn) -> dict:
    if user["role"] == "admin":
        raise ConflictError("Ο διαχειριστής δεν χρειάζεται αίτηση - μπορεί να προσθέσει κατάστημα απευθείας.")
    _validate(data)
    with db.transaction() as cur:
        cur.execute("SELECT id FROM users WHERE id = %s FOR UPDATE", (user["id"],))
        cur.fetchall()
        cur.execute("SELECT id FROM partner_requests WHERE user_id = %s AND status = 'pending'", (user["id"],))
        if cur.fetchall():
            raise ConflictError("Έχεις ήδη μια αίτηση σε εξέλιξη. Μπορείς να τη διορθώσεις από το Προφίλ.")
        cur.execute(
            """INSERT INTO partner_requests (business_name, description, phone, ltd, lgd, open_time, close_time,
                                             grid_rows, grid_cols, premium_rows, premium_price, price, user_id)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            _fields(data) + (user["id"],),
        )
        request_id = cur.lastrowid
        if data.message and data.message.strip():
            cur.execute(
                "INSERT INTO partner_messages (request_id, sender_id, body) VALUES (%s, %s, %s)",
                (request_id, user["id"], data.message.strip()),
            )
            cur.execute("UPDATE partner_requests SET unread_admin = 1 WHERE id = %s", (request_id,))
    return get(request_id)


def update(user: dict, request_id: int, data: PartnerRequestIn) -> dict:
    _validate(data)
    with db.transaction() as cur:
        row = _own(cur, request_id, user["id"])
        if row["status"] != "pending":
            raise ConflictError("Η αίτηση έχει ήδη απαντηθεί και δεν αλλάζει.")
        cur.execute(
            """UPDATE partner_requests SET business_name = %s, description = %s, phone = %s, ltd = %s, lgd = %s,
                      open_time = %s, close_time = %s, grid_rows = %s, grid_cols = %s, premium_rows = %s,
                      premium_price = %s, price = %s, unread_admin = unread_admin + 1
               WHERE id = %s""",
            _fields(data) + (request_id,),
        )
        cur.execute(
            "INSERT INTO partner_messages (request_id, sender_id, body) VALUES (%s, NULL, %s)",
            (request_id, "Ο αιτών ενημέρωσε τα στοιχεία της αίτησης."),
        )
    return get(request_id)


def withdraw(user: dict, request_id: int) -> None:
    with db.transaction() as cur:
        row = _own(cur, request_id, user["id"])
        if row["status"] != "pending":
            raise ConflictError("Η αίτηση έχει ήδη απαντηθεί.")
        cur.execute("DELETE FROM partner_requests WHERE id = %s", (request_id,))


def add_message(user: dict, request_id: int, body: str) -> dict:
    """Μήνυμα από τον αιτούντα (μόνο στη δική του αίτηση) ή από admin (σε οποιαδήποτε)."""
    is_admin = user["role"] == "admin"
    with db.transaction() as cur:
        cur.execute("SELECT id, user_id FROM partner_requests WHERE id = %s FOR UPDATE", (request_id,))
        row = cur.fetchone()
        if row is None or (not is_admin and row["user_id"] != user["id"]):
            raise NotFoundError("Η αίτηση δεν βρέθηκε.")
        cur.execute(
            "INSERT INTO partner_messages (request_id, sender_id, body) VALUES (%s, %s, %s)",
            (request_id, user["id"], body),
        )
        counter = "unread_user" if is_admin else "unread_admin"
        cur.execute(f"UPDATE partner_requests SET {counter} = {counter} + 1 WHERE id = %s", (request_id,))
    return get(request_id)


# ------------------------------------------------------------------ διαχειριστής
def admin_list(status: Optional[str] = None) -> list[dict]:
    sql = REQUEST_SELECT
    params: list = []
    if status in ("pending", "approved", "rejected"):
        sql += " WHERE pr.status = %s"
        params.append(status)
    sql += " ORDER BY pr.status = 'pending' DESC, pr.created_at DESC"
    items = [_present(r) for r in db.fetch_all(sql, params)]
    counts = {
        r["request_id"]: int(r["n"])
        for r in db.fetch_all("SELECT request_id, COUNT(*) AS n FROM partner_messages GROUP BY request_id")
    }
    for item in items:
        item["message_count"] = counts.get(item["id"], 0)
    return items


def admin_get(request_id: int) -> dict:
    db.execute("UPDATE partner_requests SET unread_admin = 0 WHERE id = %s", (request_id,))
    return get(request_id)


def approve(request_id: int, note: Optional[str]) -> dict:
    """Έγκριση: δημιουργεί κατάστημα + ξαπλώστρες και κάνει τον χρήστη καταστηματάρχη."""
    with db.transaction() as cur:
        cur.execute(
            """SELECT pr.*, u.role AS user_role FROM partner_requests pr JOIN users u ON u.id = pr.user_id
               WHERE pr.id = %s FOR UPDATE""",
            (request_id,),
        )
        r = cur.fetchone()
        if r is None:
            raise NotFoundError("Η αίτηση δεν βρέθηκε.")
        if r["status"] != "pending":
            raise ConflictError("Η αίτηση έχει ήδη απαντηθεί.")
        cur.execute(
            """INSERT INTO beaches (name, description, ltd, lgd, open_time, close_time, owner_id)
               VALUES (%s, %s, %s, %s, %s, %s, %s)""",
            (r["business_name"], r["description"], r["ltd"], r["lgd"], r["open_time"], r["close_time"], r["user_id"]),
        )
        beach_id = cur.lastrowid
        sunbeds = []
        for x in range(1, r["grid_rows"] + 1):
            vip = x <= r["premium_rows"]
            for y in range(1, r["grid_cols"] + 1):
                sunbeds.append(
                    (beach_id, x, y, r["premium_price"] if vip else r["price"], "premium" if vip else "normal")
                )
        cur.executemany(
            "INSERT INTO sunbeds (beach_id, grid_x, grid_y, price, type) VALUES (%s, %s, %s, %s, %s)", sunbeds
        )
        if r["user_role"] != "admin":
            cur.execute("UPDATE users SET role = 'owner' WHERE id = %s", (r["user_id"],))
        cur.execute(
            """UPDATE partner_requests SET status = 'approved', beach_id = %s, admin_note = %s,
                      decided_at = NOW(), unread_user = unread_user + 1 WHERE id = %s""",
            (beach_id, note, request_id),
        )
        text = (
            f"Η αίτηση εγκρίθηκε! Το «{r['business_name']}» δημιουργήθηκε με {len(sunbeds)} ξαπλώστρες. "
            "Από το Προφίλ → «Το κατάστημά μου» μπορείς να αλλάξεις ωράριο, τιμές και διάταξη."
        )
        cur.execute("INSERT INTO partner_messages (request_id, sender_id, body) VALUES (%s, NULL, %s)", (request_id, text))
    return get(request_id)


def reject(request_id: int, note: Optional[str]) -> dict:
    with db.transaction() as cur:
        cur.execute("SELECT status FROM partner_requests WHERE id = %s FOR UPDATE", (request_id,))
        r = cur.fetchone()
        if r is None:
            raise NotFoundError("Η αίτηση δεν βρέθηκε.")
        if r["status"] != "pending":
            raise ConflictError("Η αίτηση έχει ήδη απαντηθεί.")
        cur.execute(
            """UPDATE partner_requests SET status = 'rejected', admin_note = %s, decided_at = NOW(),
                      unread_user = unread_user + 1 WHERE id = %s""",
            (note, request_id),
        )
        text = "Η αίτηση δεν εγκρίθηκε." + (f" Σχόλιο διαχειριστή: {note}" if note else "")
        cur.execute("INSERT INTO partner_messages (request_id, sender_id, body) VALUES (%s, NULL, %s)", (request_id, text))
    return get(request_id)


def admin_emails() -> list[str]:
    return [r["email"] for r in db.fetch_all("SELECT email FROM users WHERE role = 'admin'")]
