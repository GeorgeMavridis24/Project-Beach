from fastapi import APIRouter, Depends, HTTPException, status
from mysql.connector import errors as mysql_errors

from .. import db
from ..schemas import LoginIn, RegisterIn
from ..security import create_access_token, get_current_user, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["Αυθεντικοποίηση"])


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(data: RegisterIn):
    try:
        _, user_id = db.execute(
            "INSERT INTO users (username, email, password, role) VALUES (%s, %s, %s, 'user')",
            (data.username, data.email.lower(), hash_password(data.password)),
        )
    except mysql_errors.IntegrityError:
        raise HTTPException(status_code=409, detail="Υπάρχει ήδη λογαριασμός με αυτό το email.")
    return {"id": user_id, "username": data.username, "email": data.email.lower(), "role": "user"}


@router.post("/login")
def login(data: LoginIn):
    user = db.fetch_one(
        "SELECT id, username, email, password, role FROM users WHERE email = %s",
        (data.email.strip().lower(),),
    )
    if user is None or not verify_password(data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Λάθος email ή κωδικός.")
    return {
        "access_token": create_access_token(user["id"], user["role"]),
        "token_type": "bearer",
        "user": {"id": user["id"], "username": user["username"], "email": user["email"], "role": user["role"]},
    }


@router.get("/me")
def me(user: dict = Depends(get_current_user)):
    return user
