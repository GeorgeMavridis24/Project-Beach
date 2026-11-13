"""Αυτόματη εγκατάσταση του SmartBeach (τρέχει από το 1-EGKATASTASI.bat).

Κάνει με τη σειρά:
  1. εγκατάσταση πακέτων Python (backend/requirements.txt)
  2. εντοπισμό MySQL/MariaDB που δέχεται σύνδεση (XAMPP ή MySQL Server)
  3. δημιουργία του backend/.env με τις σωστές ρυθμίσεις
  4. δημιουργία της βάσης από το database/schema.sql
  5. δοκιμαστικά δεδομένα (scripts/seed_demo.py)
  6. εγκατάσταση πακέτων της εφαρμογής (npm install)
"""

import re
import secrets
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from envfile import read_env, update_env  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
APP = ROOT / "SmartBeachApp"
SCHEMA = ROOT / "database" / "schema.sql"


def title(text: str) -> None:
    print("\n" + "=" * 60 + f"\n  {text}\n" + "=" * 60)


def ask(question: str, default: str = "") -> str:
    try:
        answer = input(question).strip()
    except EOFError:
        answer = ""
    return answer or default


def install_python_packages() -> None:
    title("1/6  Εγκατάσταση πακέτων Python")
    result = subprocess.run([sys.executable, "-m", "pip", "install", "-q", "-r", str(BACKEND / "requirements.txt")])
    if result.returncode != 0:
        sys.exit("Αποτυχία στο pip install. Στείλε μου το μήνυμα που εμφανίστηκε πιο πάνω.")
    print("OK")


def try_connect(port: int, password: str):
    import mysql.connector

    try:
        return mysql.connector.connect(
            host="127.0.0.1", port=port, user="root", password=password,
            charset="utf8mb4", use_pure=True, connection_timeout=4, autocommit=True,
        )
    except mysql.connector.Error as exc:
        return exc


def find_mysql() -> tuple[int, str]:
    title("2/6  Αναζήτηση MySQL")
    errors = {}
    for port in (3306, 3307):
        conn = try_connect(port, "")
        if not isinstance(conn, Exception):
            conn.close()
            print(f"Βρέθηκε MySQL στη θύρα {port} (χωρίς κωδικό, π.χ. XAMPP).")
            return port, ""
        errors[port] = conn
    # 1045/1698 = "Access denied": υπάρχει MySQL αλλά θέλει κωδικό
    denied = [p for p, e in errors.items() if getattr(e, "errno", None) in (1045, 1698) or getattr(e, "sqlstate", None) == "28000"]
    if denied:
        print(f"Βρέθηκε MySQL στη θύρα {denied[0]} που ζητά κωδικό για τον χρήστη root.")
        print("(Είναι ο κωδικός που έβαλες όταν εγκατέστησες τη MySQL / που χρησιμοποιείς στο Workbench.)")
        for _ in range(3):
            password = ask("Γράψε τον κωδικό και πάτα Enter (ή σκέτο Enter για ακύρωση): ")
            if not password:
                break
            conn = try_connect(denied[0], password)
            if not isinstance(conn, Exception):
                conn.close()
                print("Σωστός κωδικός.")
                return denied[0], password
            print("Λάθος κωδικός, δοκίμασε ξανά.")
    print(
        "\nΔεν μπόρεσα να συνδεθώ σε MySQL. Κάνε ΕΝΑ από τα παρακάτω και ξανάνοιξε το 1-EGKATASTASI.bat:\n"
        "  * XAMPP: άνοιξε το XAMPP Control Panel και πάτα Start στο MySQL (πρέπει να γίνει πράσινο).\n"
        "    Αν λέει ότι η θύρα 3306 είναι πιασμένη: MySQL -> Config -> my.ini, άλλαξε τις δύο γραμμές\n"
        "    port=3306 σε port=3307, αποθήκευσε και πάτα ξανά Start.\n"
        "  * MySQL Workbench: ξανατρέξε και γράψε σωστά τον κωδικό του root."
    )
    sys.exit(1)


def write_env(port: int, password: str) -> None:
    title("3/6  Ρυθμίσεις (backend/.env)")
    current = read_env()
    updates = {"DB_HOST": "127.0.0.1", "DB_PORT": str(port), "DB_USER": "root", "DB_PASSWORD": password, "DB_NAME": "smartbeach"}
    if current.get("SECRET_KEY", "change-me") in ("", "change-me"):
        updates["SECRET_KEY"] = secrets.token_urlsafe(48)
    if "CHECKIN_REQUIRE_TODAY" not in current:
        updates["CHECKIN_REQUIRE_TODAY"] = "false"
    print(f"OK - {update_env(updates)}")


def create_database(port: int, password: str) -> None:
    title("4/6  Δημιουργία βάσης δεδομένων")
    conn = try_connect(port, password)
    cur = conn.cursor()
    cur.execute("SHOW DATABASES LIKE 'smartbeach'")
    if cur.fetchall():
        answer = ask("Υπάρχει ήδη βάση 'smartbeach'. Να σβηστεί και να φτιαχτεί από την αρχή; (ν/ο) [ν]: ", "ν")
        if answer.lower() not in ("ν", "n", "y", "ναι", "yes"):
            print("Η βάση έμεινε όπως ήταν.")
            conn.close()
            return
    sql = re.sub(r"--[^\n]*", "", SCHEMA.read_text(encoding="utf-8"))
    for statement in sql.split(";"):
        if statement.strip():
            cur.execute(statement)
    cur.close()
    conn.close()
    print("OK - η βάση 'smartbeach' είναι έτοιμη.")


def seed() -> None:
    title("5/6  Δοκιμαστικά δεδομένα")
    subprocess.run([sys.executable, "-m", "scripts.seed_demo"], cwd=BACKEND, check=False)


def install_app() -> None:
    title("6/6  Πακέτα εφαρμογής (npm install) - μπορεί να πάρει λίγα λεπτά")
    if not shutil.which("npm"):
        print("Δεν βρέθηκε το Node.js. Εγκατάστησέ το από https://nodejs.org (LTS) και ξανάνοιξε το 1-EGKATASTASI.bat.")
        sys.exit(1)
    result = subprocess.run("npm install --no-audit --no-fund", shell=True, cwd=APP)
    if result.returncode != 0:
        sys.exit("Αποτυχία στο npm install. Στείλε μου το μήνυμα που εμφανίστηκε πιο πάνω.")
    print("OK")


def main() -> None:
    print("SmartBeach - αυτόματη εγκατάσταση")
    install_python_packages()
    port, password = find_mysql()
    write_env(port, password)
    create_database(port, password)
    seed()
    install_app()
    if ask("\nΘέλεις να ρυθμίσεις τώρα την αποστολή email (Gmail); (ν/ο) [ο]: ", "ο").lower() in ("ν", "n", "y", "ναι", "yes"):
        import setup_email

        try:
            setup_email.main()
        except SystemExit as exc:
            print(exc)
    title("ΕΤΟΙΜΟ!")
    print(
        "Τώρα κάνε διπλό κλικ στο 2-EKKINISI.bat.\n"
        "Για αποστολή email αργότερα: διπλό κλικ στο 3-RYTHMISI-EMAIL.bat.\n\n"
        "Λογαριασμοί (κωδικός demo1234):\n"
        "  Πελάτης:          customer1@demo.gr\n"
        "  Καταστηματάρχης:  owner1@smartbeach.gr\n"
        "  Διαχειριστής:     admin@smartbeach.gr\n"
        "  Προσωπικό:        staff@smartbeach.gr"
    )


if __name__ == "__main__":
    main()
