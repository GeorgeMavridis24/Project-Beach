"""Στατιστικά για το dashboard του διαχειριστή.

Πληρότητα (occupancy) = κλεισμένα λεπτά ξαπλώστρας / διαθέσιμα λεπτά ξαπλώστρας
όπου διαθέσιμα = Σ(ενεργές ξαπλώστρες x λεπτά ωραρίου ΤΟΥ καταστήματος) x ημέρες.
"""

from datetime import date, timedelta
from typing import Optional

from .. import booking_rules as rules
from .. import db

WEEKDAYS = ["Δευ", "Τρι", "Τετ", "Πεμ", "Παρ", "Σαβ", "Κυρ"]
MONTHS = ["", "Ιαν", "Φεβ", "Μαρ", "Απρ", "Μάι", "Ιούν", "Ιούλ", "Αύγ", "Σεπ", "Οκτ", "Νοέ", "Δεκ"]


def _f(v) -> float:
    return float(v) if v is not None else 0.0


def _i(v) -> int:
    return int(v) if v is not None else 0


def dashboard(
    date_from: date,
    date_to: date,
    beach_ids: Optional[list[int]] = None,
    heat_beach_id: Optional[int] = None,
) -> dict:
    """beach_ids: None = όλα τα καταστήματα, αλλιώς μόνο αυτά.
    heat_beach_id: για ποιο κατάστημα να υπολογιστεί ο χάρτης θερμότητας."""
    if beach_ids is not None and not beach_ids:
        beach_ids = [-1]  # κανένα κατάστημα -> άδεια αποτελέσματα
    beach_sql = f" AND s.beach_id IN ({', '.join(['%s'] * len(beach_ids))})" if beach_ids else ""
    beach_params = list(beach_ids) if beach_ids else []
    base_where = "r.res_date BETWEEN %s AND %s" + beach_sql
    base_params = [date_from, date_to] + beach_params

    days = (date_to - date_from).days + 1

    # Διαθέσιμα λεπτά ανά ημέρα για κάθε κατάστημα = ενεργές ξαπλώστρες x λεπτά ωραρίου του
    cap_rows = db.fetch_all(
        """SELECT b.id, TIME_TO_SEC(TIMEDIFF(b.close_time, b.open_time)) / 60 AS open_minutes,
                  COUNT(s.id) AS active
           FROM beaches b LEFT JOIN sunbeds s ON s.beach_id = b.id AND s.status = 'active'
           GROUP BY b.id, b.open_time, b.close_time"""
    )
    in_scope = (lambda bid: bid in beach_ids) if beach_ids else (lambda bid: True)
    capacity_by_beach = {r["id"]: _i(r["active"]) * _f(r["open_minutes"]) for r in cap_rows}
    sunbeds_by_beach = {r["id"]: _i(r["active"]) for r in cap_rows}
    active_sunbeds = sum(n for bid, n in sunbeds_by_beach.items() if in_scope(bid))
    capacity_per_day = sum(c for bid, c in capacity_by_beach.items() if in_scope(bid))

    k = db.fetch_one(
        f"""SELECT
              SUM(CASE WHEN r.status = 'confirmed' THEN r.price END) AS revenue,
              SUM(r.status = 'confirmed') AS bookings,
              SUM(r.status = 'cancelled') AS cancelled,
              SUM(CASE WHEN r.status = 'confirmed'
                       THEN TIME_TO_SEC(TIMEDIFF(r.leave_time, r.res_time)) / 60 END) AS booked_minutes,
              SUM(r.status = 'confirmed' AND r.checked_in_at IS NOT NULL) AS checked_in,
              SUM(r.status = 'confirmed' AND r.res_date < %s) AS past_confirmed,
              COUNT(DISTINCT CASE WHEN r.status = 'confirmed' THEN r.user_id END) AS customers
            FROM reserves r JOIN sunbeds s ON s.id = r.sunbed_id
            WHERE {base_where}""",
        [rules.today()] + base_params,
    ) or {}
    bookings = _i(k.get("bookings"))
    cancelled = _i(k.get("cancelled"))
    revenue = _f(k.get("revenue"))
    capacity = capacity_per_day * days
    kpis = {
        "revenue": round(revenue, 2),
        "bookings": bookings,
        "cancelled": cancelled,
        "cancellation_rate": round(cancelled / (bookings + cancelled), 4) if bookings + cancelled else 0.0,
        "avg_booking_value": round(revenue / bookings, 2) if bookings else 0.0,
        "occupancy_rate": round(_f(k.get("booked_minutes")) / capacity, 4) if capacity else 0.0,
        "checkin_rate": round(_i(k.get("checked_in")) / _i(k.get("past_confirmed")), 4)
        if _i(k.get("past_confirmed"))
        else 0.0,
        "customers": _i(k.get("customers")),
        "active_sunbeds": active_sunbeds,
    }

    confirmed_where = base_where + " AND r.status = 'confirmed'"

    daily_rows = db.fetch_all(
        f"""SELECT r.res_date AS d, COUNT(*) AS bookings, SUM(r.price) AS revenue,
                   SUM(TIME_TO_SEC(TIMEDIFF(r.leave_time, r.res_time)) / 60) AS booked_minutes
            FROM reserves r JOIN sunbeds s ON s.id = r.sunbed_id
            WHERE {confirmed_where} GROUP BY r.res_date ORDER BY r.res_date""",
        base_params,
    )
    by_date = {r["d"]: r for r in daily_rows}
    daily = []
    for i in range(days):
        d = date_from + timedelta(days=i)
        r = by_date.get(d, {})
        daily.append(
            {
                "date": d.isoformat(),
                "bookings": _i(r.get("bookings")),
                "revenue": round(_f(r.get("revenue")), 2),
                "occupancy": round(_f(r.get("booked_minutes")) / capacity_per_day, 4) if capacity_per_day else 0.0,
            }
        )

    by_month: dict[str, dict] = {}
    for item in daily:
        key = item["date"][:7]
        m = by_month.setdefault(
            key,
            {"month": key, "label": MONTHS[int(key[5:7])], "revenue": 0.0, "bookings": 0, "_occ": 0.0, "_days": 0},
        )
        m["revenue"] = round(m["revenue"] + item["revenue"], 2)
        m["bookings"] += item["bookings"]
        m["_occ"] += item["occupancy"]
        m["_days"] += 1
    months = []
    for m in by_month.values():
        m["occupancy"] = round(m.pop("_occ") / m.pop("_days"), 4)
        months.append(m)

    weekday_totals = [{"weekday": i, "label": WEEKDAYS[i], "bookings": 0, "revenue": 0.0, "_n": 0} for i in range(7)]
    for item in daily:
        wd = date.fromisoformat(item["date"]).weekday()
        weekday_totals[wd]["bookings"] += item["bookings"]
        weekday_totals[wd]["revenue"] += item["revenue"]
        weekday_totals[wd]["_n"] += 1
    by_weekday = []
    for w in weekday_totals:
        n = w.pop("_n") or 1
        w["avg_bookings"] = round(w["bookings"] / n, 2)
        w["revenue"] = round(w["revenue"], 2)
        by_weekday.append(w)

    slot_rows = db.fetch_all(
        f"""SELECT CASE WHEN r.leave_time <= '14:00:00' THEN 'morning'
                        WHEN r.res_time >= '14:00:00' THEN 'afternoon'
                        ELSE 'full_day' END AS slot,
                   COUNT(*) AS bookings, SUM(r.price) AS revenue
            FROM reserves r JOIN sunbeds s ON s.id = r.sunbed_id
            WHERE {confirmed_where} GROUP BY slot""",
        base_params,
    )
    slot_labels = {"morning": "Πρωί", "afternoon": "Απόγευμα", "full_day": "Ολοήμερο"}
    slots = {r["slot"]: r for r in slot_rows}
    by_slot = [
        {
            "slot": key,
            "label": label,
            "bookings": _i(slots.get(key, {}).get("bookings")),
            "revenue": round(_f(slots.get(key, {}).get("revenue")), 2),
        }
        for key, label in slot_labels.items()
    ]

    beach_rows = db.fetch_all(
        """SELECT b.id, b.name,
                  SUM(CASE WHEN r.status = 'confirmed' THEN r.price END) AS revenue,
                  SUM(r.status = 'confirmed') AS bookings,
                  SUM(CASE WHEN r.status = 'confirmed'
                           THEN TIME_TO_SEC(TIMEDIFF(r.leave_time, r.res_time)) / 60 END) AS booked_minutes
           FROM beaches b
           LEFT JOIN sunbeds s ON s.beach_id = b.id
           LEFT JOIN reserves r ON r.sunbed_id = s.id AND r.res_date BETWEEN %s AND %s
           GROUP BY b.id, b.name ORDER BY revenue DESC""",
        (date_from, date_to),
    )
    by_beach = []
    for r in beach_rows:
        if not in_scope(r["id"]):
            continue
        cap = capacity_by_beach.get(r["id"], 0) * days
        by_beach.append(
            {
                "beach_id": r["id"],
                "name": r["name"],
                "revenue": round(_f(r["revenue"]), 2),
                "bookings": _i(r["bookings"]),
                "occupancy": round(_f(r["booked_minutes"]) / cap, 4) if cap else 0.0,
            }
        )

    heatmap = None
    if heat_beach_id:
        cells = db.fetch_all(
            """SELECT s.id, s.grid_x, s.grid_y, s.type, s.status,
                      COUNT(r.id) AS bookings, COALESCE(SUM(r.price), 0) AS revenue
               FROM sunbeds s
               LEFT JOIN reserves r ON r.sunbed_id = s.id AND r.status = 'confirmed'
                                    AND r.res_date BETWEEN %s AND %s
               WHERE s.beach_id = %s
               GROUP BY s.id, s.grid_x, s.grid_y, s.type, s.status""",
            (date_from, date_to, heat_beach_id),
        )
        heatmap = {
            "rows": max((c["grid_x"] for c in cells), default=0),
            "cols": max((c["grid_y"] for c in cells), default=0),
            "max_bookings": max((_i(c["bookings"]) for c in cells), default=0),
            "cells": [
                {
                    "sunbed_id": c["id"],
                    "grid_x": c["grid_x"],
                    "grid_y": c["grid_y"],
                    "type": c["type"],
                    "status": c["status"],
                    "bookings": _i(c["bookings"]),
                    "revenue": round(_f(c["revenue"]), 2),
                }
                for c in cells
            ],
        }

    return {
        "date_from": date_from.isoformat(),
        "date_to": date_to.isoformat(),
        "beach_id": heat_beach_id,
        "kpis": kpis,
        "daily": daily,
        "by_month": months,
        "by_weekday": by_weekday,
        "by_slot": by_slot,
        "by_beach": by_beach,
        "heatmap": heatmap,
    }
