from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends

from .. import booking_rules as rules
from ..config import settings
from ..schemas import CheckinIn
from ..security import require_staff
from ..services import bookings as booking_service

router = APIRouter(prefix="/staff", tags=["Προσωπικό"])


@router.post("/checkin")
def check_in(data: CheckinIn, _: dict = Depends(require_staff)):
    """Σάρωση του QR του πελάτη στην είσοδο."""
    return booking_service.check_in(data.code, require_today=settings.checkin_require_today)


@router.get("/bookings")
def bookings_of_day(day: Optional[date] = None, beach_id: Optional[int] = None, _: dict = Depends(require_staff)):
    return booking_service.list_for_day(day or rules.today(), beach_id)
