"""Γεμίζει τη βάση με ρεαλιστικά ΔΟΚΙΜΑΣΤΙΚΑ δεδομένα για demo / dashboard.

Τι φτιάχνει:
  * πλέγμα ξαπλωστρών σε κάθε παραλία που δεν έχει ήδη
  * έναν admin, έναν υπάλληλο εισόδου, έναν καταστηματάρχη ανά κατάστημα
    και ~80 πελάτες (κωδικός για όλους: demo1234)
  * κρατήσεις για ολόκληρη την πιο πρόσφατη σεζόν, με λογικά μοτίβα:
      - Σαββατοκύριακα και Αύγουστος πιο γεμάτα
      - οι VIP μπροστινές σειρές γεμίζουν πρώτες
      - ~8% ακυρώσεις, check-in για τις περισσότερες παλιές κρατήσεις

Χρήση (μέσα στον φάκελο backend/):
    python -m scripts.seed_demo            # προσθέτει δεδομένα
    python -m scripts.seed_demo --reset    # σβήνει πρώτα χρήστες/κρατήσεις/ξαπλώστρες
"""

import argparse
import random
import secrets
from datetime import datetime, time, timedelta

from app import booking_rules as rules
from app import db
from app.security import hash_password

FIRST_NAMES = [
    "Γιώργος", "Μαρία", "Νίκος", "Ελένη", "Κώστας", "Κατερίνα", "Δημήτρης", "Σοφία", "Γιάννης", "Αννα",
    "Παναγιώτης", "Δέσποινα", "Χρήστος", "Βασιλική", "Αλέξανδρος", "Ιωάννα", "Θανάσης", "Χριστίνα",
]
# Διαστήματα κράτησης σε σχέση με το ωράριο κάθε καταστήματος (open/close), με βάρη
WINDOWS = [("open", "14:00", 0.35), ("14:00", "close", 0.25), ("open", "close", 0.30), ("10:00", "16:00", 0.10)]
MONTH_DEMAND = {5: 0.25, 6: 0.45, 7: 0.7, 8: 0.85, 9: 0.45, 10: 0.2}
GRIDS = [(4, 8, 1, 25, 12), (5, 10, 2, 22, 10), (3, 6, 1, 30, 15)]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true")
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()
    rnd = random.Random(args.seed)

    with db.transaction() as cur:
        if args.reset:
            cur.execute("DELETE FROM reserves")
            cur.execute("DELETE FROM sunbeds")
            cur.execute("DELETE FROM users")

        # --- χρήστες
        pw = hash_password("demo1234")
        cur.execute("SELECT email FROM users")
        existing = {r["email"] for r in cur.fetchall()}
        people = [("Admin", "admin@smartbeach.gr", "admin"), ("Είσοδος", "staff@smartbeach.gr", "staff")]
        cur.execute("SELECT id, name FROM beaches ORDER BY id")
        beach_rows = cur.fetchall()
        people += [(f"Ιδιοκτήτης {b['name']}", f"owner{i}@smartbeach.gr", "owner") for i, b in enumerate(beach_rows, 1)]
        people += [(f"{rnd.choice(FIRST_NAMES)} {i}", f"customer{i}@demo.gr", "user") for i in range(1, 81)]
        for name, email, role in people:
            if email not in existing:
                cur.execute(
                    "INSERT INTO users (username, email, password, role) VALUES (%s, %s, %s, %s)",
                    (name, email, pw, role),
                )
        cur.execute("SELECT id FROM users WHERE role = 'user'")
        customers = [r["id"] for r in cur.fetchall()]

        # --- καταστηματάρχες: owner1 -> 1ο κατάστημα, owner2 -> 2ο, ...
        for i, b in enumerate(beach_rows, 1):
            cur.execute(
                "UPDATE beaches SET owner_id = (SELECT id FROM users WHERE email = %s) WHERE id = %s AND owner_id IS NULL",
                (f"owner{i}@smartbeach.gr", b["id"]),
            )

        # --- ξαπλώστρες
        cur.execute("SELECT id, TIME_FORMAT(open_time, '%H:%i') AS o, TIME_FORMAT(close_time, '%H:%i') AS c FROM beaches ORDER BY id")
        hours = {r["id"]: (r["o"], r["c"]) for r in cur.fetchall()}
        beaches = list(hours)
        for i, beach_id in enumerate(beaches):
            cur.execute("SELECT COUNT(*) AS n FROM sunbeds WHERE beach_id = %s", (beach_id,))
            if cur.fetchone()["n"]:
                continue
            rows, cols, prem_rows, prem_price, price = GRIDS[i % len(GRIDS)]
            for x in range(1, rows + 1):
                for y in range(1, cols + 1):
                    vip = x <= prem_rows
                    cur.execute(
                        "INSERT INTO sunbeds (beach_id, grid_x, grid_y, price, type) VALUES (%s, %s, %s, %s, %s)",
                        (beach_id, x, y, prem_price if vip else price, "premium" if vip else "normal"),
                    )
        cur.execute("SELECT id, beach_id, grid_x, price, type FROM sunbeds WHERE status = 'active'")
        sunbeds = cur.fetchall()

        # --- κρατήσεις για την πιο πρόσφατη σεζόν (μόνο αν δεν υπάρχουν ήδη)
        start, end = rules.current_or_last_season()
        today = rules.today()
        day, created = start, 0
        cur.execute("SELECT COUNT(*) AS n FROM reserves WHERE res_date BETWEEN %s AND %s", (start, end))
        if cur.fetchone()["n"]:
            print("Υπάρχουν ήδη κρατήσεις για τη σεζόν - δεν προστίθενται νέες (χρησιμοποίησε --reset για από την αρχή).")
            day = end + timedelta(days=1)
        while day <= end:
            demand = MONTH_DEMAND.get(day.month, 0.3) * (1.35 if day.weekday() >= 5 else 1.0)
            for sb in sunbeds:
                # οι μπροστινές σειρές είναι πιο δημοφιλείς
                p = min(0.95, demand * (1.25 if sb["type"] == "premium" else 1.0) * (1.1 - 0.06 * sb["grid_x"]))
                if rnd.random() > p:
                    continue
                o, c = hours[sb["beach_id"]]
                s, e, _ = rnd.choices(WINDOWS, weights=[w[2] for w in WINDOWS])[0]
                s, e = (o if s == "open" else s), (c if e == "close" else e)
                slots = [(s, e)]
                if e == "14:00" and rnd.random() < 0.4:
                    slots.append(("14:00", c))  # η ίδια θέση και το απόγευμα σε άλλον
                for s, e in slots:
                    st, en = rules.parse_time(s), rules.parse_time(e)
                    cancelled = rnd.random() < 0.08
                    checked_in = (
                        None
                        if cancelled or day > today or rnd.random() < 0.1
                        else datetime.combine(day, st) + timedelta(minutes=rnd.randint(0, 50))
                    )
                    cur.execute(
                        """INSERT INTO reserves (user_id, sunbed_id, res_date, res_time, leave_time, price,
                                                 status, checkin_code, checked_in_at, cancelled_at, created_at)
                           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                        (
                            rnd.choice(customers), sb["id"], day, st, en, rules.compute_price(sb["price"], st, en),
                            "cancelled" if cancelled else "confirmed", secrets.token_hex(6).upper(), checked_in,
                            datetime.combine(day, time(7, 0)) - timedelta(days=rnd.randint(1, 3)) if cancelled else None,
                            datetime.combine(day, time(9, 0)) - timedelta(days=rnd.randint(1, 20)),
                        ),
                    )
                    created += 1
            day += timedelta(days=1)

    print(f"Έτοιμο: {len(customers)} πελάτες, {len(sunbeds)} ξαπλώστρες, {created} κρατήσεις ({start} έως {end}).")
    print("Λογαριασμοί demo (κωδικός demo1234): admin@smartbeach.gr, owner1@smartbeach.gr, staff@smartbeach.gr, customer1@demo.gr")


if __name__ == "__main__":
    main()
