"""Φίλτρα αναζήτησης παραλιών και χάρτη ξαπλωστρών."""

from conftest import DAY


def test_beach_filters(client, grid, make_user, beach_ids):
    # Πρώτη παραλία: 4 VIP (20€) + 8 κανονικές (10€). Οι άλλες δύο: χωρίς ξαπλώστρες.
    all_beaches = client.get("/beaches").json()
    assert len(all_beaches) == 3
    first = next(b for b in all_beaches if b["id"] == grid["beach_id"])
    assert (first["total_sunbeds"], first["premium_sunbeds"], first["min_price"]) == (12, 4, 10.0)
    assert first["available_sunbeds"] is None  # χωρίς ημερομηνία δεν υπολογίζεται

    # Φίλτρο τιμής: μέχρι 15€ μένουν μόνο οι κανονικές
    cheap = client.get("/beaches", params={"max_price": 15}).json()
    assert [b["id"] for b in cheap] == [grid["beach_id"]] and cheap[0]["total_sunbeds"] == 8

    # Φίλτρο τύπου
    vip = client.get("/beaches", params={"type": "premium"}).json()
    assert vip[0]["total_sunbeds"] == 4

    # Διαθεσιμότητα για ημερομηνία
    user = make_user()
    client.post(
        "/bookings",
        json={"sunbed_id": grid["sunbeds"][0]["id"], "res_date": DAY, "start_time": "08:00", "end_time": "14:00"},
        headers=user["headers"],
    )
    morning = client.get("/beaches", params={"date": DAY, "start_time": "08:00", "end_time": "14:00", "available_only": True}).json()
    assert len(morning) == 1 and morning[0]["available_sunbeds"] == 11
    evening = client.get("/beaches", params={"date": DAY, "start_time": "14:00", "end_time": "20:00"}).json()
    assert next(b for b in evening if b["id"] == grid["beach_id"])["available_sunbeds"] == 12

    # Αναζήτηση κειμένου και ταξινομήσεις
    assert [b["name"] for b in client.get("/beaches", params={"q": "fratelli"}).json()] == ["Fratelli Beach Bar"]
    by_avail = client.get("/beaches", params={"date": DAY, "sort": "availability"}).json()
    assert by_avail[0]["id"] == grid["beach_id"]
    near = client.get("/beaches", params={"sort": "distance", "lat": 40.2584, "lon": 23.2038}).json()
    assert near[0]["name"] == "Fratelli Beach Bar" and near[0]["distance_km"] < 0.1


def test_sunbed_map_filters_and_bookable_flag(client, grid):
    url = f"/beaches/{grid['beach_id']}/sunbeds"
    m = client.get(url, params={"date": DAY}).json()
    assert (m["rows"], m["cols"], m["summary"]["total"], m["bookable"]) == (3, 4, 12, True)
    assert len(client.get(url, params={"date": DAY, "type": "premium"}).json()["sunbeds"]) == 4
    assert len(client.get(url, params={"date": DAY, "max_price": 12}).json()["sunbeds"]) == 8
    quoted = client.get(url, params={"date": DAY, "start_time": "14:00", "end_time": "18:00"}).json()["sunbeds"][0]
    assert quoted["quoted_price"] == 12.0
    off = client.get(url, params={"date": "2027-12-01"}).json()
    assert off["bookable"] is False and "σεζόν" in off["reason"]
    assert client.get("/beaches/9999/sunbeds", params={"date": DAY}).status_code == 404


def test_grid_validation_and_reset(client, grid):
    h = grid["admin"]["headers"]
    url = f"/admin/beaches/{grid['beach_id']}/sunbeds"
    assert client.post(url + "/grid", json={"rows": 2, "cols": 2, "premium_rows": 0, "premium_price": 1, "price": 1}, headers=h).status_code == 409
    assert client.post(f"/admin/beaches/{grid['beach_id']}/sunbeds/grid", json={"rows": 2, "cols": 2, "premium_rows": 5, "premium_price": 1, "price": 1}, headers=h).status_code == 422
    assert client.delete(url, headers=h).json() == {"deleted": 12}


def test_config_reports_api_version_required_by_app(client):
    """Η εφαρμογή προειδοποιεί όταν ο server είναι παλιότερος από όσο χρειάζεται.
    Το API_VERSION του backend πρέπει να καλύπτει το REQUIRED_API_VERSION της εφαρμογής."""
    import re
    from pathlib import Path

    from app.config import API_VERSION

    app_config = Path(__file__).resolve().parents[2] / "SmartBeachApp" / "lib" / "config.ts"
    required = int(re.search(r"REQUIRED_API_VERSION = (\d+)", app_config.read_text(encoding="utf-8")).group(1))
    assert client.get("/config").json()["api_version"] == API_VERSION >= required
