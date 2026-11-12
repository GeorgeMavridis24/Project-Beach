"""Κρατήσεις με ώρες, επικαλύψεις, τιμές, ακυρώσεις."""

from conftest import DAY


def book(client, user, sunbed_id, start="08:00", end="14:00", day=DAY):
    return client.post(
        "/bookings",
        json={"sunbed_id": sunbed_id, "res_date": day, "start_time": start, "end_time": end},
        headers=user["headers"],
    )


def test_create_booking_returns_code_and_price(client, grid, make_user):
    user = make_user()
    vip = next(s for s in grid["sunbeds"] if s["type"] == "premium")
    r = book(client, user, vip["id"], "08:00", "14:00")
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["price"] == 12.0  # 6 ώρες = μισή μέρα, 60% του 20€
    assert len(data["checkin_code"]) == 12
    assert data["status"] == "confirmed" and data["can_cancel"]


def test_overlap_rejected_but_adjacent_allowed(client, grid, make_user):
    a, b = make_user(), make_user()
    sid = grid["sunbeds"][5]["id"]
    assert book(client, a, sid, "08:00", "14:00").status_code == 201
    r = book(client, b, sid, "13:00", "16:00")
    assert r.status_code == 409 and "κλεισμένη" in r.json()["detail"]
    assert book(client, b, sid, "14:00", "20:00").status_code == 201  # απόγευμα: ελεύθερο

    m = client.get(f"/beaches/{grid['beach_id']}/sunbeds", params={"date": DAY, "start_time": "10:00", "end_time": "12:00"})
    cell = next(s for s in m.json()["sunbeds"] if s["id"] == sid)
    assert cell["status"] == "booked"
    assert cell["booked_slots"] == [{"start": "08:00", "end": "14:00"}, {"start": "14:00", "end": "20:00"}]


def test_rule_violations_are_400(client, grid, make_user):
    user = make_user()
    sid = grid["sunbeds"][0]["id"]
    assert book(client, user, sid, day="2027-12-10").status_code == 400  # εκτός σεζόν
    assert book(client, user, sid, day="2025-06-10").status_code == 400  # παρελθόν
    assert book(client, user, sid, "06:00", "09:00").status_code == 400  # εκτός ωραρίου
    assert book(client, user, 999999).status_code == 404


def test_out_of_order_sunbed_cannot_be_booked(client, grid, make_user):
    sid = grid["sunbeds"][0]["id"]
    r = client.put(
        f"/admin/sunbeds/{sid}", json={"price": 20, "type": "premium", "status": "out_of_order"},
        headers=grid["admin"]["headers"],
    )
    assert r.status_code == 200
    assert book(client, make_user(), sid).status_code == 409


def test_price_is_snapshot_at_booking_time(client, grid, make_user, sql):
    user = make_user()
    sid = grid["sunbeds"][0]["id"]
    assert book(client, user, sid, "08:00", "20:00").json()["price"] == 20.0
    client.put(f"/admin/sunbeds/{sid}", json={"price": 50, "type": "premium"}, headers=grid["admin"]["headers"])
    assert float(sql("SELECT price FROM reserves")[0]["price"]) == 20.0


def test_cancel_is_soft_and_frees_slot(client, grid, make_user, sql):
    a, b = make_user(), make_user()
    sid = grid["sunbeds"][1]["id"]
    booking = book(client, a, sid).json()
    # άλλος χρήστης δεν μπορεί να την ακυρώσει
    assert client.post(f"/bookings/{booking['booking_id']}/cancel", headers=b["headers"]).status_code == 404
    r = client.post(f"/bookings/{booking['booking_id']}/cancel", headers=a["headers"])
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    assert sql("SELECT COUNT(*) AS n FROM reserves")[0]["n"] == 1  # δεν διαγράφηκε
    assert client.post(f"/bookings/{booking['booking_id']}/cancel", headers=a["headers"]).status_code == 409
    assert book(client, b, sid).status_code == 201  # η θέση ελευθερώθηκε

    scopes = {s: client.get("/bookings/me", params={"scope": s}, headers=a["headers"]).json() for s in ("upcoming", "cancelled")}
    assert scopes["upcoming"] == [] and len(scopes["cancelled"]) == 1


def test_change_time_checks_overlap_and_reprices(client, grid, make_user):
    a, b = make_user(), make_user()
    sid = grid["sunbeds"][6]["id"]  # κανονική 10€
    mine = book(client, a, sid, "08:00", "12:00").json()
    book(client, b, sid, "14:00", "18:00")
    r = client.put(f"/bookings/{mine['booking_id']}/time", json={"start_time": "10:00", "end_time": "15:00"}, headers=a["headers"])
    assert r.status_code == 409
    r = client.put(f"/bookings/{mine['booking_id']}/time", json={"start_time": "08:00", "end_time": "14:00"}, headers=a["headers"])
    assert r.status_code == 200 and r.json()["end_time"] == "14:00" and r.json()["price"] == 6.0


def test_started_booking_cannot_be_cancelled_by_user(client, grid, make_user, freeze_now):
    from datetime import datetime

    user = make_user()
    booking = book(client, user, grid["sunbeds"][2]["id"], "10:00", "14:00").json()
    freeze_now(datetime(2027, 6, 15, 11, 0))
    r = client.post(f"/bookings/{booking['booking_id']}/cancel", headers=user["headers"])
    assert r.status_code == 409
    # ο admin μπορεί
    r = client.post(f"/admin/bookings/{booking['booking_id']}/cancel", headers=grid["admin"]["headers"])
    assert r.status_code == 200


def test_admin_booking_filters(client, grid, make_user):
    maria, nikos = make_user(username="maria"), make_user(username="nikos")
    s = grid["sunbeds"]
    book(client, maria, s[0]["id"])
    book(client, nikos, s[1]["id"], day="2027-07-01")
    cancelled = book(client, nikos, s[2]["id"]).json()
    client.post(f"/bookings/{cancelled['booking_id']}/cancel", headers=nikos["headers"])
    h = grid["admin"]["headers"]
    get = lambda **p: client.get("/admin/bookings", params=p, headers=h).json()  # noqa: E731
    assert len(get()) == 3
    assert [b["username"] for b in get(q="mar")] == ["maria"]
    assert len(get(status="cancelled")) == 1
    assert len(get(date_from="2027-06-20")) == 1
    assert all("checkin_code" not in b for b in get())
