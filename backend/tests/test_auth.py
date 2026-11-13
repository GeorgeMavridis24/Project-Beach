"""Ασφάλεια: εγγραφή, login, ρόλοι."""


def latest_code(outbox, email):
    """Ο τελευταίος κωδικός που "στάλθηκε" στο email (από τα αρχεία του outbox)."""
    import email as email_lib
    import re
    from email import policy

    for f in sorted(outbox.glob("*.eml"), reverse=True):
        msg = email_lib.message_from_bytes(f.read_bytes(), policy=policy.default)
        if msg["To"] == email and "SmartBeach" in msg["Subject"]:
            return re.match(r"(\d{6})", msg["Subject"]).group(1)
    raise AssertionError(f"no code for {email}")


def test_register_cannot_choose_role(client, sql, outbox):
    r = client.post(
        "/auth/register",
        json={"username": "Hacker", "email": "h@test.gr", "password": "secret123", "role": "admin"},
    )
    assert r.status_code == 201
    assert r.json()["role"] == "user" and r.json()["verification_required"] is True
    assert sql("SELECT role, email_verified FROM users WHERE email = 'h@test.gr'")[0] == {"role": "user", "email_verified": 0}


def test_register_validation_and_duplicates(client, outbox):
    assert client.post("/auth/register", json={"username": "A", "email": "bad", "password": "x"}).status_code == 422
    body = {"username": "Maria", "email": "Maria@Test.gr", "password": "secret123"}
    assert client.post("/auth/register", json=body).status_code == 201
    # ανεπιβεβαίωτη εγγραφή: μπορεί να ξαναγίνει (νέος κωδικός)
    assert client.post("/auth/register", json={**body, "email": "maria@test.gr"}).status_code == 201
    code = latest_code(outbox, "maria@test.gr")
    assert client.post("/auth/verify-email", json={"email": "maria@test.gr", "code": code}).status_code == 200
    # επιβεβαιωμένη: όχι δεύτερος λογαριασμός με το ίδιο email
    assert client.post("/auth/register", json={**body, "email": "maria@test.gr"}).status_code == 409


def test_login_and_me(client, outbox):
    client.post("/auth/register", json={"username": "Nikos", "email": "nikos@test.gr", "password": "secret123"})
    assert client.post("/auth/login", json={"email": "nikos@test.gr", "password": "wrong!!"}).status_code == 401
    # πριν την επιβεβαίωση δεν δίνεται token
    r = client.post("/auth/login", json={"email": "NIKOS@test.gr", "password": "secret123"})
    assert r.status_code == 200 and r.json()["verification_required"] is True and "access_token" not in r.json()
    r = client.post("/auth/verify-email", json={"email": "nikos@test.gr", "code": latest_code(outbox, "nikos@test.gr")})
    assert r.status_code == 200
    token = r.json()["access_token"]
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.json()["username"] == "Nikos" and "password" not in me.json()
    r = client.post("/auth/login", json={"email": "nikos@test.gr", "password": "secret123"})
    assert "access_token" in r.json()


def test_protected_routes(client, make_user):
    assert client.get("/bookings/me").status_code == 401
    assert client.get("/bookings/me", headers={"Authorization": "Bearer garbage"}).status_code == 401
    user = make_user("user")
    assert client.get("/admin/users", headers=user["headers"]).status_code == 403
    assert client.post("/staff/checkin", json={"code": "ABCDEF"}, headers=user["headers"]).status_code == 403


def test_demoted_admin_loses_access_immediately(client, make_user):
    boss = make_user("admin", "boss")
    other = make_user("admin", "other")
    assert client.get("/admin/users", headers=other["headers"]).status_code == 200
    r = client.put(f"/admin/users/{other['id']}", json={"role": "user"}, headers=boss["headers"])
    assert r.status_code == 200
    # Το token του "other" λέει ακόμα admin, αλλά ο server ελέγχει τη βάση.
    assert client.get("/admin/users", headers=other["headers"]).status_code == 403


def test_admin_cannot_demote_self(client, make_user):
    boss = make_user("admin", "boss")
    r = client.put(f"/admin/users/{boss['id']}", json={"role": "user"}, headers=boss["headers"])
    assert r.status_code == 400


def test_admin_user_filters(client, make_user):
    admin = make_user("admin", "boss")
    make_user("user", "giorgos")
    make_user("staff", "eleni")
    names = lambda r: sorted(u["username"] for u in r.json())  # noqa: E731
    assert names(client.get("/admin/users", params={"role": "staff"}, headers=admin["headers"])) == ["eleni"]
    assert names(client.get("/admin/users", params={"q": "gio"}, headers=admin["headers"])) == ["giorgos"]


def test_admin_creates_and_deletes_users(client, make_user, grid, sql):
    from conftest import DAY

    boss = make_user("admin", "boss")
    h = boss["headers"]
    # νέος χρήστης από τον admin: ενεργός αμέσως
    r = client.post("/admin/users", json={"username": "Είσοδος 2", "email": "Gate2@test.gr", "password": "secret123", "role": "staff"}, headers=h)
    assert r.status_code == 201 and r.json()["role"] == "staff"
    assert "access_token" in client.post("/auth/login", json={"email": "gate2@test.gr", "password": "secret123"}).json()
    assert client.post("/admin/users", json={"username": "X", "email": "gate2@test.gr", "password": "secret123"}, headers=h).status_code in (409, 422)
    customer = make_user(username="pelatis")
    assert client.post("/admin/users", json={"username": "Xx", "email": "x@test.gr", "password": "secret123"}, headers=customer["headers"]).status_code == 403

    # ο πελάτης έχει μια παλιά κράτηση (για στατιστικά) και μια μελλοντική
    past_id = sql(
        """INSERT INTO reserves (user_id, sunbed_id, res_date, res_time, leave_time, price, checkin_code)
           VALUES (%s, %s, '2026-07-01', '10:00', '14:00', 12, 'PAST00000001')""",
        (customer["id"], grid["sunbeds"][0]["id"]),
    )
    future = client.post("/bookings", json={"sunbed_id": grid["sunbeds"][1]["id"], "res_date": DAY, "start_time": "10:00", "end_time": "12:00"},
                         headers=customer["headers"]).json()

    assert client.delete(f"/admin/users/{boss['id']}", headers=h).status_code == 400  # όχι τον εαυτό σου
    r = client.delete(f"/admin/users/{customer['id']}", headers=h)
    assert r.status_code == 409 and r.headers["X-Future-Bookings"] == "1"
    r = client.delete(f"/admin/users/{customer['id']}", params={"cancel_future": True}, headers=h)
    assert r.status_code == 200 and r.json()["cancelled_bookings"] == 1
    assert not sql("SELECT id FROM users WHERE id = %s", (customer["id"],))
    # οι κρατήσεις έμειναν, ανώνυμα
    rows = sql("SELECT id, user_id, status FROM reserves ORDER BY id")
    assert {r["id"]: (r["user_id"], r["status"]) for r in rows} == {past_id: (None, "confirmed"), future["booking_id"]: (None, "cancelled")}
    names = {b["booking_id"]: b["username"] for b in client.get("/admin/bookings", headers=h).json()}
    assert names[past_id] == "Διαγραμμένος χρήστης"
    stats = client.get("/admin/stats", params={"date_from": "2026-07-01", "date_to": "2026-07-01"}, headers=h).json()
    assert stats["kpis"]["revenue"] == 12.0  # τα έσοδα δεν χάθηκαν
    # το token του διαγραμμένου δεν δουλεύει πια
    assert client.get("/bookings/me", headers=customer["headers"]).status_code == 401


def test_cannot_delete_last_admin(client, make_user):
    boss = make_user("admin", "boss")
    other = make_user("admin", "other")
    assert client.delete(f"/admin/users/{other['id']}", headers=boss["headers"]).status_code == 200
    # τώρα ο boss είναι ο μόνος admin· άλλος admin δεν υπάρχει για να τον σβήσει, ούτε ο ίδιος μπορεί
    assert client.delete(f"/admin/users/{boss['id']}", headers=boss["headers"]).status_code == 400
