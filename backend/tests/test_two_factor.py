"""Επαλήθευση email στην εγγραφή και έλεγχος σε 2 βήματα στη σύνδεση."""

import sys
from pathlib import Path

import pytest

from test_auth import latest_code

BODY = {"username": "Eleni", "email": "eleni@test.gr", "password": "secret123"}


def register(client):
    r = client.post("/auth/register", json=BODY)
    assert r.status_code == 201
    return r.json()


def test_code_is_stored_hashed_and_expires(client, outbox, sql):
    res = register(client)
    assert res["delivery"] == "server_console"  # στα tests δεν υπάρχει SMTP
    code = latest_code(outbox, BODY["email"])
    row = sql("SELECT code_hash FROM auth_codes")[0]
    assert code not in row["code_hash"] and len(row["code_hash"]) == 64
    sql("UPDATE auth_codes SET expires_at = NOW() - INTERVAL 1 MINUTE")
    r = client.post("/auth/verify-email", json={"email": BODY["email"], "code": code})
    assert r.status_code == 400 and "έληξε" in r.json()["detail"]


def test_wrong_code_attempts_are_limited(client, outbox):
    register(client)
    code = latest_code(outbox, BODY["email"])
    wrong = "000000" if code != "000000" else "111111"
    for left in (4, 3, 2, 1):
        r = client.post("/auth/verify-email", json={"email": BODY["email"], "code": wrong})
        assert r.status_code == 400 and f"Απομένουν {left}" in r.json()["detail"]
    client.post("/auth/verify-email", json={"email": BODY["email"], "code": wrong})
    # μετά από 5 λάθη ούτε ο σωστός κωδικός δουλεύει
    r = client.post("/auth/verify-email", json={"email": BODY["email"], "code": code})
    assert r.status_code == 400 and "Πολλές λάθος" in r.json()["detail"]


def test_resend_is_rate_limited_and_invalidates_old_code(client, outbox, sql):
    register(client)
    first = latest_code(outbox, BODY["email"])
    # αμέσως μετά: δεν στέλνεται νέος (όριο 30''), αλλά η απάντηση είναι ίδια
    r = client.post("/auth/resend-code", json={"email": BODY["email"]})
    assert r.status_code == 200 and sql("SELECT COUNT(*) AS n FROM auth_codes")[0]["n"] == 1
    sql("UPDATE auth_codes SET created_at = NOW() - INTERVAL 1 MINUTE")
    client.post("/auth/resend-code", json={"email": BODY["email"]})
    second = latest_code(outbox, BODY["email"])
    if first != second:
        r = client.post("/auth/verify-email", json={"email": BODY["email"], "code": first})
        assert r.status_code == 400
    assert client.post("/auth/verify-email", json={"email": BODY["email"], "code": second}).status_code == 200
    # για άγνωστο email η απάντηση είναι ίδια (δεν φαίνεται ποιοι έχουν λογαριασμό)
    assert client.post("/auth/resend-code", json={"email": "nobody@test.gr"}).json()["sent"] is True


def test_login_with_two_factor(client, make_user, outbox):
    user = make_user(username="kostas")
    h = user["headers"]
    assert client.post("/auth/2fa", json={"enabled": True, "password": "wrong"}, headers=h).status_code == 400
    r = client.post("/auth/2fa", json={"enabled": True, "password": "secret123"}, headers=h)
    assert r.status_code == 200 and r.json()["two_factor_enabled"] is True

    r = client.post("/auth/login", json={"email": user["email"], "password": "secret123"})
    body = r.json()
    assert body["two_factor_required"] is True and "access_token" not in body
    assert body["email_hint"].startswith("ko") and body["email_hint"].endswith("@test.gr")
    # το challenge ΔΕΝ είναι token πρόσβασης
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {body['challenge']}"}).status_code == 401
    assert client.post("/auth/login/verify", json={"challenge": body["challenge"], "code": "123456"}).status_code in (400,)
    code = latest_code(outbox, user["email"])
    r = client.post("/auth/login/verify", json={"challenge": body["challenge"], "code": code})
    assert r.status_code == 200 and r.json()["user"]["two_factor_enabled"] is True
    token = r.json()["access_token"]
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {token}"}).json()["two_factor_enabled"] is True
    # ο ίδιος κωδικός δεν ξαναχρησιμοποιείται
    assert client.post("/auth/login/verify", json={"challenge": body["challenge"], "code": code}).status_code == 400
    assert client.post("/auth/login/verify", json={"challenge": "garbage", "code": code}).status_code == 401

    client.post("/auth/2fa", json={"enabled": False, "password": "secret123"}, headers={"Authorization": f"Bearer {token}"})
    assert "access_token" in client.post("/auth/login", json={"email": user["email"], "password": "secret123"}).json()


def test_create_admin_script(monkeypatch, sql):
    scripts = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(scripts))
    from scripts import create_admin

    answers = iter(["Γιώργος", "Admin@Example.com"])
    passwords = iter(["Str0ng!pass", "Str0ng!pass"])
    monkeypatch.setattr("builtins.input", lambda _: next(answers))
    monkeypatch.setattr(create_admin.getpass, "getpass", lambda _: next(passwords))
    monkeypatch.setattr(sys, "argv", ["create_admin"])
    create_admin.main()
    row = sql("SELECT username, role, email_verified FROM users WHERE email = 'admin@example.com'")[0]
    assert row == {"username": "Γιώργος", "role": "admin", "email_verified": 1}
    # λάθος επιβεβαίωση κωδικού: δεν αλλάζει τίποτα
    answers2 = iter(["Γιώργος", "other@example.com"])
    passwords2 = iter(["abcdef12", "different"])
    monkeypatch.setattr("builtins.input", lambda _: next(answers2))
    monkeypatch.setattr(create_admin.getpass, "getpass", lambda _: next(passwords2))
    with pytest.raises(SystemExit):
        create_admin.main()
    assert not sql("SELECT id FROM users WHERE email = 'other@example.com'")
