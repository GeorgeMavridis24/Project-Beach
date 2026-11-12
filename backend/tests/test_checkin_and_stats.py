"""QR check-in από το προσωπικό και στατιστικά dashboard."""

from datetime import datetime

from conftest import DAY


def _book(client, user, sid, start="08:00", end="20:00", day=DAY):
    r = client.post(
        "/bookings",
        json={"sunbed_id": sid, "res_date": day, "start_time": start, "end_time": end},
        headers=user["headers"],
    )
    assert r.status_code == 201, r.text
    return r.json()


def test_checkin_flow(client, grid, make_user, freeze_now):
    customer, staff = make_user(), make_user("staff")
    booking = _book(client, customer, grid["sunbeds"][0]["id"])

    # Όχι σήμερα -> απορρίπτεται
    r = client.post("/staff/checkin", json={"code": booking["checkin_code"]}, headers=staff["headers"])
    assert r.status_code == 409

    freeze_now(datetime(2027, 6, 15, 8, 30))
    assert client.post("/staff/checkin", json={"code": "NOPE123456"}, headers=staff["headers"]).status_code == 404
    spaced = " ".join(booking["checkin_code"][i : i + 4] for i in range(0, 12, 4)).lower()  # όπως φαίνεται στην οθόνη
    r = client.post("/staff/checkin", json={"code": spaced}, headers=staff["headers"])
    assert r.status_code == 200 and r.json()["checked_in"] is True
    assert r.json()["username"] == customer["username"]
    again = client.post("/staff/checkin", json={"code": booking["checkin_code"]}, headers=staff["headers"])
    assert again.status_code == 409

    today = client.get("/staff/bookings", headers=staff["headers"]).json()
    assert [b["booking_id"] for b in today] == [booking["booking_id"]]
    # μετά το check-in ο πελάτης δεν μπορεί να ακυρώσει
    assert client.post(f"/bookings/{booking['booking_id']}/cancel", headers=customer["headers"]).status_code == 409


def test_cancelled_booking_cannot_check_in(client, grid, make_user, freeze_now):
    customer, staff = make_user(), make_user("staff")
    booking = _book(client, customer, grid["sunbeds"][1]["id"])
    client.post(f"/bookings/{booking['booking_id']}/cancel", headers=customer["headers"])
    freeze_now(datetime(2027, 6, 15, 9, 0))
    r = client.post("/staff/checkin", json={"code": booking["checkin_code"]}, headers=staff["headers"])
    assert r.status_code == 409 and "ακυρωμένη" in r.json()["detail"]


def test_stats_dashboard(client, grid, make_user, freeze_now):
    a, b = make_user(), make_user()
    s = grid["sunbeds"]
    _book(client, a, s[0]["id"], "08:00", "20:00", "2027-06-14")  # VIP ολοήμερο 20€ (Δευτέρα)
    _book(client, a, s[5]["id"], "08:00", "14:00", "2027-06-15")  # κανονική πρωί 6€
    _book(client, b, s[6]["id"], "14:00", "20:00", "2027-06-15")  # κανονική απόγευμα 6€
    gone = _book(client, b, s[7]["id"], "08:00", "20:00", "2027-06-15")
    client.post(f"/bookings/{gone['booking_id']}/cancel", headers=b["headers"])

    freeze_now(datetime(2027, 6, 14, 9, 0))
    staff = make_user("staff")
    first = client.get("/bookings/me", headers=a["headers"]).json()[0]
    client.post("/staff/checkin", json={"code": first["checkin_code"]}, headers=staff["headers"])
    freeze_now(datetime(2027, 6, 20, 9, 0))

    h = grid["admin"]["headers"]
    r = client.get("/admin/stats", params={"date_from": "2027-06-14", "date_to": "2027-06-15"}, headers=h)
    assert r.status_code == 200
    data = r.json()
    k = data["kpis"]
    assert k["revenue"] == 32.0 and k["bookings"] == 3 and k["cancelled"] == 1
    assert k["cancellation_rate"] == 0.25
    assert k["customers"] == 2
    # 12 ξαπλώστρες x 12 ώρες x 2 μέρες = 288 ώρες. Κλεισμένες: 12+6+6 = 24 -> 8.33%
    assert k["occupancy_rate"] == round(24 / 288, 4)
    assert k["checkin_rate"] == round(1 / 3, 4)
    assert [d["bookings"] for d in data["daily"]] == [1, 2]
    assert {x["slot"]: x["bookings"] for x in data["by_slot"]} == {"morning": 1, "afternoon": 1, "full_day": 1}
    assert data["by_weekday"][0]["bookings"] == 1  # Δευτέρα
    assert data["heatmap"] is None

    r = client.get(
        "/admin/stats", params={"date_from": "2027-06-14", "date_to": "2027-06-15", "beach_id": grid["beach_id"]}, headers=h
    ).json()
    cell = next(c for c in r["heatmap"]["cells"] if c["sunbed_id"] == s[0]["id"])
    assert cell["bookings"] == 1 and r["heatmap"]["rows"] == 3

    assert client.get("/admin/stats", params={"date_from": "2027-06-15", "date_to": "2027-06-01"}, headers=h).status_code == 400
