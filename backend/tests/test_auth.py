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
