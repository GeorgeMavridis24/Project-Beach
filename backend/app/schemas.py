"""Pydantic μοντέλα: ορίζουν και ΕΛΕΓΧΟΥΝ το JSON που δέχεται το API."""

from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

TIME_PATTERN = r"^([01]\d|2[0-3]):[0-5]\d$"
EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"

Role = Literal["user", "staff", "owner", "admin"]
SunbedType = Literal["normal", "premium"]


class RegisterIn(BaseModel):
    username: str = Field(min_length=2, max_length=50)
    email: str = Field(pattern=EMAIL_PATTERN, max_length=100)
    password: str = Field(min_length=6, max_length=72)
    # Σκόπιμα ΔΕΝ υπάρχει πεδίο role: κάθε νέος λογαριασμός είναι 'user'.

    @field_validator("username", "email")
    @classmethod
    def strip(cls, v: str) -> str:
        return v.strip()

    @field_validator("password")
    @classmethod
    def password_bytes(cls, v: str) -> str:
        if len(v.encode("utf-8")) > 72:
            raise ValueError("Ο κωδικός είναι πολύ μεγάλος.")
        return v


class LoginIn(BaseModel):
    email: str
    password: str


class UserUpdateIn(BaseModel):
    username: Optional[str] = Field(default=None, min_length=2, max_length=50)
    email: Optional[str] = Field(default=None, pattern=EMAIL_PATTERN, max_length=100)
    role: Optional[Role] = None


class BeachIn(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    description: str = Field(default="", max_length=2000)
    ltd: float = Field(ge=-90, le=90)
    lgd: float = Field(ge=-180, le=180)
    # Ωράριο λειτουργίας του καταστήματος (αν λείπει: προεπιλογή από ρυθμίσεις)
    open_time: Optional[str] = Field(default=None, pattern=TIME_PATTERN)
    close_time: Optional[str] = Field(default=None, pattern=TIME_PATTERN)
    # Καταστηματάρχης (το αλλάζει μόνο ο admin). 0 = κανένας.
    owner_id: Optional[int] = None


class GridIn(BaseModel):
    rows: int = Field(ge=1, le=30)
    cols: int = Field(ge=1, le=30)
    premium_rows: int = Field(ge=0, le=30)
    premium_price: float = Field(gt=0, le=9999)
    price: float = Field(gt=0, le=9999)

    @model_validator(mode="after")
    def premium_le_rows(self) -> "GridIn":
        if self.premium_rows > self.rows:
            raise ValueError("Οι VIP σειρές δεν μπορεί να είναι περισσότερες από τις σειρές.")
        return self


class SunbedUpdateIn(BaseModel):
    price: float = Field(gt=0, le=9999)
    type: SunbedType
    status: Literal["active", "out_of_order"] = "active"


class BookingCreateIn(BaseModel):
    sunbed_id: int
    res_date: date
    start_time: str = Field(pattern=TIME_PATTERN)
    end_time: str = Field(pattern=TIME_PATTERN)


class BookingTimeIn(BaseModel):
    start_time: str = Field(pattern=TIME_PATTERN)
    end_time: str = Field(pattern=TIME_PATTERN)


class CheckinIn(BaseModel):
    code: str = Field(min_length=4, max_length=64)


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class ChatIn(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=40)


PHONE_PATTERN = r"^[0-9 +()\-]{7,20}$"


class PartnerRequestIn(BaseModel):
    """Αίτηση "Γίνε συνεργάτης": στοιχεία επιχείρησης και διάταξη του χώρου."""

    business_name: str = Field(min_length=2, max_length=100)
    description: str = Field(default="", max_length=2000)
    phone: str = Field(pattern=PHONE_PATTERN)
    ltd: float = Field(ge=-90, le=90)
    lgd: float = Field(ge=-180, le=180)
    open_time: str = Field(pattern=TIME_PATTERN)
    close_time: str = Field(pattern=TIME_PATTERN)
    rows: int = Field(ge=1, le=30)
    cols: int = Field(ge=1, le=30)
    premium_rows: int = Field(ge=0, le=30)
    premium_price: float = Field(gt=0, le=9999)
    price: float = Field(gt=0, le=9999)
    message: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("business_name", "description", "phone")
    @classmethod
    def strip(cls, v: str) -> str:
        return v.strip()

    @model_validator(mode="after")
    def check(self) -> "PartnerRequestIn":
        if self.premium_rows > self.rows:
            raise ValueError("Οι VIP σειρές δεν μπορεί να είναι περισσότερες από τις σειρές.")
        if self.close_time <= self.open_time:
            raise ValueError("Η ώρα κλεισίματος πρέπει να είναι μετά την ώρα ανοίγματος.")
        return self


class MessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=2000)

    @field_validator("body")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Το μήνυμα είναι κενό.")
        return v.strip()


class DecisionIn(BaseModel):
    note: Optional[str] = Field(default=None, max_length=2000)


class BookingEmailIn(BaseModel):
    """Αποστολή κράτησης σε email. Αν λείπει το `to`, πάει στο email του χρήστη."""

    to: Optional[str] = Field(default=None, pattern=EMAIL_PATTERN, max_length=100)


CODE_PATTERN = r"^\s*\d{6}\s*$"


class VerifyEmailIn(BaseModel):
    email: str = Field(max_length=100)
    code: str = Field(pattern=CODE_PATTERN)


class ResendCodeIn(BaseModel):
    """Νέος κωδικός: με email (επαλήθευση εγγραφής) ή με challenge (σύνδεση 2 βημάτων)."""

    email: Optional[str] = Field(default=None, max_length=100)
    challenge: Optional[str] = Field(default=None, max_length=2000)


class LoginVerifyIn(BaseModel):
    challenge: str = Field(max_length=2000)
    code: str = Field(pattern=CODE_PATTERN)


class TwoFactorIn(BaseModel):
    enabled: bool
    password: str = Field(min_length=1, max_length=72)


class AdminUserCreateIn(BaseModel):
    """Νέος χρήστης από τον διαχειριστή (ενεργός αμέσως, χωρίς κωδικό email)."""

    username: str = Field(min_length=2, max_length=50)
    email: str = Field(pattern=EMAIL_PATTERN, max_length=100)
    password: str = Field(min_length=6, max_length=72)
    role: Role = "user"

    @field_validator("username", "email")
    @classmethod
    def strip(cls, v: str) -> str:
        return v.strip()
