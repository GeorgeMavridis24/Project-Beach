"""Κωδικοί μίας χρήσης (6 ψηφία) για επαλήθευση email και έλεγχο σε 2 βήματα.

Ασφάλεια:
  * στη βάση αποθηκεύεται μόνο HMAC-SHA256 του κωδικού (όχι ο ίδιος ο κωδικός)
  * λήγει σε 10 λεπτά, ακυρώνεται μετά από 5 λάθος προσπάθειες
  * κάθε νέος κωδικός ακυρώνει τους προηγούμενους
  * όριο αποστολών: 1 ανά 30'' και 6 την ώρα ανά χρήστη
"""

import hashlib
import hmac
import secrets
from typing import Optional

from .. import db
from ..config import settings

TTL_MINUTES = 10
MAX_ATTEMPTS = 5
RESEND_SECONDS = 30
MAX_PER_HOUR = 6


class InvalidCodeError(Exception):
    """Λάθος / ληγμένος κωδικός (400). Το μήνυμα εμφανίζεται στον χρήστη."""


def _hash(user_id: int, purpose: str, code: str) -> str:
    msg = f"{user_id}:{purpose}:{code}".encode()
    return hmac.new(settings.secret_key.encode(), msg, hashlib.sha256).hexdigest()


def issue(user_id: int, purpose: str) -> Optional[str]:
    """Δημιουργεί νέο κωδικό. Επιστρέφει None αν ξεπεράστηκε το όριο αποστολών."""
    with db.transaction() as cur:
        cur.execute("SELECT id FROM users WHERE id = %s FOR UPDATE", (user_id,))
        cur.fetchall()
        cur.execute(
            """SELECT SUM(created_at > NOW() - INTERVAL %s SECOND) AS recent,
                      SUM(created_at > NOW() - INTERVAL 1 HOUR) AS hour
               FROM auth_codes WHERE user_id = %s AND purpose = %s""",
            (RESEND_SECONDS, user_id, purpose),
        )
        stats = cur.fetchone() or {}
        if int(stats.get("recent") or 0) or int(stats.get("hour") or 0) >= MAX_PER_HOUR:
            return None
        cur.execute(
            "UPDATE auth_codes SET used_at = NOW() WHERE user_id = %s AND purpose = %s AND used_at IS NULL",
            (user_id, purpose),
        )
        code = f"{secrets.randbelow(1_000_000):06d}"
        cur.execute(
            """INSERT INTO auth_codes (user_id, purpose, code_hash, expires_at)
               VALUES (%s, %s, %s, NOW() + INTERVAL %s MINUTE)""",
            (user_id, purpose, _hash(user_id, purpose, code), TTL_MINUTES),
        )
    return code


def check(user_id: int, purpose: str, code: str) -> None:
    """Ελέγχει τον κωδικό. Σε επιτυχία τον "καίει". Αλλιώς πετάει InvalidCodeError."""
    error: Optional[str] = None
    with db.transaction() as cur:
        cur.execute(
            """SELECT id, code_hash, attempts, expires_at < NOW() AS expired FROM auth_codes
               WHERE user_id = %s AND purpose = %s AND used_at IS NULL
               ORDER BY id DESC LIMIT 1 FOR UPDATE""",
            (user_id, purpose),
        )
        row = cur.fetchone()
        if row is None or row["expired"]:
            error = "Ο κωδικός έληξε ή δεν υπάρχει. Πάτα «Στείλε νέο κωδικό»."
        elif row["attempts"] >= MAX_ATTEMPTS:
            error = "Πολλές λάθος προσπάθειες. Πάτα «Στείλε νέο κωδικό»."
        elif not hmac.compare_digest(row["code_hash"], _hash(user_id, purpose, code.strip())):
            cur.execute("UPDATE auth_codes SET attempts = attempts + 1 WHERE id = %s", (row["id"],))
            left = MAX_ATTEMPTS - row["attempts"] - 1
            error = f"Λάθος κωδικός. Απομένουν {left} προσπάθειες." if left else "Λάθος κωδικός. Πάτα «Στείλε νέο κωδικό»."
        else:
            cur.execute("UPDATE auth_codes SET used_at = NOW() WHERE id = %s", (row["id"],))
    # Το σφάλμα πετιέται ΜΕΤΑ το commit, ώστε να μετρήσει η λάθος προσπάθεια.
    if error:
        raise InvalidCodeError(error)


def delivery() -> str:
    """'email' όταν υπάρχει SMTP, αλλιώς 'server_console' (ο κωδικός φαίνεται στο παράθυρο του server)."""
    return "email" if settings.smtp_host else "server_console"
