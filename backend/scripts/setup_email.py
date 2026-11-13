"""Ρύθμιση αποστολής email (τρέχει από το 3-RYTHMISI-EMAIL.bat).

Ρωτάει λογαριασμό Gmail και "κωδικό εφαρμογής", στέλνει δοκιμαστικό email και,
αν πετύχει, αποθηκεύει τις ρυθμίσεις στο backend/.env.
"""

import smtplib
import ssl
import sys
from email.message import EmailMessage

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))
from envfile import ENV, update_env  # noqa: E402

GMAIL = ("smtp.gmail.com", 587)


def ask(question: str, default: str = "") -> str:
    try:
        answer = input(question).strip()
    except EOFError:
        answer = ""
    return answer or default


def send_test(host: str, port: int, user: str, password: str, to: str) -> None:
    msg = EmailMessage()
    msg["Subject"] = "SmartBeach – δοκιμαστικό email"
    msg["From"] = f"SmartBeach <{user}>"
    msg["To"] = to
    msg.set_content("Η αποστολή email από το SmartBeach λειτουργεί! Από τώρα οι κρατήσεις θα έρχονται στο email.")
    context = ssl.create_default_context()
    with smtplib.SMTP(host, port, timeout=20) as server:
        server.starttls(context=context)
        server.login(user, password)
        server.send_message(msg)


def main() -> None:
    print("=" * 60)
    print("  SmartBeach - ρύθμιση αποστολής email (Gmail)")
    print("=" * 60)
    print(
        "\nΧρειάζεσαι έναν λογαριασμό Gmail και έναν «Κωδικό εφαρμογής» (ΟΧΙ τον κανονικό κωδικό):\n"
        "  1. Άνοιξε https://myaccount.google.com/security και ενεργοποίησε την «Επαλήθευση σε 2 βήματα».\n"
        "  2. Άνοιξε https://myaccount.google.com/apppasswords\n"
        "  3. Γράψε ένα όνομα (π.χ. SmartBeach) και πάτα «Δημιουργία».\n"
        "  4. Αντέγραψε τον κωδικό των 16 γραμμάτων που εμφανίζεται.\n"
    )
    user = ask("Το Gmail σου (π.χ. onoma@gmail.com): ")
    if "@" not in user:
        sys.exit("Δεν δόθηκε σωστό email. Τίποτα δεν άλλαξε.")
    host, port = GMAIL
    if not user.lower().endswith(("@gmail.com", "@googlemail.com")):
        print("Δεν είναι Gmail. Γράψε τον server SMTP του παρόχου σου (ή Enter για smtp.gmail.com).")
        host = ask("SMTP server: ", host)
        port = int(ask("Θύρα [587]: ", "587"))
    password = ask("Κωδικός εφαρμογής (16 γράμματα): ").replace(" ", "")
    if not password:
        sys.exit("Δεν δόθηκε κωδικός. Τίποτα δεν άλλαξε.")
    to = ask(f"Σε ποιο email να στείλω δοκιμαστικό; [{user}]: ", user)

    print("\nΣτέλνω δοκιμαστικό email...")
    try:
        send_test(host, port, user, password, to)
    except smtplib.SMTPAuthenticationError:
        sys.exit(
            "Η Google δεν δέχτηκε τον κωδικό. Βεβαιώσου ότι:\n"
            "  * έβαλες «Κωδικό εφαρμογής» (16 γράμματα) και όχι τον κανονικό κωδικό του Gmail\n"
            "  * η «Επαλήθευση σε 2 βήματα» είναι ενεργή\n"
            "Τίποτα δεν άλλαξε - ξανατρέξε το 3-RYTHMISI-EMAIL.bat."
        )
    except Exception as exc:  # noqa: BLE001
        sys.exit(f"Η αποστολή απέτυχε ({exc}). Έλεγξε τη σύνδεση στο internet. Τίποτα δεν άλλαξε.")

    path = update_env(
        {
            "SMTP_HOST": host,
            "SMTP_PORT": str(port),
            "SMTP_USER": user,
            "SMTP_PASSWORD": password,
            "MAIL_FROM": f"SmartBeach <{user}>",
        }
    )
    print(f"\nΤΕΛΕΙΑ! Στάλθηκε δοκιμαστικό στο {to} (δες και τα Ανεπιθύμητα/Spam).")
    print(f"Οι ρυθμίσεις αποθηκεύτηκαν στο {path}.")
    print("Κλείσε και ξανάνοιξε τον server (2-EKKINISI.bat) για να ισχύσουν.")


if __name__ == "__main__":
    if not ENV.exists():
        sys.exit("Δεν βρέθηκε το backend/.env. Τρέξε πρώτα το 1-EGKATASTASI.bat.")
    main()
