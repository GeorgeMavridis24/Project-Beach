"""Δημιουργεί (ή αναβαθμίζει) λογαριασμό διαχειριστή ή προσωπικού.

Η εφαρμογή ΔΕΝ επιτρέπει σε κανέναν να γίνει admin μέσω εγγραφής, οπότε ο
διαχειριστής φτιάχνεται από εδώ. Χωρίς παραμέτρους ρωτάει όνομα, email και
κωδικό (ο κωδικός δεν φαίνεται όσο τον γράφεις και δεν αποθηκεύεται πουθενά
αλλού εκτός από τη βάση, ως bcrypt hash):

    python -m scripts.create_admin
    python -m scripts.create_admin --email staff@smartbeach.gr --name Είσοδος --role staff

Ή με διπλό κλικ στο 4-NEOS-DIAXEIRISTIS.bat.
"""

import argparse
import getpass
import re

from app import db
from app.security import hash_password

EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def ask(question: str) -> str:
    try:
        return input(question).strip()
    except EOFError:
        return ""


def save_admin(name: str, email: str, password: str, role: str = "admin") -> str:
    """Φτιάχνει ή αναβαθμίζει τον λογαριασμό (επαληθευμένο, χωρίς ανάγκη κωδικού email)."""
    email = email.strip().lower()
    existing = db.fetch_one("SELECT id FROM users WHERE email = %s", (email,))
    if existing:
        db.execute(
            "UPDATE users SET username = %s, role = %s, password = %s, email_verified = 1 WHERE id = %s",
            (name, role, hash_password(password), existing["id"]),
        )
        return f"Ο λογαριασμός {email} ενημερώθηκε και είναι πλέον {role}."
    db.execute(
        "INSERT INTO users (username, email, password, role, email_verified) VALUES (%s, %s, %s, %s, 1)",
        (name, email, hash_password(password), role),
    )
    return f"Δημιουργήθηκε λογαριασμός {role}: {email}"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--email")
    parser.add_argument("--name")
    parser.add_argument("--role", choices=["admin", "staff"], default="admin")
    parser.add_argument("--password", help="Αν λείπει, ζητείται από το πληκτρολόγιο (χωρίς να φαίνεται).")
    args = parser.parse_args()

    print("Λογαριασμός διαχειριστή" if args.role == "admin" else "Λογαριασμός προσωπικού")
    name = args.name or ask("Όνομα (π.χ. Γιώργος): ")
    email = args.email or ask("Email: ")
    if len(name) < 2 or not EMAIL.match(email or ""):
        raise SystemExit("Χρειάζεται όνομα και σωστό email. Τίποτα δεν άλλαξε.")

    password = args.password
    if not password:
        print("(Ο κωδικός ΔΕΝ φαίνεται όσο τον γράφεις - είναι φυσιολογικό.)")
        password = getpass.getpass("Κωδικός: ")
        if getpass.getpass("Ξανά ο κωδικός: ") != password:
            raise SystemExit("Οι δύο κωδικοί δεν ταιριάζουν. Τίποτα δεν άλλαξε.")
    if len(password) < 6:
        raise SystemExit("Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες. Τίποτα δεν άλλαξε.")

    print(save_admin(name, email, password, args.role))


if __name__ == "__main__":
    main()
