"""Αναζήτηση παραλιών με φίλτρα και διαθεσιμότητα ξαπλωστρών.

Οι ίδιες συναρτήσεις χρησιμοποιούνται από τα REST endpoints ΚΑΙ από τον
AI βοηθό, ώστε ο βοηθός να βλέπει ακριβώς τα ίδια δεδομένα με την εφαρμογή.
"""

import math
from datetime import date, time
from typing import Optional

from .. import db
from ..booking_rules import (
    BookingRuleError,
    closing,
    compute_price,
    fmt_time,
    in_season,
    opening,
    overlaps,
    parse_time,
    today,
)

SORTS = {"name", "price", "availability", "distance"}


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def search_beaches(
    q: Optional[str] = None,
    res_date: Optional[date] = None,
    start: Optional[time] = None,
    end: Optional[time] = None,
    sunbed_type: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    available_only: bool = False,
    sort: str = "name",
    lat: Optional[float] = None,
    lon: Optional[float] = None,
) -> list[dict]:
    """Λίστα παραλιών με στατιστικά ξαπλωστρών που ταιριάζουν στα φίλτρα.

    Αν δοθεί ημερομηνία, υπολογίζεται και πόσες ξαπλώστρες είναι ελεύθερες
    στο διάστημα [start, end) (προεπιλογή: όλο το ωράριο)."""
    start = start or opening()
    end = end or closing()

    join_filters = ["s.status = 'active'"]
    join_params: list = []
    if sunbed_type:
        join_filters.append("s.type = %s")
        join_params.append(sunbed_type)
    if min_price is not None:
        join_filters.append("s.price >= %s")
        join_params.append(min_price)
    if max_price is not None:
        join_filters.append("s.price <= %s")
        join_params.append(max_price)

    if res_date is not None:
        available_expr = """SUM(CASE WHEN s.id IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM reserves r
                WHERE r.sunbed_id = s.id AND r.res_date = %s AND r.status = 'confirmed'
                  AND r.res_time < %s AND r.leave_time > %s) THEN 1 ELSE 0 END)"""
        select_params = [res_date, end, start]
    else:
        available_expr = "NULL"
        select_params = []

    where, where_params = [], []
    if q:
        where.append("(b.name LIKE %s OR b.description LIKE %s)")
        like = f"%{q.strip()}%"
        where_params += [like, like]

    sql = f"""
        SELECT b.id, b.name, b.description, b.ltd, b.lgd,
               COUNT(s.id) AS total_sunbeds,
               SUM(CASE WHEN s.type = 'premium' THEN 1 ELSE 0 END) AS premium_sunbeds,
               MIN(s.price) AS min_price,
               MAX(s.price) AS max_price,
               {available_expr} AS available_sunbeds
        FROM beaches b
        LEFT JOIN sunbeds s ON s.beach_id = b.id AND {' AND '.join(join_filters)}
        {('WHERE ' + ' AND '.join(where)) if where else ''}
        GROUP BY b.id, b.name, b.description, b.ltd, b.lgd
    """
    rows = db.fetch_all(sql, select_params + join_params + where_params)

    beaches = []
    for row in rows:
        item = {
            "id": row["id"],
            "name": row["name"],
            "description": row["description"] or "",
            "ltd": float(row["ltd"]),
            "lgd": float(row["lgd"]),
            "total_sunbeds": int(row["total_sunbeds"] or 0),
            "premium_sunbeds": int(row["premium_sunbeds"] or 0),
            "min_price": float(row["min_price"]) if row["min_price"] is not None else None,
            "max_price": float(row["max_price"]) if row["max_price"] is not None else None,
            "available_sunbeds": int(row["available_sunbeds"]) if row["available_sunbeds"] is not None else None,
            "distance_km": None,
        }
        if lat is not None and lon is not None:
            item["distance_km"] = round(haversine_km(lat, lon, item["ltd"], item["lgd"]), 2)
        beaches.append(item)

    # Αν υπάρχουν φίλτρα τιμής/τύπου, κρύβουμε παραλίες χωρίς καμία κατάλληλη ξαπλώστρα.
    if sunbed_type or min_price is not None or max_price is not None:
        beaches = [b for b in beaches if b["total_sunbeds"] > 0]
    if available_only and res_date is not None:
        beaches = [b for b in beaches if (b["available_sunbeds"] or 0) > 0]

    if sort == "price":
        beaches.sort(key=lambda b: (b["min_price"] is None, b["min_price"] or 0, b["name"]))
    elif sort == "availability":
        beaches.sort(key=lambda b: (-(b["available_sunbeds"] or 0), b["name"]))
    elif sort == "distance" and lat is not None and lon is not None:
        beaches.sort(key=lambda b: b["distance_km"])
    else:
        beaches.sort(key=lambda b: b["name"].lower())
    return beaches


def get_beach(beach_id: int) -> Optional[dict]:
    row = db.fetch_one("SELECT id, name, description, ltd, lgd FROM beaches WHERE id = %s", (beach_id,))
    if row:
        row["ltd"], row["lgd"] = float(row["ltd"]), float(row["lgd"])
        row["description"] = row["description"] or ""
    return row


def sunbed_map(
    beach_id: int,
    res_date: date,
    start: Optional[time] = None,
    end: Optional[time] = None,
    sunbed_type: Optional[str] = None,
    max_price: Optional[float] = None,
    only_available: bool = False,
) -> Optional[dict]:
    """Ο "χάρτης" μιας παραλίας για μια ημερομηνία: κάθε ξαπλώστρα με θέση,
    κατάσταση για το επιλεγμένο διάστημα, κλεισμένα διαστήματα και τιμή."""
    beach = get_beach(beach_id)
    if beach is None:
        return None
    start = start or opening()
    end = end or closing()

    sunbeds = db.fetch_all(
        "SELECT id, grid_x, grid_y, price, type, status FROM sunbeds WHERE beach_id = %s ORDER BY grid_x, grid_y",
        (beach_id,),
    )
    bookings = db.fetch_all(
        """SELECT r.sunbed_id, r.res_time, r.leave_time
           FROM reserves r JOIN sunbeds s ON s.id = r.sunbed_id
           WHERE s.beach_id = %s AND r.res_date = %s AND r.status = 'confirmed'
           ORDER BY r.res_time""",
        (beach_id, res_date),
    )
    slots: dict[int, list[tuple]] = {}
    for b in bookings:
        slots.setdefault(b["sunbed_id"], []).append((b["res_time"], b["leave_time"]))

    def as_time(v) -> time:
        return parse_time(fmt_time(v))

    result = []
    for s in sunbeds:
        booked = [(as_time(a), as_time(b)) for a, b in slots.get(s["id"], [])]
        if s["status"] == "out_of_order":
            state = "out_of_order"
        elif any(overlaps(start, end, a, b) for a, b in booked):
            state = "booked"
        else:
            state = "available"
        item = {
            "id": s["id"],
            "grid_x": s["grid_x"],
            "grid_y": s["grid_y"],
            "type": s["type"],
            "price": float(s["price"]),
            "quoted_price": float(compute_price(s["price"], start, end)),
            "status": state,
            "booked_slots": [{"start": fmt_time(a), "end": fmt_time(b)} for a, b in booked],
        }
        if sunbed_type and item["type"] != sunbed_type:
            continue
        if max_price is not None and item["price"] > max_price:
            continue
        if only_available and state != "available":
            continue
        result.append(item)

    bookable, reason = True, None
    if not in_season(res_date):
        bookable, reason = False, "Η ημερομηνία είναι εκτός σεζόν."
    elif res_date < today():
        bookable, reason = False, "Η ημερομηνία έχει περάσει."

    return {
        "beach": beach,
        "date": res_date.isoformat(),
        "start_time": fmt_time(start),
        "end_time": fmt_time(end),
        "rows": max((s["grid_x"] for s in sunbeds), default=0),
        "cols": max((s["grid_y"] for s in sunbeds), default=0),
        "bookable": bookable,
        "reason": reason,
        "summary": {
            "total": len(sunbeds),
            "available": sum(1 for s in result if s["status"] == "available"),
            "booked": sum(1 for s in result if s["status"] == "booked"),
            "out_of_order": sum(1 for s in result if s["status"] == "out_of_order"),
        },
        "sunbeds": result,
    }


def require_valid_filters(sort: str, sunbed_type: Optional[str]) -> None:
    if sort not in SORTS:
        raise BookingRuleError(f"Άγνωστη ταξινόμηση '{sort}'.")
    if sunbed_type not in (None, "normal", "premium"):
        raise BookingRuleError("Ο τύπος πρέπει να είναι 'normal' ή 'premium'.")
