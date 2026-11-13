"""Αιτήσεις συνεργατών (επικοινωνία, έγκριση) και αποστολή κράτησης σε email."""

import email
import sys
from email import policy
from pathlib import Path

import pytest

from conftest import DAY

APPLICATION = {
    "business_name": "Kymata Beach Bar",
    "description": "Οικογενειακό beach bar",
    "phone": "6912345678",
    "ltd": 40.2569,
    "lgd": 23.1985,
    "open_time": "09:00",
    "close_time": "20:30",
    "rows": 3,
    "cols": 5,
    "premium_rows": 1,
    "premium_price": 22,
    "price": 11,
    "message": "Καλησπέρα, θέλουμε να μπούμε στην εφαρμογή!",
}


def mails(folder):
    return [email.message_from_bytes(f.read_bytes(), policy=policy.default) for f in sorted(folder.glob("*.eml"))]


@pytest.fixture()
def people(make_user):
    return {"admin": make_user("admin", "boss"), "maria": make_user(username="maria"), "nikos": make_user(username="nikos")}


# ------------------------------------------------------------- αιτήσεις
def test_apply_validation_and_single_pending(client, people):
    h = people["maria"]["headers"]
    assert client.post("/partner/requests", json={**APPLICATION, "premium_rows": 9}, headers=h).status_code == 422
    assert client.post("/partner/requests", json={**APPLICATION, "close_time": "08:00"}, headers=h).status_code == 422
    assert client.post("/partner/requests", json={**APPLICATION, "phone": "abc"}, headers=h).status_code == 422
    r = client.post("/partner/requests", json=APPLICATION, headers=h)
    assert r.status_code == 201, r.text
    req = r.json()
    assert req["status"] == "pending" and req["total_sunbeds"] == 15 and req["unread_admin"] == 1
    assert [m["body"] for m in req["messages"]] == [APPLICATION["message"]]
    # δεύτερη αίτηση όσο εκκρεμεί η πρώτη: όχι
    assert client.post("/partner/requests", json=APPLICATION, headers=h).status_code == 409
    # ο admin δεν κάνει αίτηση
    assert client.post("/partner/requests", json=APPLICATION, headers=people["admin"]["headers"]).status_code == 409


def test_messages_between_applicant_and_admin(client, people, outbox):
    maria, admin, nikos = people["maria"], people["admin"], people["nikos"]
    req = client.post("/partner/requests", json=APPLICATION, headers=maria["headers"]).json()
    rid = req["id"]
    new_request_mail = [m for m in mails(outbox) if "Νέα αίτηση" in m["Subject"]]
    assert len(new_request_mail) == 1 and new_request_mail[0]["To"] == admin["email"]

    # άλλος χρήστης δεν βλέπει / δεν γράφει
    assert client.post(f"/partner/requests/{rid}/messages", json={"body": "hi"}, headers=nikos["headers"]).status_code == 404
    assert client.get(f"/admin/partner-requests/{rid}", headers=nikos["headers"]).status_code == 403

    # admin βλέπει (μηδενίζονται τα αδιάβαστα του admin) και απαντά
    detail = client.get(f"/admin/partner-requests/{rid}", headers=admin["headers"]).json()
    assert detail["business_name"] == "Kymata Beach Bar"
    assert client.get("/admin/partner-requests", headers=admin["headers"]).json()[0]["unread_admin"] == 0
    r = client.post(f"/partner/requests/{rid}/messages", json={"body": "Στείλτε μας φωτογραφίες;"}, headers=admin["headers"])
    assert r.status_code == 200 and r.json()["unread_user"] == 1
    assert any("Νέο μήνυμα από το SmartBeach" in m["Subject"] and m["To"] == maria["email"] for m in mails(outbox))

    mine = client.get("/partner/requests/me", params={"mark_read": True}, headers=maria["headers"]).json()
    assert [m["body"] for m in mine[0]["messages"]][-1] == "Στείλτε μας φωτογραφίες;"
    assert client.get("/partner/requests/me", headers=maria["headers"]).json()[0]["unread_user"] == 0


def test_edit_and_withdraw_while_pending(client, people):
    h = people["maria"]["headers"]
    rid = client.post("/partner/requests", json=APPLICATION, headers=h).json()["id"]
    r = client.put(f"/partner/requests/{rid}", json={**APPLICATION, "rows": 5}, headers=h)
    assert r.status_code == 200 and r.json()["total_sunbeds"] == 25
    assert r.json()["messages"][-1]["is_system"] is True
    assert client.put(f"/partner/requests/{rid}", json=APPLICATION, headers=people["nikos"]["headers"]).status_code == 404
    assert client.delete(f"/partner/requests/{rid}", headers=h).status_code == 200
    assert client.get("/partner/requests/me", headers=h).json() == []


def test_approve_creates_shop_and_owner(client, people, outbox, sql):
    maria, admin = people["maria"], people["admin"]
    rid = client.post("/partner/requests", json=APPLICATION, headers=maria["headers"]).json()["id"]
    assert client.post(f"/admin/partner-requests/{rid}/approve", json={}, headers=maria["headers"]).status_code == 403
    r = client.post(f"/admin/partner-requests/{rid}/approve", json={"note": "Καλώς ήρθατε!"}, headers=admin["headers"])
    assert r.status_code == 200, r.text
    req = r.json()
    assert req["status"] == "approved" and req["beach_id"] and req["unread_user"] == 1

    beach = client.get(f"/beaches/{req['beach_id']}").json()
    assert (beach["name"], beach["open_time"], beach["close_time"], beach["owner_id"]) == (
        "Kymata Beach Bar", "09:00", "20:30", maria["id"])
    sunbeds = client.get(f"/beaches/{req['beach_id']}/sunbeds", params={"date": DAY}).json()["sunbeds"]
    assert len(sunbeds) == 15 and sum(s["type"] == "premium" for s in sunbeds) == 5
    assert {s["price"] for s in sunbeds} == {22.0, 11.0}
    assert sql("SELECT role FROM users WHERE id = %s", (maria["id"],))[0]["role"] == "owner"

    # αμέσως μετά μπορεί να διαχειριστεί το κατάστημά της (ο ρόλος διαβάζεται από τη βάση)
    body = {"name": "Kymata", "description": "", "ltd": 40.25, "lgd": 23.19, "open_time": "08:30", "close_time": "21:00"}
    assert client.put(f"/admin/beaches/{req['beach_id']}", json=body, headers=maria["headers"]).status_code == 200
    assert any("εγκρίθηκε" in m["Subject"] and m["To"] == maria["email"] for m in mails(outbox))
    # δεν εγκρίνεται δεύτερη φορά
    assert client.post(f"/admin/partner-requests/{rid}/approve", json={}, headers=admin["headers"]).status_code == 409


def test_reject_with_note(client, people, outbox):
    maria, admin = people["maria"], people["admin"]
    rid = client.post("/partner/requests", json=APPLICATION, headers=maria["headers"]).json()["id"]
    r = client.post(f"/admin/partner-requests/{rid}/reject", json={"note": "Λείπει άδεια λειτουργίας."}, headers=admin["headers"])
    assert r.status_code == 200 and r.json()["status"] == "rejected"
    assert "άδεια λειτουργίας" in r.json()["messages"][-1]["body"]
    mail = next(m for m in mails(outbox) if m["To"] == maria["email"] and "αίτησή σου" in m["Subject"])
    assert "άδεια λειτουργίας" in mail.get_body(preferencelist=("plain",)).get_content()
    # μετά την απόρριψη μπορεί να κάνει νέα αίτηση
    assert client.post("/partner/requests", json=APPLICATION, headers=maria["headers"]).status_code == 201
    pending = client.get("/admin/partner-requests", params={"status": "pending"}, headers=admin["headers"]).json()
    assert len(pending) == 1


# ------------------------------------------------------------- email κράτησης
def _book(client, user, sid):
    r = client.post("/bookings", json={"sunbed_id": sid, "res_date": DAY, "start_time": "10:00", "end_time": "13:00"},
                    headers=user["headers"])
    assert r.status_code == 201
    return r.json()


def test_send_booking_to_email(client, grid, make_user, outbox):
    user, other = make_user(username="eleni"), make_user()
    booking = _book(client, user, grid["sunbeds"][0]["id"])
    for f in outbox.glob("*.eml"):
        f.unlink()
    url = f"/bookings/{booking['booking_id']}/email"

    r = client.post(url, json={}, headers=user["headers"])
    assert r.status_code == 200 and r.json()["sent"] is False and "3-RYTHMISI-EMAIL" in r.json()["detail"]
    r = client.post(url, json={"to": "Friend@Example.com"}, headers=user["headers"])
    assert r.json()["to"] == "friend@example.com"
    msgs = mails(outbox)
    assert [m["To"] for m in msgs] == [user["email"], "friend@example.com"]
    assert "Η κράτησή σου" in msgs[0]["Subject"] and "Κράτηση ξαπλώστρας" in msgs[1]["Subject"]
    assert all(any(p.get_content_type() == "image/png" for p in m.walk()) for m in msgs)

    assert client.post(url, json={"to": "not-an-email"}, headers=user["headers"]).status_code == 422
    assert client.post(url, json={}, headers=other["headers"]).status_code == 404
    for _ in range(8):
        client.post(url, json={}, headers=user["headers"])
    assert client.post(url, json={}, headers=user["headers"]).status_code == 429


def test_send_booking_email_with_smtp(monkeypatch, client, grid, make_user):
    from app import mailer
    from app.routers import bookings as booking_router

    sent = []

    class FakeSMTP:
        def __init__(self, *a, **k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def starttls(self, context=None):
            pass

        def login(self, *a):
            pass

        def send_message(self, msg):
            sent.append(msg["To"])

    user = make_user()
    booking = _book(client, user, grid["sunbeds"][1]["id"])
    sent.clear()
    monkeypatch.setattr(mailer.settings, "smtp_host", "smtp.gmail.com")
    monkeypatch.setattr(booking_router.settings, "smtp_host", "smtp.gmail.com")
    monkeypatch.setattr(mailer.smtplib, "SMTP", FakeSMTP)
    r = client.post(f"/bookings/{booking['booking_id']}/email", json={}, headers=user["headers"])
    assert r.json() == {"sent": True, "to": user["email"], "detail": f"Η κράτηση στάλθηκε στο {user['email']}."}
    assert sent == [user["email"]]
    assert client.get("/config").json()["email_enabled"] is True


# ------------------------------------------------------------- εργαλείο ρύθμισης email
def test_email_setup_tool_writes_env(monkeypatch, tmp_path):
    scripts = Path(__file__).resolve().parents[1] / "scripts"
    sys.path.insert(0, str(scripts))
    import envfile
    import setup_email

    env = tmp_path / ".env"
    env.write_text("DB_PORT=3307\nSECRET_KEY=abc\n", encoding="utf-8")
    monkeypatch.setattr(envfile, "ENV", env)
    monkeypatch.setattr(setup_email, "update_env", envfile.update_env)
    answers = iter(["me@gmail.com", "abcd efgh ijkl mnop", ""])
    monkeypatch.setattr("builtins.input", lambda _: next(answers))
    calls = []
    monkeypatch.setattr(setup_email, "send_test", lambda *a: calls.append(a))
    setup_email.main()
    assert calls == [("smtp.gmail.com", 587, "me@gmail.com", "abcdefghijklmnop", "me@gmail.com")]
    text = env.read_text(encoding="utf-8")
    assert "DB_PORT=3307" in text and "SECRET_KEY=abc" in text
    assert "SMTP_HOST=smtp.gmail.com" in text and "SMTP_PASSWORD=abcdefghijklmnop" in text
