"""AI βοηθός της εφαρμογής (Claude API + tool use).

Αρχιτεκτονική
-------------
1. Η εφαρμογή στέλνει το ιστορικό της συνομιλίας (μόνο κείμενο).
2. Ο server καλεί το Claude με 4 εργαλεία (tools) που διαβάζουν την ΙΔΙΑ βάση
   με την εφαρμογή, μέσω των ίδιων services.
3. Το Claude αποφασίζει ποια εργαλεία θα καλέσει. Ο tool runner του SDK
   εκτελεί τις κλήσεις και επιστρέφει τα αποτελέσματα μέχρι να βγει απάντηση.
4. Ο βοηθός ΔΕΝ κάνει κρατήσεις μόνος του: το `propose_booking` απλώς
   ετοιμάζει πρόταση, την οποία ο χρήστης επιβεβαιώνει με κουμπί στην
   εφαρμογή (human-in-the-loop). Έτσι ένα λάθος του μοντέλου δεν χρεώνει
   ποτέ τον πελάτη χωρίς τη συγκατάθεσή του.
"""

import json
import logging
from typing import Optional

import anthropic
from anthropic import beta_tool

from . import booking_rules as rules
from .config import settings
from .errors import ConflictError, NotFoundError
from .services import beaches as beach_service
from .services import bookings as booking_service

log = logging.getLogger("smartbeach.assistant")

WEEKDAYS = ["Δευτέρα", "Τρίτη", "Τετάρτη", "Πέμπτη", "Παρασκευή", "Σάββατο", "Κυριακή"]

SYSTEM_PROMPT = """You are the SmartBeach assistant, the in-app helper of SmartBeach, a mobile app for booking sunbeds at beach bars.

You talk to the app's customers on their phones, usually in Greek. Reply in the language the user writes in (Greek by default). Keep replies short and friendly: a few sentences or a short list fits a phone screen. Write plain text without Markdown tables or headings.

Your tools:
- search_beaches: find beach bars and compare prices and free sunbeds for a date and time window.
- get_sunbed_availability: list the free sunbeds of one beach for a date and time window.
- get_my_bookings: the user's own upcoming bookings.
- propose_booking: prepare a booking for the user to confirm. It does not book anything. The app shows the user a confirmation card and only the user's tap creates the booking, so after calling it, tell the user to tap «Επιβεβαίωση» on the card.

How to work:
- Every fact about beaches, prices, free sunbeds and bookings comes from a tool result. Never invent sunbeds, prices or availability. When a tool returns an error, explain it simply and suggest an alternative such as another time window, date or beach.
- Every beach bar has its own opening hours (open_time-close_time in the tool results). Customers pick any arrival and leaving time within those hours, to the minute.
- propose_booking needs a beach, a date, an arrival time and a leaving time. When the user hasn't given them, ask briefly; "all day" means the beach's whole opening hours. Choose a specific free sunbed from get_sunbed_availability that fits what the user asked for (premium/VIP, close to the sea, or cheapest).
- Rows are numbered from the sea: row 1 is the first row on the sand, next to the water.
- You cannot cancel or change bookings. For that, point the user to the «Κρατήσεις» tab of the app, where each booking also has a «Αποστολή στο email» button to send it with its QR code to any email address.
- When someone owns a beach bar and wants to join SmartBeach as a partner, explain that the «Προφίλ» tab has «Γίνε συνεργάτης»: a step-by-step guide where they enter their business details, pin the location on the map, set opening hours and design their sunbed layout with a live preview. The SmartBeach team reviews the request, can talk with them through messages in the app, and once it is approved the shop is created automatically and they manage it from «Προφίλ → Το κατάστημά μου».
- For requests unrelated to SmartBeach, beaches or the user's visit, say briefly that you can only help with SmartBeach.

Business rules: bookings only in months {season_from}-{season_to}, within the opening hours of each beach bar; minimum {min_minutes} minutes. A booking of up to {half_hours:g} hours costs {half_pct}% of the sunbed's daily price (half day); a longer one costs the full daily price. Customers receive a confirmation email with their QR code after booking."""


def _system_blocks(user: dict) -> list[dict]:
    stable = SYSTEM_PROMPT.format(
        season_from=settings.season_start_month,
        season_to=settings.season_end_month,
        min_minutes=settings.min_booking_minutes,
        half_hours=settings.half_day_max_hours,
        half_pct=round(settings.half_day_factor * 100),
    )
    today = rules.today()
    context = (
        f"Today is {WEEKDAYS[today.weekday()]} {today.isoformat()}. "
        f"The earliest date that can be booked is {rules.first_bookable_date().isoformat()}. "
        f"The user's name is {user['username']}."
    )
    # Το σταθερό κομμάτι πρώτα (cacheable), το μεταβλητό (ημερομηνία) μετά.
    return [
        {"type": "text", "text": stable, "cache_control": {"type": "ephemeral"}},
        {"type": "text", "text": context},
    ]


def _json(data) -> str:
    return json.dumps(data, ensure_ascii=False, default=str)


def _opt_time(value: Optional[str]):
    return rules.parse_time(value) if value else None


def build_tools(user: dict, proposals: list[dict]) -> list:
    """Δημιουργεί τα εργαλεία για ΕΝΑΝ χρήστη (closures), ώστε π.χ. το
    get_my_bookings να μη μπορεί ποτέ να δει κρατήσεις άλλου χρήστη."""

    @beta_tool
    def search_beaches(
        date: Optional[str] = None,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        sunbed_type: Optional[str] = None,
        max_price: Optional[float] = None,
        query: Optional[str] = None,
    ) -> str:
        """Search the SmartBeach beach bars with their sunbed prices and, when a date is given, how many sunbeds are free.

        Args:
            date: Date as YYYY-MM-DD to count free sunbeds for. Omit it to list beaches without availability.
            start_time: Start of the time window as HH:MM. Omit both times to use each beach's full opening hours.
            end_time: End of the time window as HH:MM.
            sunbed_type: "normal" or "premium" (VIP, front rows) to only consider that type.
            max_price: Only consider sunbeds whose daily price is at most this many euros.
            query: Text to match in the beach name or description.
        """
        if sunbed_type not in (None, "normal", "premium"):
            raise ValueError('sunbed_type must be "normal" or "premium".')
        if bool(start_time) != bool(end_time):
            raise ValueError("Give both start_time and end_time, or neither.")
        results = beach_service.search_beaches(
            q=query,
            res_date=rules.parse_date(date) if date else None,
            start=_opt_time(start_time),
            end=_opt_time(end_time),
            sunbed_type=sunbed_type,
            max_price=max_price,
            sort="availability" if date else "name",
        )
        return _json(
            [
                {
                    "beach_id": b["id"],
                    "name": b["name"],
                    "description": b["description"],
                    "opening_hours": f"{b['open_time']}-{b['close_time']}",
                    "open_for_requested_time": b["open_for_window"],
                    "sunbeds": b["total_sunbeds"],
                    "premium_sunbeds": b["premium_sunbeds"],
                    "daily_price_from": b["min_price"],
                    "daily_price_to": b["max_price"],
                    "free_sunbeds": b["available_sunbeds"],
                }
                for b in results
            ]
        )

    @beta_tool
    def get_sunbed_availability(
        beach_id: int,
        date: str,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        sunbed_type: Optional[str] = None,
        max_price: Optional[float] = None,
    ) -> str:
        """List the free sunbeds of one beach for a date and time window, closest to the sea first.

        Args:
            beach_id: The beach id from search_beaches.
            date: Date as YYYY-MM-DD.
            start_time: Start of the time window as HH:MM. Defaults to the beach's opening time.
            end_time: End of the time window as HH:MM. Defaults to the beach's closing time.
            sunbed_type: "normal" or "premium" to only list that type.
            max_price: Only list sunbeds whose daily price is at most this many euros.
        """
        if sunbed_type not in (None, "normal", "premium"):
            raise ValueError('sunbed_type must be "normal" or "premium".')
        res = beach_service.sunbed_map(
            beach_id,
            rules.parse_date(date),
            _opt_time(start_time),
            _opt_time(end_time),
            sunbed_type,
            max_price,
        )
        if res is None:
            raise ValueError(f"There is no beach with id {beach_id}.")
        free = [s for s in res["sunbeds"] if s["status"] == "available"]
        free.sort(key=lambda s: (s["grid_x"], s["price"], s["grid_y"]))
        return _json(
            {
                "beach": res["beach"]["name"],
                "opening_hours": f"{res['beach']['open_time']}-{res['beach']['close_time']}",
                "date": res["date"],
                "window": f"{res['start_time']}-{res['end_time']}",
                "can_be_booked": res["bookable"],
                "reason_if_not": res["reason"],
                "rows": res["rows"],
                "free_count": len(free),
                "booked_count": res["summary"]["booked"],
                "free_sunbeds": [
                    {
                        "sunbed_id": s["id"],
                        "row": s["grid_x"],
                        "position": s["grid_y"],
                        "type": s["type"],
                        "daily_price": s["price"],
                        "price_for_window": s["quoted_price"],
                    }
                    for s in free[:25]
                ],
                "note": "Only the first 25 free sunbeds are listed." if len(free) > 25 else None,
            }
        )

    @beta_tool
    def get_my_bookings() -> str:
        """Get the current user's upcoming confirmed bookings."""
        items = booking_service.list_for_user(user["id"], "upcoming")
        return _json(
            [
                {
                    "booking_id": b["booking_id"],
                    "beach": b["beach_name"],
                    "date": b["res_date"],
                    "window": f"{b['start_time']}-{b['end_time']}",
                    "row": b["grid_x"],
                    "position": b["grid_y"],
                    "type": b["type"],
                    "price": b["price"],
                    "checked_in": b["checked_in"],
                }
                for b in items
            ]
        )

    @beta_tool
    def propose_booking(sunbed_id: int, date: str, start_time: str, end_time: str) -> str:
        """Prepare a booking that the user confirms with a button in the app. It checks that the sunbed is free and returns the price, but does not book.

        Args:
            sunbed_id: The sunbed id from get_sunbed_availability.
            date: Date as YYYY-MM-DD.
            start_time: Arrival time as HH:MM.
            end_time: Leaving time as HH:MM.
        """
        try:
            q = booking_service.quote(
                sunbed_id, rules.parse_date(date), rules.parse_time(start_time), rules.parse_time(end_time)
            )
        except (NotFoundError, ConflictError) as exc:
            raise ValueError(str(exc))
        key = (q["sunbed_id"], q["res_date"], q["start_time"], q["end_time"])
        if not any((p["sunbed_id"], p["res_date"], p["start_time"], p["end_time"]) == key for p in proposals):
            proposals.append(q)
        return _json({"status": "confirmation card shown to the user", "proposal": q})

    return [search_beaches, get_sunbed_availability, get_my_bookings, propose_booking]


class AssistantUnavailable(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


_client: Optional[anthropic.Anthropic] = None


def get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(timeout=90.0, max_retries=2)
    return _client


def _final_text(message) -> str:
    return "\n\n".join(b.text.strip() for b in message.content if b.type == "text" and b.text.strip())


def chat(user: dict, messages: list[dict]) -> dict:
    """Τρέχει μία "στροφή" της συνομιλίας και επιστρέφει {reply, proposals}."""
    # Η συζήτηση πρέπει να ξεκινά και να τελειώνει με μήνυμα του χρήστη.
    while messages and messages[0]["role"] != "user":
        messages = messages[1:]
    if not messages or messages[-1]["role"] != "user":
        raise AssistantUnavailable(400, "Το τελευταίο μήνυμα πρέπει να είναι του χρήστη.")

    proposals: list[dict] = []
    try:
        runner = get_client().beta.messages.tool_runner(
            model=settings.assistant_model,
            max_tokens=16000,
            system=_system_blocks(user),
            tools=build_tools(user, proposals),
            messages=messages,
            max_iterations=settings.assistant_max_iterations,
            output_config={"effort": settings.assistant_effort},
            # Αν το μοντέλο αρνηθεί λόγω φίλτρων ασφαλείας, το API ξανατρέχει
            # αυτόματα το αίτημα σε κατάλληλο εναλλακτικό μοντέλο.
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
        final = runner.until_done()
    except (anthropic.AuthenticationError, anthropic.PermissionDeniedError):
        raise AssistantUnavailable(503, "Ο βοηθός δεν έχει ρυθμιστεί σωστά (κλειδί Claude API).")
    except anthropic.RateLimitError:
        raise AssistantUnavailable(429, "Ο βοηθός είναι πολύ απασχολημένος. Δοκίμασε ξανά σε λίγο.")
    except anthropic.BadRequestError as exc:
        log.error("Claude API bad request: %s", exc.message)
        raise AssistantUnavailable(502, "Ο βοηθός δεν μπόρεσε να απαντήσει σε αυτό το μήνυμα.")
    except anthropic.APIStatusError as exc:
        log.error("Claude API error %s: %s", exc.status_code, exc.message)
        raise AssistantUnavailable(502, "Ο βοηθός δεν είναι διαθέσιμος αυτή τη στιγμή.")
    except anthropic.APIConnectionError:
        raise AssistantUnavailable(503, "Δεν υπάρχει σύνδεση με την υπηρεσία του βοηθού.")
    except TypeError as exc:
        # Το SDK πετάει TypeError όταν δεν βρίσκει κανένα κλειδί/διαπιστευτήρια.
        if "authentication" in str(exc).lower():
            raise AssistantUnavailable(503, "Ο βοηθός δεν έχει ρυθμιστεί (λείπει το ANTHROPIC_API_KEY).")
        raise

    if final.stop_reason == "refusal":
        reply = "Δυστυχώς δεν μπορώ να βοηθήσω με αυτό. Μπορώ όμως να σε βοηθήσω με παραλίες και κρατήσεις!"
    else:
        reply = _final_text(final)
        if not reply:
            reply = "Συγγνώμη, δεν κατάφερα να ολοκληρώσω την απάντηση. Μπορείς να το ξαναπείς πιο απλά;"
    return {"reply": reply, "proposals": proposals, "model": getattr(final, "model", None)}
