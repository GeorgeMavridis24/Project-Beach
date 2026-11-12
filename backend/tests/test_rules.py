"""Unit tests για τους κανόνες κρατήσεων (χωρίς βάση)."""

from datetime import date, datetime, time
from decimal import Decimal

import pytest

from app import booking_rules as rules
from app.booking_rules import BookingRuleError


def t(s):
    return rules.parse_time(s)


@pytest.mark.parametrize(
    "a,b,expected",
    [
        (("10:00", "14:00"), ("14:00", "18:00"), False),  # εφάπτονται: επιτρέπεται
        (("10:00", "14:00"), ("13:30", "18:00"), True),
        (("10:00", "18:00"), ("12:00", "13:00"), True),  # το ένα μέσα στο άλλο
        (("12:00", "13:00"), ("10:00", "18:00"), True),
        (("08:00", "10:00"), ("18:00", "20:00"), False),
    ],
)
def test_overlaps(a, b, expected):
    assert rules.overlaps(t(a[0]), t(a[1]), t(b[0]), t(b[1])) is expected


def test_price_half_and_full_day():
    assert rules.compute_price(20, t("08:00"), t("14:00")) == Decimal("12.00")  # 6 ώρες -> 60%
    assert rules.compute_price(20, t("08:00"), t("20:00")) == Decimal("20.00")
    assert rules.compute_price(15, t("10:00"), t("11:00")) == Decimal("9.00")


def test_validate_window_rules(freeze_now):
    freeze_now(datetime(2027, 6, 15, 12, 0))
    hours = (t("08:00"), t("22:00"))
    rules.validate_window(date(2027, 6, 15), t("12:30"), t("14:00"), *hours)  # OK
    rules.validate_window(date(2027, 6, 20), t("10:17"), t("13:43"), *hours)  # ελεύθερα λεπτά: OK
    rules.validate_window(date(2027, 6, 20), t("08:00"), t("22:00"), *hours)  # όλο το ωράριο: OK
    cases = [
        (date(2027, 12, 1), "10:00", "12:00", "σεζόν"),
        (date(2027, 6, 14), "10:00", "12:00", "πέρασε"),
        (date(2027, 6, 20), "12:00", "10:00", "μετά"),
        (date(2027, 6, 20), "07:30", "10:00", "08:00-22:00"),
        (date(2027, 6, 20), "21:00", "22:30", "08:00-22:00"),
        (date(2027, 6, 20), "10:00", "10:30", "ελάχιστη"),
        (date(2027, 6, 15), "09:00", "11:00", "έχει ήδη περάσει"),
    ]
    for d, a, b, msg in cases:
        with pytest.raises(BookingRuleError, match=msg):
            rules.validate_window(d, t(a), t(b), *hours)


def test_validate_hours():
    rules.validate_hours(t("09:00"), t("21:00"))
    with pytest.raises(BookingRuleError):
        rules.validate_hours(t("22:00"), t("08:00"))


def test_first_bookable_date_and_season():
    assert rules.first_bookable_date(date(2026, 11, 12)) == date(2027, 5, 1)
    assert rules.first_bookable_date(date(2027, 2, 1)) == date(2027, 5, 1)
    assert rules.first_bookable_date(date(2027, 7, 3)) == date(2027, 7, 3)
    assert rules.current_or_last_season(date(2026, 11, 12)) == (date(2026, 5, 1), date(2026, 10, 31))
    assert rules.current_or_last_season(date(2027, 3, 1)) == (date(2026, 5, 1), date(2026, 10, 31))


def test_fmt_time_handles_mysql_timedelta():
    from datetime import timedelta

    assert rules.fmt_time(timedelta(hours=9, minutes=30)) == "09:30"
    assert rules.fmt_time(time(18, 0)) == "18:00"
