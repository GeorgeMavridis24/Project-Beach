"""Δημιουργεί (ή αναβαθμίζει) λογαριασμό διαχειριστή ή προσωπικού.

Η εφαρμογή ΔΕΝ επιτρέπει σε κανέναν να γίνει admin μέσω εγγραφής, οπότε ο
πρώτος admin φτιάχνεται από εδώ (μέσα στον φάκελο backend/):

    python -m scripts.create_admin --email admin@smartbeach.gr --name Admin
    python -m scripts.create_admin --email staff@smartbeach.gr --name Είσοδος --role staff
"""

import argparse
import getpass

from app import db
from app.security import hash_password


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", default="Admin")
    parser.add_argument("--role", choices=["admin", "staff"], default="admin")
    parser.add_argument("--password", help="Αν λείπει, ζητείται από το πληκτρολόγιο.")
    args = parser.parse_args()

    password = args.password or getpass.getpass("Κωδικός: ")
    if len(password) < 6:
        raise SystemExit("Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες.")
    email = args.email.strip().lower()

    existing = db.fetch_one("SELECT id FROM users WHERE email = %s", (email,))
    if existing:
        db.execute(
            "UPDATE users SET role = %s, password = %s WHERE id = %s",
            (args.role, hash_password(password), existing["id"]),
        )
        print(f"Ο χρήστης {email} έγινε {args.role}.")
    else:
        db.execute(
            "INSERT INTO users (username, email, password, role) VALUES (%s, %s, %s, %s)",
            (args.name, email, hash_password(password), args.role),
        )
        print(f"Δημιουργήθηκε {args.role}: {email}")


if __name__ == "__main__":
    main()
