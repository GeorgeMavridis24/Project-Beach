"""Κοινές ρυθμίσεις tests.

Τα tests τρέχουν σε ΠΡΑΓΜΑΤΙΚΗ MySQL/MariaDB, σε ξεχωριστή βάση
`smartbeach_test` (ποτέ στη `smartbeach`). Ρυθμίσεις μέσω TEST_DB_*:
    TEST_DB_HOST=127.0.0.1 TEST_DB_USER=root TEST_DB_PASSWORD=... pytest
"""

import os
import re
import tempfile
from pathlib import Path

os.environ["DB_HOST"] = os.getenv("TEST_DB_HOST", "127.0.0.1")
os.environ["DB_PORT"] = os.getenv("TEST_DB_PORT", "3306")
os.environ["DB_USER"] = os.getenv("TEST_DB_USER", "smartbeach")
os.environ["DB_PASSWORD"] = os.getenv("TEST_DB_PASSWORD", "smartbeach")
os.environ["DB_NAME"] = "smartbeach_test"
os.environ["DB_POOL_SIZE"] = "16"
os.environ["SECRET_KEY"] = "test-secret-key-for-pytest-only-0123456789"
os.environ["CHECKIN_REQUIRE_TODAY"] = "true"
os.environ["SMTP_HOST"] = ""
os.environ["MAIL_OUTBOX"] = tempfile.mkdtemp(prefix="smartbeach-outbox-")

import mysql.connector  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import booking_rules  # noqa: E402
from app.main import app  # noqa: E402
from app.security import hash_password  # noqa: E402

SCHEMA = Path(__file__).resolve().parents[2] / "database" / "schema.sql"

# Μια σταθερή ημερομηνία μέσα στη σεζόν, στο μέλλον.
DAY = "2027-06-15"


def _raw_connection(database=None):
    return mysql.connector.connect(
        host=os.environ["DB_HOST"],
        port=int(os.environ["DB_PORT"]),
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
        database=database,
        charset="utf8mb4",
        autocommit=True,
    )


def _statements(sql: str):
    sql = re.sub(r"--[^\n]*", "", sql).replace("smartbeach", "smartbeach_test")
    for stmt in sql.split(";"):
        if stmt.strip():
            yield stmt


@pytest.fixture(scope="session", autouse=True)
def schema():
    conn = _raw_connection()
    cur = conn.cursor()
    for stmt in _statements(SCHEMA.read_text(encoding="utf-8")):
        cur.execute(stmt)
    cur.close()
    conn.close()
    yield


@pytest.fixture()
def sql():
    """Εκτελεί SQL απευθείας στη βάση των tests. Επιστρέφει γραμμές για SELECT."""
    conn = _raw_connection("smartbeach_test")

    def run(query, params=()):
        cur = conn.cursor(dictionary=True)
        cur.execute(query, params)
        rows = cur.fetchall() if cur.with_rows else cur.lastrowid
        cur.close()
        return rows

    yield run
    conn.close()


@pytest.fixture(autouse=True)
def clean(sql):
    from app.routers import bookings as booking_router

    booking_router._sent.clear()  # όριο αποστολών email ανά χρήστη
    sql("SET FOREIGN_KEY_CHECKS = 0")
    for table in ("auth_codes", "partner_messages", "partner_requests", "reserves", "sunbeds", "users"):
        sql(f"TRUNCATE TABLE {table}")
    sql("SET FOREIGN_KEY_CHECKS = 1")
    yield


@pytest.fixture()
def outbox():
    """Ο φάκελος όπου "στέλνονται" τα email στα tests (άδειος σε κάθε test)."""
    folder = Path(os.environ["MAIL_OUTBOX"])
    for f in folder.glob("*.eml"):
        f.unlink()
    return folder


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def beach_ids(sql):
    return [r["id"] for r in sql("SELECT id FROM beaches ORDER BY id")]


@pytest.fixture()
def make_user(sql, client):
    """make_user('admin') -> {'id', 'email', 'headers'}"""
    counter = {"n": 0}

    def make(role="user", username=None):
        counter["n"] += 1
        username = username or f"{role}{counter['n']}"
        email = f"{username}@test.gr"
        user_id = sql(
            "INSERT INTO users (username, email, password, role, email_verified) VALUES (%s, %s, %s, %s, 1)",
            (username, email, hash_password("secret123"), role),
        )
        r = client.post("/auth/login", json={"email": email, "password": "secret123"})
        assert r.status_code == 200, r.text
        token = r.json()["access_token"]
        return {"id": user_id, "email": email, "username": username, "headers": {"Authorization": f"Bearer {token}"}}

    return make


@pytest.fixture()
def grid(client, make_user, beach_ids):
    """Φτιάχνει πλέγμα 3x4 στην πρώτη παραλία: σειρά 1 = VIP 20€, οι άλλες 10€."""
    admin = make_user("admin", "gridadmin")
    r = client.post(
        f"/admin/beaches/{beach_ids[0]}/sunbeds/grid",
        json={"rows": 3, "cols": 4, "premium_rows": 1, "premium_price": 20, "price": 10},
        headers=admin["headers"],
    )
    assert r.status_code == 201, r.text
    sunbeds = client.get(f"/beaches/{beach_ids[0]}/sunbeds", params={"date": DAY}).json()["sunbeds"]
    return {"beach_id": beach_ids[0], "sunbeds": sunbeds, "admin": admin}


@pytest.fixture()
def freeze_now(monkeypatch):
    """freeze_now(datetime(...)) - ορίζει το "τώρα" της εφαρμογής."""

    def set_now(dt):
        monkeypatch.setattr(booking_rules, "now", lambda: dt)

    return set_now
