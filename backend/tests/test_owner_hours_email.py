"""Ωράριο ανά κατάστημα, ρόλος καταστηματάρχη και email κρατήσεων."""

import email
from datetime import datetime
from email import policy

import pytest

from app import mailer
from conftest import DAY


def book(client, user, sunbed_id, start, end, day=DAY):
    return client.post(
        "/bookings",
        json={"sunbed_id": sunbed_id, "res_date": day, "start_time": start, "end_time": end},
        headers=user["headers"],
    )


def make_grid(client, admin, beach_id):
    r = client.post(
        f"/admin/beaches/{beach_id}/sunbeds/grid",
        json={"rows": 2, "cols": 3, "premium_rows": 1, "premium_price": 20, "price": 10},
        headers=admin["headers"],
    )
    assert r.status_code == 201, r.text
    return client.get(f"/beaches/{beach_id}/sunbeds", params={"date": DAY}).json()["sunbeds"]


# ------------------------------------------------------------------ ωράριο
def test_each_beach_has_its_own_hours(client, grid, make_user, beach_ids):
    beaches = {b["id"]: b for b in client.get("/beaches").json()}
    assert (beaches[beach_ids[0]]["open_time"], beaches[beach_ids[0]]["close_time"]) == ("08:00", "22:00")
    assert (beaches[beach_ids[1]]["open_time"], beaches[beach_ids[1]]["close_time"]) == ("08:00", "21:00")
    assert (beaches[beach_ids[2]]["open_time"], beaches[beach_ids[2]]["close_time"]) == ("09:00", "21:00")

    fratelli = make_grid(client, grid["admin"], beach_ids[1])
    user = make_user()
    # 21:00-22:00: ανοιχτό το Oia, κλειστό το Fratelli
    assert book(client, user, grid["sunbeds"][0]["id"], "21:00", "22:00").status_code == 201
    r = book(client, user, fratelli[0]["id"], "20:00", "21:30")
    assert r.status_code == 400 and "08:00-21:00" in r.json()["detail"]
    # ελεύθερες ώρες ανά λεπτό
    r = book(client, user, fratelli[1]["id"], "19:15", "20:50")
    assert r.status_code == 201 and r.json()["start_time"] == "19:15"

    # Η αναζήτηση για 21:00-22:00 δείχνει 0 ελεύθερες στο κλειστό κατάστημα
    res = {b["id"]: b for b in client.get("/beaches", params={"date": DAY, "start_time": "21:00", "end_time": "22:00"}).json()}
    assert res[beach_ids[1]]["open_for_window"] is False and res[beach_ids[1]]["available_sunbeds"] == 0
    assert res[beach_ids[0]]["open_for_window"] is True
    # Χωρίς ώρες: χρησιμοποιείται όλο το ωράριο κάθε καταστήματος
    m = client.get(f"/beaches/{beach_ids[1]}/sunbeds", params={"date": DAY}).json()
    assert (m["start_time"], m["end_time"]) == ("08:00", "21:00")
    late = client.get(f"/beaches/{beach_ids[1]}/sunbeds", params={"date": DAY, "start_time": "20:30", "end_time": "21:30"}).json()
    assert late["bookable"] is False


# ------------------------------------------------------------- καταστηματάρχης
@pytest.fixture()
def owner_setup(client, grid, make_user, beach_ids):
    """Ο owner έχει το 1ο κατάστημα (Oia). Το 2ο ανήκει σε κανέναν."""
    admin = grid["admin"]
    owner = make_user("owner", "nikos_owner")
    oia = beach_ids[0]
    r = client.put(
        f"/admin/beaches/{oia}",
        json={"name": "Oia Beach Bar", "description": "", "ltd": 40.258, "lgd": 23.2, "owner_id": owner["id"]},
        headers=admin["headers"],
    )
    assert r.status_code == 200 and r.json()["owner_id"] == owner["id"]
    other = make_grid(client, admin, beach_ids[1])
    customer = make_user()
    mine = book(client, customer, grid["sunbeds"][0]["id"], "10:00", "14:00").json()
    theirs = book(client, customer, other[0]["id"], "10:00", "14:00").json()
    return {"owner": owner, "admin": admin, "oia": oia, "other": beach_ids[1], "mine": mine, "theirs": theirs}


def test_owner_edits_only_own_hours(client, owner_setup, make_user):
    o = owner_setup
    h = o["owner"]["headers"]
    body = {"name": "Oia Beach Bar", "description": "Νέα περιγραφή", "ltd": 40.258, "lgd": 23.2,
            "open_time": "09:30", "close_time": "23:00", "owner_id": None}
    r = client.put(f"/admin/beaches/{o['oia']}", json=body, headers=h)
    assert r.status_code == 200
    assert (r.json()["open_time"], r.json()["close_time"]) == ("09:30", "23:00")
    assert r.json()["owner_id"] == o["owner"]["id"]  # δεν μπορεί να αφαιρέσει τον εαυτό του
    # Το νέο ωράριο ισχύει αμέσως
    assert book(client, make_user(), owner_setup["mine"]["sunbed_id"] + 1, "21:00", "23:00").status_code == 201
    # Ξένο κατάστημα / λάθος ωράριο / δικαιώματα admin
    assert client.put(f"/admin/beaches/{o['other']}", json=body, headers=h).status_code == 403
    bad = {**body, "open_time": "22:00", "close_time": "08:00"}
    assert client.put(f"/admin/beaches/{o['oia']}", json=bad, headers=h).status_code == 400
    assert client.post("/admin/beaches", json=body, headers=h).status_code == 403
    assert client.delete(f"/admin/beaches/{o['oia']}", headers=h).status_code == 403
    assert client.get("/admin/users", headers=h).status_code == 403


def test_owner_sees_only_own_bookings_and_stats(client, owner_setup, freeze_now):
    o = owner_setup
    h = o["owner"]["headers"]
    ids = [b["booking_id"] for b in client.get("/admin/bookings", headers=h).json()]
    assert ids == [o["mine"]["booking_id"]]
    assert len(client.get("/admin/bookings", headers=o["admin"]["headers"]).json()) == 2

    stats = client.get("/admin/stats", params={"date_from": DAY, "date_to": DAY}, headers=h).json()
    assert stats["kpis"]["bookings"] == 1 and [b["beach_id"] for b in stats["by_beach"]] == [o["oia"]]
    assert client.get("/admin/stats", params={"beach_id": o["other"]}, headers=h).status_code == 403

    # ακύρωση / check-in σε ξένο κατάστημα: δεν "υπάρχει"
    assert client.post(f"/admin/bookings/{o['theirs']['booking_id']}/cancel", headers=h).status_code == 404
    freeze_now(datetime(2027, 6, 15, 9, 0))
    assert client.post("/staff/checkin", json={"code": o["theirs"]["checkin_code"]}, headers=h).status_code == 404
    assert client.post("/staff/checkin", json={"code": o["mine"]["checkin_code"]}, headers=h).status_code == 200
    # αλλαγή ώρας σε δική του κράτηση: επιτρέπεται, χωρίς να βλέπει τον κωδικό QR
    freeze_now(datetime(2027, 6, 1, 9, 0))
    r = client.put(f"/admin/bookings/{o['theirs']['booking_id']}/time", json={"start_time": "11:00", "end_time": "14:00"}, headers=h)
    assert r.status_code == 404


def test_owner_manages_own_sunbeds_only(client, owner_setup):
    o = owner_setup
    h = o["owner"]["headers"]
    sunbed = o["mine"]["sunbed_id"]
    assert client.put(f"/admin/sunbeds/{sunbed}", json={"price": 30, "type": "premium"}, headers=h).status_code == 200
    assert client.put(f"/admin/sunbeds/{o['theirs']['sunbed_id']}", json={"price": 1, "type": "normal"}, headers=h).status_code == 403


def test_demoting_owner_unlinks_beach(client, owner_setup):
    o = owner_setup
    r = client.put(f"/admin/users/{o['owner']['id']}", json={"role": "user"}, headers=o["admin"]["headers"])
    assert r.status_code == 200
    assert client.get(f"/beaches/{o['oia']}").json()["owner_id"] is None
    # μόνο χρήστες με ρόλο owner γίνονται καταστηματάρχες
    body = {"name": "Oia Beach Bar", "description": "", "ltd": 40.2, "lgd": 23.2, "owner_id": o["owner"]["id"]}
    assert client.put(f"/admin/beaches/{o['oia']}", json=body, headers=o["admin"]["headers"]).status_code == 400


# ------------------------------------------------------------------ email
def read_mail(path):
    return email.message_from_bytes(path.read_bytes(), policy=policy.default)


def test_booking_emails_go_to_customer(client, grid, make_user, outbox):
    user = make_user(username="maria")
    booking = book(client, user, grid["sunbeds"][0]["id"], "10:00", "14:00").json()
    files = sorted(outbox.glob("*.eml"))
    assert len(files) == 1
    msg = read_mail(files[0])
    assert msg["To"] == user["email"]
    assert "Επιβεβαίωση κράτησης" in msg["Subject"] and "Oia Beach Bar" in msg["Subject"]
    text = msg.get_body(preferencelist=("plain",)).get_content()
    assert "10:00 – 14:00" in text and booking["checkin_code"][:4] in text
    images = [p for p in msg.walk() if p.get_content_type() == "image/png"]
    assert len(images) == 1 and images[0].get_content()[:4] == b"\x89PNG"

    client.put(f"/bookings/{booking['booking_id']}/time", json={"start_time": "11:00", "end_time": "15:00"}, headers=user["headers"])
    client.post(f"/bookings/{booking['booking_id']}/cancel", headers=user["headers"])
    subjects = [read_mail(f)["Subject"] for f in sorted(outbox.glob("*.eml"))]
    assert any("Αλλαγή ώρας" in s for s in subjects) and any("Ακύρωση" in s for s in subjects)
    cancelled = next(read_mail(f) for f in outbox.glob("*.eml") if "Ακύρωση" in read_mail(f)["Subject"])
    assert not [p for p in cancelled.walk() if p.get_content_type() == "image/png"]  # χωρίς QR


def test_smtp_delivery(monkeypatch, client, grid, make_user, outbox):
    sent = {}

    class FakeSMTP:
        def __init__(self, host, port, timeout=None):
            sent["server"] = (host, port)

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def starttls(self, context=None):
            sent["tls"] = True

        def login(self, user, password):
            sent["login"] = (user, password)

        def send_message(self, msg):
            sent["to"] = msg["To"]

    monkeypatch.setattr(mailer.settings, "smtp_host", "smtp.gmail.com")
    monkeypatch.setattr(mailer.settings, "smtp_user", "beach@gmail.com")
    monkeypatch.setattr(mailer.settings, "smtp_password", "app-password")
    monkeypatch.setattr(mailer.smtplib, "SMTP", FakeSMTP)
    user = make_user()
    assert book(client, user, grid["sunbeds"][0]["id"], "10:00", "14:00").status_code == 201
    assert sent == {"server": ("smtp.gmail.com", 587), "tls": True, "login": ("beach@gmail.com", "app-password"), "to": user["email"]}
    assert not list(outbox.glob("*.eml"))


def test_email_failure_does_not_break_booking(monkeypatch, client, grid, make_user, sql):
    def boom(*_):
        raise OSError("SMTP down")

    monkeypatch.setattr(mailer, "deliver", boom)
    assert book(client, make_user(), grid["sunbeds"][0]["id"], "10:00", "14:00").status_code == 201
    assert sql("SELECT COUNT(*) AS n FROM reserves")[0]["n"] == 1
