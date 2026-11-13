"""Εγγραφή, επαλήθευση email, σύνδεση (με προαιρετικό 2ο βήμα) και ρυθμίσεις ασφαλείας.

Ροή εγγραφής:   register -> κωδικός στο email -> verify-email -> token
Ροή σύνδεσης:   login -> (αν έχει 2FA) κωδικός στο email -> login/verify -> token
"""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from mysql.connector import errors as mysql_errors

from .. import db
from ..mailer import send_code_email
from ..schemas import LoginIn, LoginVerifyIn, RegisterIn, ResendCodeIn, TwoFactorIn, VerifyEmailIn
from ..security import (
    create_access_token,
    create_challenge_token,
    decode_challenge_token,
    get_current_user,
    hash_password,
    verify_password,
)
from ..services import otp

router = APIRouter(prefix="/auth", tags=["Αυθεντικοποίηση"])

USER_COLUMNS = "id, username, email, password, role, email_verified, two_factor_enabled"


def _user_by_email(email: str):
    return db.fetch_one(f"SELECT {USER_COLUMNS} FROM users WHERE email = %s", (email.strip().lower(),))


def _token_response(user: dict) -> dict:
    return {
        "access_token": create_access_token(user["id"], user["role"]),
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "username": user["username"],
            "email": user["email"],
            "role": user["role"],
            "two_factor_enabled": bool(user["two_factor_enabled"]),
        },
    }


def _send_code(background: BackgroundTasks, user: dict, purpose: str) -> None:
    code = otp.issue(user["id"], purpose)
    if code:  # None = πολλές αποστολές σε λίγο χρόνο (ο προηγούμενος κωδικός ισχύει ακόμα)
        background.add_task(send_code_email, user["email"], user["username"], code, purpose)


def _mask(email: str) -> str:
    name, _, domain = email.partition("@")
    return f"{name[:2]}{'•' * max(1, len(name) - 2)}@{domain}"


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(data: RegisterIn, background: BackgroundTasks):
    """Δημιουργεί λογαριασμό που ενεργοποιείται μόνο με τον κωδικό από το email."""
    email = data.email.lower()
    existing = _user_by_email(email)
    if existing and existing["email_verified"]:
        raise HTTPException(status_code=409, detail="Υπάρχει ήδη λογαριασμός με αυτό το email.")
    if existing:  # ανεπιβεβαίωτη παλιά εγγραφή: ξεκινάμε από την αρχή
        db.execute(
            "UPDATE users SET username = %s, password = %s WHERE id = %s",
            (data.username, hash_password(data.password), existing["id"]),
        )
        user_id = existing["id"]
    else:
        try:
            _, user_id = db.execute(
                "INSERT INTO users (username, email, password, role, email_verified) VALUES (%s, %s, %s, 'user', 0)",
                (data.username, email, hash_password(data.password)),
            )
        except mysql_errors.IntegrityError:
            raise HTTPException(status_code=409, detail="Υπάρχει ήδη λογαριασμός με αυτό το email.")
    _send_code(background, {"id": user_id, "email": email, "username": data.username}, "verify_email")
    return {
        "verification_required": True,
        "email": email,
        "role": "user",
        "delivery": otp.delivery(),
    }


@router.post("/verify-email")
def verify_email(data: VerifyEmailIn):
    user = _user_by_email(data.email)
    if user is None:
        raise HTTPException(status_code=400, detail="Λάθος κωδικός.")
    if user["email_verified"]:
        raise HTTPException(status_code=409, detail="Ο λογαριασμός είναι ήδη ενεργός. Συνδέσου κανονικά.")
    otp.check(user["id"], "verify_email", data.code)
    db.execute("UPDATE users SET email_verified = 1 WHERE id = %s", (user["id"],))
    user["email_verified"] = 1
    return _token_response(user)


@router.post("/resend-code")
def resend_code(data: ResendCodeIn, background: BackgroundTasks):
    """Νέος κωδικός. Απαντά πάντα το ίδιο, ώστε να μη φαίνεται ποια email έχουν λογαριασμό."""
    if data.challenge:
        user_id = decode_challenge_token(data.challenge)
        if user_id is None:
            raise HTTPException(status_code=401, detail="Η σύνδεση έληξε. Ξεκίνα πάλι από την αρχή.")
        user = db.fetch_one(f"SELECT {USER_COLUMNS} FROM users WHERE id = %s", (user_id,))
        if user:
            _send_code(background, user, "login")
    elif data.email:
        user = _user_by_email(data.email)
        if user and not user["email_verified"]:
            _send_code(background, user, "verify_email")
    return {"sent": True, "delivery": otp.delivery(), "detail": "Αν τα στοιχεία είναι σωστά, στάλθηκε νέος κωδικός."}


@router.post("/login")
def login(data: LoginIn, background: BackgroundTasks):
    user = _user_by_email(data.email)
    if user is None or not verify_password(data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Λάθος email ή κωδικός.")
    if not user["email_verified"]:
        _send_code(background, user, "verify_email")
        return {"verification_required": True, "email": user["email"], "delivery": otp.delivery()}
    if user["two_factor_enabled"]:
        _send_code(background, user, "login")
        return {
            "two_factor_required": True,
            "challenge": create_challenge_token(user["id"]),
            "email_hint": _mask(user["email"]),
            "delivery": otp.delivery(),
        }
    return _token_response(user)


@router.post("/login/verify")
def login_verify(data: LoginVerifyIn):
    """2ο βήμα σύνδεσης: ο κωδικός που στάλθηκε στο email."""
    user_id = decode_challenge_token(data.challenge)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Η σύνδεση έληξε. Ξεκίνα πάλι από την αρχή.")
    user = db.fetch_one(f"SELECT {USER_COLUMNS} FROM users WHERE id = %s", (user_id,))
    if user is None:
        raise HTTPException(status_code=401, detail="Ο λογαριασμός δεν υπάρχει πλέον.")
    otp.check(user_id, "login", data.code)
    return _token_response(user)


@router.get("/me")
def me(user: dict = Depends(get_current_user)):
    return user


@router.post("/2fa")
def set_two_factor(data: TwoFactorIn, user: dict = Depends(get_current_user)):
    """Ενεργοποίηση / απενεργοποίηση ελέγχου σε 2 βήματα. Ζητά ξανά τον κωδικό για ασφάλεια."""
    row = db.fetch_one("SELECT password FROM users WHERE id = %s", (user["id"],))
    if not verify_password(data.password, row["password"]):
        raise HTTPException(status_code=400, detail="Λάθος κωδικός πρόσβασης.")
    db.execute("UPDATE users SET two_factor_enabled = %s WHERE id = %s", (1 if data.enabled else 0, user["id"]))
    return {**user, "two_factor_enabled": data.enabled}
