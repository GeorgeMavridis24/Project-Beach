"""Κρυπτογράφηση κωδικών (bcrypt), JWT tokens και έλεγχος ρόλων."""

from datetime import datetime, timedelta, timezone
from typing import Callable, Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from . import db
from .config import settings

_bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(user_id: int, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_minutes)
    payload = {"sub": str(user_id), "role": role, "exp": expire}
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


CHALLENGE_MINUTES = 10


def create_challenge_token(user_id: int) -> str:
    """Προσωρινό token για το 2ο βήμα της σύνδεσης (ΔΕΝ δίνει πρόσβαση στο API)."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=CHALLENGE_MINUTES)
    payload = {"sub": str(user_id), "purpose": "login2fa", "exp": expire}
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def decode_challenge_token(token: str) -> Optional[int]:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
        if payload.get("purpose") != "login2fa":
            return None
        return int(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        return None


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(credentials: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> dict:
    """Επαληθεύει το token ΚΑΙ ξαναδιαβάζει τον χρήστη από τη βάση, ώστε μια
    αλλαγή ρόλου (π.χ. υποβιβασμός admin) να ισχύει αμέσως."""
    if credentials is None:
        raise _unauthorized("Απαιτείται σύνδεση.")
    try:
        payload = jwt.decode(
            credentials.credentials, settings.secret_key, algorithms=[settings.jwt_algorithm]
        )
        if payload.get("purpose"):  # token 2ου βήματος: δεν είναι token πρόσβασης
            raise jwt.InvalidTokenError("not an access token")
        user_id = int(payload["sub"])
    except jwt.ExpiredSignatureError:
        raise _unauthorized("Η σύνδεση έληξε. Κάνε login ξανά.")
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise _unauthorized("Μη έγκυρο token.")

    user = db.fetch_one(
        "SELECT id, username, email, role, two_factor_enabled FROM users WHERE id = %s AND email_verified = 1",
        (user_id,),
    )
    if user is None:
        raise _unauthorized("Ο λογαριασμός δεν υπάρχει πλέον.")
    user["two_factor_enabled"] = bool(user["two_factor_enabled"])
    return user


def require_roles(*roles: str) -> Callable[..., dict]:
    def checker(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Δεν έχεις δικαίωμα πρόσβασης.")
        return user

    return checker


require_admin = require_roles("admin")
# Διαχείριση καταστήματος: ο admin για όλα, ο καταστηματάρχης για τα δικά του.
require_manager = require_roles("admin", "owner")
# Check-in στην είσοδο: προσωπικό, καταστηματάρχες, admin.
require_staff = require_roles("staff", "owner", "admin")


def managed_beach_ids(user: dict) -> Optional[list[int]]:
    """None = όλα τα καταστήματα (admin / staff), αλλιώς τα καταστήματα του καταστηματάρχη."""
    if user["role"] != "owner":
        return None
    return [r["id"] for r in db.fetch_all("SELECT id FROM beaches WHERE owner_id = %s ORDER BY id", (user["id"],))]


def ensure_can_manage(user: dict, beach_id: int) -> None:
    allowed = managed_beach_ids(user)
    if allowed is not None and beach_id not in allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Δεν είναι δικό σου κατάστημα.")
