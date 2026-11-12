from datetime import date as DateType
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from .. import booking_rules as rules
from .. import db
from ..config import settings
from ..schemas import TIME_PATTERN, BeachIn, GridIn, SunbedUpdateIn
from ..security import require_admin
from ..services import beaches as beach_service

router = APIRouter(tags=["Παραλίες & Ξαπλώστρες"])


@router.get("/config")
def public_config():
    """Κανόνες που χρειάζεται η εφαρμογή για να φτιάξει τις επιλογές ημερομηνίας/ώρας."""
    return {
        "season_start_month": settings.season_start_month,
        "season_end_month": settings.season_end_month,
        "opening_time": settings.opening_time,
        "closing_time": settings.closing_time,
        "min_booking_minutes": settings.min_booking_minutes,
        "half_day_max_hours": settings.half_day_max_hours,
        "half_day_factor": settings.half_day_factor,
        "first_bookable_date": rules.first_bookable_date().isoformat(),
        "today": rules.today().isoformat(),
    }


@router.get("/beaches")
def list_beaches(
    q: Optional[str] = Query(None, max_length=100, description="Αναζήτηση σε όνομα/περιγραφή"),
    date: Optional[DateType] = Query(None, description="Ημερομηνία για υπολογισμό διαθεσιμότητας"),
    start_time: Optional[str] = Query(None, pattern=TIME_PATTERN),
    end_time: Optional[str] = Query(None, pattern=TIME_PATTERN),
    type: Optional[Literal["normal", "premium"]] = None,
    min_price: Optional[float] = Query(None, ge=0),
    max_price: Optional[float] = Query(None, ge=0),
    available_only: bool = False,
    sort: Literal["name", "price", "availability", "distance"] = "name",
    lat: Optional[float] = Query(None, ge=-90, le=90),
    lon: Optional[float] = Query(None, ge=-180, le=180),
):
    return beach_service.search_beaches(
        q=q,
        res_date=date,
        start=rules.parse_time(start_time) if start_time else None,
        end=rules.parse_time(end_time) if end_time else None,
        sunbed_type=type,
        min_price=min_price,
        max_price=max_price,
        available_only=available_only,
        sort=sort,
        lat=lat,
        lon=lon,
    )


@router.get("/beaches/{beach_id}")
def get_beach(beach_id: int):
    beach = beach_service.get_beach(beach_id)
    if beach is None:
        raise HTTPException(status_code=404, detail="Η παραλία δεν βρέθηκε.")
    return beach


@router.get("/beaches/{beach_id}/sunbeds")
def sunbed_map(
    beach_id: int,
    date: DateType,
    start_time: Optional[str] = Query(None, pattern=TIME_PATTERN),
    end_time: Optional[str] = Query(None, pattern=TIME_PATTERN),
    type: Optional[Literal["normal", "premium"]] = None,
    max_price: Optional[float] = Query(None, ge=0),
    only_available: bool = False,
):
    """Ο χάρτης της παραλίας: κάθε ξαπλώστρα με κατάσταση για το διάστημα."""
    start = rules.parse_time(start_time) if start_time else None
    end = rules.parse_time(end_time) if end_time else None
    if start and end and end <= start:
        raise HTTPException(status_code=400, detail="Η ώρα αναχώρησης πρέπει να είναι μετά την άφιξη.")
    result = beach_service.sunbed_map(beach_id, date, start, end, type, max_price, only_available)
    if result is None:
        raise HTTPException(status_code=404, detail="Η παραλία δεν βρέθηκε.")
    return result


# ------------------------------------------------------------------ admin
@router.post("/admin/beaches", status_code=201)
def create_beach(data: BeachIn, _: dict = Depends(require_admin)):
    _, beach_id = db.execute(
        "INSERT INTO beaches (name, description, ltd, lgd) VALUES (%s, %s, %s, %s)",
        (data.name, data.description, data.ltd, data.lgd),
    )
    return beach_service.get_beach(beach_id)


@router.put("/admin/beaches/{beach_id}")
def update_beach(beach_id: int, data: BeachIn, _: dict = Depends(require_admin)):
    if beach_service.get_beach(beach_id) is None:
        raise HTTPException(status_code=404, detail="Η παραλία δεν βρέθηκε.")
    db.execute(
        "UPDATE beaches SET name = %s, description = %s, ltd = %s, lgd = %s WHERE id = %s",
        (data.name, data.description, data.ltd, data.lgd, beach_id),
    )
    return beach_service.get_beach(beach_id)


@router.delete("/admin/beaches/{beach_id}")
def delete_beach(beach_id: int, _: dict = Depends(require_admin)):
    rowcount, _ = db.execute("DELETE FROM beaches WHERE id = %s", (beach_id,))
    if rowcount == 0:
        raise HTTPException(status_code=404, detail="Η παραλία δεν βρέθηκε.")
    return {"deleted": beach_id}


@router.post("/admin/beaches/{beach_id}/sunbeds/grid", status_code=201)
def create_grid(beach_id: int, data: GridIn, _: dict = Depends(require_admin)):
    """Γεννήτρια πλέγματος: οι πρώτες `premium_rows` σειρές (πιο κοντά στη
    θάλασσα) γίνονται VIP."""
    if beach_service.get_beach(beach_id) is None:
        raise HTTPException(status_code=404, detail="Η παραλία δεν βρέθηκε.")
    existing = db.fetch_one("SELECT COUNT(*) AS n FROM sunbeds WHERE beach_id = %s", (beach_id,))
    if existing and existing["n"]:
        raise HTTPException(status_code=409, detail="Υπάρχουν ήδη ξαπλώστρες. Διάγραψέ τες πρώτα.")
    rows = []
    for x in range(1, data.rows + 1):
        premium = x <= data.premium_rows
        for y in range(1, data.cols + 1):
            rows.append(
                (beach_id, x, y, data.premium_price if premium else data.price, "premium" if premium else "normal")
            )
    with db.transaction() as cur:
        cur.executemany(
            "INSERT INTO sunbeds (beach_id, grid_x, grid_y, price, type) VALUES (%s, %s, %s, %s, %s)", rows
        )
    return {"created": len(rows)}


@router.delete("/admin/beaches/{beach_id}/sunbeds")
def delete_sunbeds(beach_id: int, _: dict = Depends(require_admin)):
    future = db.fetch_one(
        """SELECT COUNT(*) AS n FROM reserves r JOIN sunbeds s ON s.id = r.sunbed_id
           WHERE s.beach_id = %s AND r.status = 'confirmed' AND r.res_date >= %s""",
        (beach_id, rules.today()),
    )
    if future and future["n"]:
        raise HTTPException(
            status_code=409,
            detail=f"Υπάρχουν {future['n']} ενεργές μελλοντικές κρατήσεις. Ακύρωσέ τες πρώτα.",
        )
    rowcount, _ = db.execute("DELETE FROM sunbeds WHERE beach_id = %s", (beach_id,))
    return {"deleted": rowcount}


@router.put("/admin/sunbeds/{sunbed_id}")
def update_sunbed(sunbed_id: int, data: SunbedUpdateIn, _: dict = Depends(require_admin)):
    db.execute(
        "UPDATE sunbeds SET price = %s, type = %s, status = %s WHERE id = %s",
        (data.price, data.type, data.status, sunbed_id),
    )
    row = db.fetch_one("SELECT id, beach_id, grid_x, grid_y, price, type, status FROM sunbeds WHERE id = %s", (sunbed_id,))
    if row is None:
        raise HTTPException(status_code=404, detail="Η ξαπλώστρα δεν βρέθηκε.")
    row["price"] = float(row["price"])
    return row
