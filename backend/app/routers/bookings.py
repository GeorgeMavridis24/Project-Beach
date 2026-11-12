from typing import Literal

from fastapi import APIRouter, Depends

from .. import booking_rules as rules
from ..schemas import BookingCreateIn, BookingTimeIn
from ..security import get_current_user
from ..services import bookings as booking_service

router = APIRouter(prefix="/bookings", tags=["Κρατήσεις πελάτη"])


@router.post("", status_code=201)
def create_booking(data: BookingCreateIn, user: dict = Depends(get_current_user)):
    return booking_service.create_booking(
        user["id"],
        data.sunbed_id,
        data.res_date,
        rules.parse_time(data.start_time),
        rules.parse_time(data.end_time),
    )


@router.get("/me")
def my_bookings(
    scope: Literal["upcoming", "past", "cancelled", "all"] = "upcoming",
    user: dict = Depends(get_current_user),
):
    return booking_service.list_for_user(user["id"], scope)


@router.put("/{booking_id}/time")
def change_my_time(booking_id: int, data: BookingTimeIn, user: dict = Depends(get_current_user)):
    return booking_service.update_times(
        booking_id, rules.parse_time(data.start_time), rules.parse_time(data.end_time), user_id=user["id"]
    )


@router.post("/{booking_id}/cancel")
def cancel_my_booking(booking_id: int, user: dict = Depends(get_current_user)):
    return booking_service.cancel(booking_id, user_id=user["id"])
