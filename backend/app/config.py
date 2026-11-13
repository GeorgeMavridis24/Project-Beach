"""Ρυθμίσεις εφαρμογής. Όλες διαβάζονται από μεταβλητές περιβάλλοντος
(ή από το αρχείο backend/.env), ώστε να μην υπάρχουν κωδικοί μέσα στον κώδικα."""

import io
import logging
import os
import secrets
from pathlib import Path

from dotenv import load_dotenv

log = logging.getLogger("smartbeach")

ENV_FILE = Path(__file__).resolve().parents[1] / ".env"  # πάντα backend/.env


def _load_env_file() -> None:
    """Διαβάζει το backend/.env από οποιονδήποτε φάκελο κι αν τρέξει ο server.
    Στα Windows το Notepad μπορεί να το σώσει ως ".env.txt" ή σε UTF-16 - τα
    δεχόμαστε κι αυτά, ώστε να μη "χάνονται" σιωπηλά οι ρυθμίσεις."""
    path = ENV_FILE
    if not path.exists() and ENV_FILE.with_name(".env.txt").exists():
        path = ENV_FILE.with_name(".env.txt")
        print("Προσοχή: το αρχείο λέγεται .env.txt - μετονόμασέ το σε .env")
    if not path.exists():
        print(f"Προσοχή: δεν βρέθηκε το αρχείο ρυθμίσεων {ENV_FILE} - χρησιμοποιούνται προεπιλογές.")
        return
    raw = path.read_bytes()
    encoding = "utf-16" if raw[:2] in (b"\xff\xfe", b"\xfe\xff") else "utf-8-sig"
    load_dotenv(stream=io.StringIO(raw.decode(encoding)))


_load_env_file()


def _bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


class Settings:
    # --- Βάση δεδομένων ---
    db_host = os.getenv("DB_HOST", "127.0.0.1")
    db_port = int(os.getenv("DB_PORT", "3306"))
    db_user = os.getenv("DB_USER", "root")
    db_password = os.getenv("DB_PASSWORD", "")
    db_name = os.getenv("DB_NAME", "smartbeach")
    db_pool_size = min(int(os.getenv("DB_POOL_SIZE", "10")), 32)

    # --- JWT ---
    secret_key = os.getenv("SECRET_KEY", "")
    jwt_algorithm = "HS256"
    access_token_minutes = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "720"))

    # --- Κανόνες κρατήσεων ---
    season_start_month = int(os.getenv("SEASON_START_MONTH", "5"))
    season_end_month = int(os.getenv("SEASON_END_MONTH", "10"))
    # Ωράριο που παίρνει ένα ΝΕΟ κατάστημα (μετά το αλλάζει ο admin / καταστηματάρχης)
    default_open_time = os.getenv("DEFAULT_OPEN_TIME", "08:00")
    default_close_time = os.getenv("DEFAULT_CLOSE_TIME", "20:00")
    min_booking_minutes = int(os.getenv("MIN_BOOKING_MINUTES", "60"))
    # Κράτηση έως τόσες ώρες χρεώνεται ως "μισή μέρα" με έκπτωση.
    half_day_max_hours = float(os.getenv("HALF_DAY_MAX_HOURS", "6"))
    half_day_factor = float(os.getenv("HALF_DAY_FACTOR", "0.6"))
    # Αν False, το προσωπικό μπορεί να κάνει check-in σε κράτηση άλλης ημέρας (για demo).
    checkin_require_today = _bool("CHECKIN_REQUIRE_TODAY", True)

    # --- CORS (για Expo web) ---
    cors_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]

    # --- Email (SMTP). Αν λείπει το SMTP_HOST, τα email αποθηκεύονται ως
    # αρχεία .eml στον φάκελο MAIL_OUTBOX (για δοκιμές χωρίς λογαριασμό email).
    smtp_host = os.getenv("SMTP_HOST", "")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_password = os.getenv("SMTP_PASSWORD", "")
    smtp_ssl = _bool("SMTP_SSL", False)  # True για θύρα 465
    mail_from = os.getenv("MAIL_FROM", "") or os.getenv("SMTP_USER", "") or "SmartBeach <no-reply@smartbeach.local>"
    mail_outbox = os.getenv("MAIL_OUTBOX", "outbox")
    mail_enabled = _bool("MAIL_ENABLED", True)

    # --- AI Βοηθός (Claude API) ---
    assistant_model = os.getenv("ASSISTANT_MODEL", "claude-opus-5-5")
    assistant_effort = os.getenv("ASSISTANT_EFFORT", "low")
    assistant_max_iterations = int(os.getenv("ASSISTANT_MAX_ITERATIONS", "8"))


settings = Settings()

if not settings.secret_key:
    # Χωρίς SECRET_KEY παράγουμε τυχαίο κλειδί: δουλεύει, αλλά τα tokens
    # ακυρώνονται σε κάθε επανεκκίνηση του server.
    settings.secret_key = secrets.token_urlsafe(48)
    log.warning("Δεν ορίστηκε SECRET_KEY - χρησιμοποιείται προσωρινό τυχαίο κλειδί.")
