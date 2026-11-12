"""Κρυπτογράφηση κωδικών (bcrypt), JWT tokens και έλεγχος ρόλων."""

from datetime import datetime, timedelta, timezone
from typing import Callable

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
        user_id = int(payload["sub"])
    except jwt.ExpiredSignatureError:
        raise _unauthorized("Η σύνδεση έληξε. Κάνε login ξανά.")
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise _unauthorized("Μη έγκυρο token.")

    user = db.fetch_one("SELECT id, username, email, role FROM users WHERE id = %s", (user_id,))
    if user is None:
        raise _unauthorized("Ο λογαριασμός δεν υπάρχει πλέον.")
    return user


def require_roles(*roles: str) -> Callable[..., dict]:
    def checker(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Δεν έχεις δικαίωμα πρόσβασης.")
        return user

    return checker


require_admin = require_roles("admin")
require_staff = require_roles("staff", "admin")
