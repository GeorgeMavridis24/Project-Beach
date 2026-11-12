"""Επιχειρησιακοί κανόνες κρατήσεων (καθαρές συναρτήσεις, χωρίς βάση).

Εδώ βρίσκεται η "λογική" που περιγράφεται στο κείμενο της πτυχιακής:
  * σεζόν λειτουργίας
  * ωράριο ΑΝΑ κατάστημα (κάθε beach bar έχει το δικό του)
  * ελεύθερη επιλογή ώρας άφιξης/αναχώρησης μέσα στο ωράριο
  * έλεγχος επικάλυψης χρονικών διαστημάτων
  * τιμολόγηση μισής / ολόκληρης ημέρας
"""

from datetime import date, datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Optional

from .config import settings


class BookingRuleError(ValueError):
    """Παραβίαση κανόνα κράτησης. Το μήνυμα εμφανίζεται στον χρήστη."""


def now() -> datetime:
    return datetime.now()


def today() -> date:
    return now().date()


def parse_time(value: str) -> time:
    try:
        return datetime.strptime(value, "%H:%M").time()
    except (TypeError, ValueError):
        raise BookingRuleError(f"Μη έγκυρη ώρα '{value}'. Χρησιμοποίησε μορφή ΩΩ:ΛΛ.")


def parse_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        raise BookingRuleError(f"Μη έγκυρη ημερομηνία '{value}'. Χρησιμοποίησε μορφή ΕΕΕΕ-ΜΜ-ΗΗ.")


def fmt_time(value) -> str:
    """time / timedelta (όπως τα επιστρέφει η MySQL) -> 'ΩΩ:ΛΛ'."""
    if isinstance(value, timedelta):
        minutes = int(value.total_seconds()) // 60
        return f"{minutes // 60:02d}:{minutes % 60:02d}"
    if isinstance(value, time):
        return value.strftime("%H:%M")
    return str(value)[:5]


def to_time(value) -> time:
    """Οποιαδήποτε αναπαράσταση ώρας (str/time/timedelta) -> time."""
    return value if isinstance(value, time) else parse_time(fmt_time(value))


def minutes(t: time) -> int:
    return t.hour * 60 + t.minute


def overlaps(a_start: time, a_end: time, b_start: time, b_end: time) -> bool:
    """Δύο μισάνοιχτα διαστήματα [a_start, a_end) και [b_start, b_end)
    επικαλύπτονται αν το καθένα ξεκινά πριν τελειώσει το άλλο.
    Έτσι 10:00-14:00 και 14:00-18:00 ΔΕΝ επικαλύπτονται."""
    return a_start < b_end and b_start < a_end


def within_hours(start: time, end: time, open_t: time, close_t: time) -> bool:
    return open_t <= start and end <= close_t


def in_season(d: date) -> bool:
    return settings.season_start_month <= d.month <= settings.season_end_month


def season_bounds(year: int) -> tuple[date, date]:
    start = date(year, settings.season_start_month, 1)
    if settings.season_end_month == 12:
        end = date(year, 12, 31)
    else:
        end = date(year, settings.season_end_month + 1, 1) - timedelta(days=1)
    return start, end


def first_bookable_date(ref: Optional[date] = None) -> date:
    ref = ref or today()
    if in_season(ref):
        return ref
    start, _ = season_bounds(ref.year)
    if ref < start:
        return start
    return season_bounds(ref.year + 1)[0]


def current_or_last_season(ref: Optional[date] = None) -> tuple[date, date]:
    """Η σεζόν που τρέχει ή, αν είμαστε εκτός σεζόν, η πιο πρόσφατη."""
    ref = ref or today()
    start, end = season_bounds(ref.year)
    if ref < start:
        return season_bounds(ref.year - 1)
    return start, end


def validate_hours(open_t: time, close_t: time) -> None:
    if close_t <= open_t:
        raise BookingRuleError("Η ώρα κλεισίματος πρέπει να είναι μετά την ώρα ανοίγματος.")


def validate_window(res_date: date, start: time, end: time, open_t: time, close_t: time) -> None:
    """Ελέγχει ότι μια κράτηση [start, end) την res_date επιτρέπεται στο
    κατάστημα με ωράριο [open_t, close_t]. Οι ώρες είναι ελεύθερες (ανά λεπτό)."""
    if not in_season(res_date):
        raise BookingRuleError(
            f"Κρατήσεις γίνονται μόνο μέσα στη σεζόν "
            f"(μήνες {settings.season_start_month}-{settings.season_end_month})."
        )
    if res_date < today():
        raise BookingRuleError("Δεν μπορείς να κάνεις κράτηση για ημερομηνία που πέρασε.")
    if end <= start:
        raise BookingRuleError("Η ώρα αναχώρησης πρέπει να είναι μετά την ώρα άφιξης.")
    if not within_hours(start, end, open_t, close_t):
        raise BookingRuleError(f"Το κατάστημα είναι ανοιχτό {fmt_time(open_t)}-{fmt_time(close_t)}.")
    if minutes(end) - minutes(start) < settings.min_booking_minutes:
        raise BookingRuleError(f"Η ελάχιστη διάρκεια κράτησης είναι {settings.min_booking_minutes} λεπτά.")
    if res_date == today() and end <= now().time():
        raise BookingRuleError("Το διάστημα που επέλεξες για σήμερα έχει ήδη περάσει.")


def compute_price(day_price, start: time, end: time) -> Decimal:
    """Τιμή κράτησης: έως HALF_DAY_MAX_HOURS ώρες -> μισή μέρα με έκπτωση,
    αλλιώς ολόκληρη τιμή ημέρας."""
    base = Decimal(str(day_price))
    hours = (minutes(end) - minutes(start)) / 60
    if hours <= settings.half_day_max_hours:
        base = base * Decimal(str(settings.half_day_factor))
    return base.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def has_started(res_date: date, start: time) -> bool:
    return datetime.combine(res_date, start) <= now()
