"""Δοκιμή φόρτου (load test) με Locust.

Προσομοιώνει πολλούς ταυτόχρονους πελάτες που ψάχνουν παραλίες, ανοίγουν τον
χάρτη και κλείνουν ξαπλώστρες. Χρήσιμο για το κεφάλαιο αξιολόγησης:
χρόνοι απόκρισης (p50/p95), αιτήματα/δευτ. και απόδειξη ότι δεν γίνονται
διπλοκρατήσεις κάτω από φόρτο.

Προϋποθέσεις: τρέχει ο server και έχουν φορτωθεί δεδομένα demo
(python -m scripts.seed_demo). Εκτέλεση μέσα στον φάκελο backend/:

    locust -f loadtest/locustfile.py --host http://localhost:8000 \
           --users 100 --spawn-rate 20 --run-time 1m --headless --csv loadtest/results

Μετά, έλεγχος ότι δεν υπάρχουν επικαλυπτόμενες κρατήσεις:
    SELECT a.id, b.id FROM reserves a JOIN reserves b
      ON a.sunbed_id = b.sunbed_id AND a.res_date = b.res_date AND a.id < b.id
     AND a.status = 'confirmed' AND b.status = 'confirmed'
     AND a.res_time < b.leave_time AND b.res_time < a.leave_time;
"""

import random
from datetime import date, timedelta

from locust import HttpUser, between, task

WINDOWS = [("08:00", "14:00"), ("14:00", "20:00"), ("08:00", "20:00")]


class Customer(HttpUser):
    wait_time = between(0.5, 2)

    def on_start(self):
        # Οι εγγραφές θέλουν κωδικό από email, οπότε χρησιμοποιούμε τους δοκιμαστικούς
        # λογαριασμούς του seed_demo (customer1..80@demo.gr, κωδικός demo1234).
        email = f"customer{random.randint(1, 80)}@demo.gr"
        r = self.client.post("/auth/login", json={"email": email, "password": "demo1234"})
        self.headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
        cfg = self.client.get("/config").json()
        first = date.fromisoformat(cfg["first_bookable_date"])
        self.days = [(first + timedelta(days=i)).isoformat() for i in range(14)]
        self.beaches = [b["id"] for b in self.client.get("/beaches").json()]

    @task(5)
    def search(self):
        self.client.get(
            "/beaches",
            params={"date": random.choice(self.days), "type": random.choice(["normal", "premium"]), "sort": "availability"},
            name="/beaches?filters",
        )

    @task(4)
    def view_map(self):
        s, e = random.choice(WINDOWS)
        self.client.get(
            f"/beaches/{random.choice(self.beaches)}/sunbeds",
            params={"date": random.choice(self.days), "start_time": s, "end_time": e},
            name="/beaches/[id]/sunbeds",
        )

    @task(2)
    def book(self):
        day = random.choice(self.days)
        s, e = random.choice(WINDOWS)
        m = self.client.get(
            f"/beaches/{random.choice(self.beaches)}/sunbeds",
            params={"date": day, "start_time": s, "end_time": e},
            name="/beaches/[id]/sunbeds",
        ).json()
        free = [x for x in m.get("sunbeds", []) if x["status"] == "available"]
        if not free:
            return
        # Οι μισοί διαλέγουν από τις 3 πρώτες θέσεις -> πολλές συγκρούσεις επίτηδες.
        target = random.choice(free[:3] if random.random() < 0.5 else free)
        with self.client.post(
            "/bookings",
            json={"sunbed_id": target["id"], "res_date": day, "start_time": s, "end_time": e},
            headers=self.headers,
            name="/bookings",
            catch_response=True,
        ) as r:
            if r.status_code in (201, 409):  # το 409 (κάποιος την πρόλαβε) είναι αναμενόμενο
                r.success()

    @task(1)
    def my_bookings(self):
        self.client.get("/bookings/me", headers=self.headers, name="/bookings/me")
