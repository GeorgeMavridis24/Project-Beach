"""Ανάγνωση / ενημέρωση του backend/.env χωρίς να χάνονται άλλες ρυθμίσεις.
Το χρησιμοποιούν τα setup_all.py και setup_email.py."""

from pathlib import Path

ENV = Path(__file__).resolve().parents[1] / ".env"


def read_env() -> dict:
    path = ENV if ENV.exists() else ENV.with_name(".env.txt")
    if not path.exists():
        return {}
    raw = path.read_bytes()
    text = raw.decode("utf-16" if raw[:2] in (b"\xff\xfe", b"\xfe\xff") else "utf-8-sig", errors="replace")
    values = {}
    for line in text.splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip()
    return values


def update_env(updates: dict) -> Path:
    """Γράφει τις τιμές στο .env (UTF-8), κρατώντας όσες υπάρχουν ήδη."""
    values = read_env()
    values.update(updates)
    lines = ["# Ρυθμίσεις SmartBeach (δες και το .env.example)"] + [f"{k}={v}" for k, v in values.items()]
    ENV.write_text("\n".join(lines) + "\n", encoding="utf-8")
    stray = ENV.with_name(".env.txt")
    if stray.exists():
        stray.unlink()
    return ENV
