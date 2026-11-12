"""Ταυτόχρονες κρατήσεις: η ίδια ξαπλώστρα δεν πρέπει ΠΟΤΕ να κλειστεί δύο φορές.

Πολλά νήματα (threads) στέλνουν ταυτόχρονα αίτημα κράτησης για την ίδια θέση
και ώρα. Χωρίς κλείδωμα (SELECT ... FOR UPDATE) θα περνούσαν πολλά.
"""

import threading

from conftest import DAY

N = 20


def _fire(client, requests):
    barrier = threading.Barrier(len(requests))
    results = [None] * len(requests)

    def worker(i, user, sunbed_id):
        barrier.wait()  # ξεκινούν όλα μαζί
        r = client.post(
            "/bookings",
            json={"sunbed_id": sunbed_id, "res_date": DAY, "start_time": "10:00", "end_time": "16:00"},
            headers=user["headers"],
        )
        results[i] = r.status_code

    threads = [threading.Thread(target=worker, args=(i, u, s)) for i, (u, s) in enumerate(requests)]
    for th in threads:
        th.start()
    for th in threads:
        th.join()
    return results


def test_same_sunbed_booked_exactly_once(client, grid, make_user, sql):
    users = [make_user() for _ in range(N)]
    sid = grid["sunbeds"][0]["id"]
    results = _fire(client, [(u, sid) for u in users])
    assert results.count(201) == 1
    assert results.count(409) == N - 1
    assert sql("SELECT COUNT(*) AS n FROM reserves WHERE status = 'confirmed'")[0]["n"] == 1


def test_different_sunbeds_all_succeed(client, grid, make_user, sql):
    sunbeds = grid["sunbeds"][:12]
    users = [make_user() for _ in sunbeds]
    results = _fire(client, [(u, s["id"]) for u, s in zip(users, sunbeds)])
    assert results == [201] * len(sunbeds)
    assert sql("SELECT COUNT(*) AS n FROM reserves")[0]["n"] == len(sunbeds)
