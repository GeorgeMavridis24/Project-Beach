"""SmartBeach API - σημείο εκκίνησης.

Εκτέλεση (μέσα στον φάκελο backend/):
    uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
Τεκμηρίωση API (Swagger): http://localhost:8000/docs
"""

import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .booking_rules import BookingRuleError
from .config import settings
from .errors import ConflictError, NotFoundError
from .routers import admin, assistant, auth, beaches, bookings, staff

logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title="SmartBeach API",
    version="2.0.0",
    description="Σύστημα κρατήσεων ξαπλωστρών για beach bars.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(BookingRuleError)
def _rule_error(_: Request, exc: BookingRuleError):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(NotFoundError)
def _not_found(_: Request, exc: NotFoundError):
    return JSONResponse(status_code=404, content={"detail": str(exc)})


@app.exception_handler(ConflictError)
def _conflict(_: Request, exc: ConflictError):
    return JSONResponse(status_code=409, content={"detail": str(exc)})


@app.get("/", tags=["Υγεία"])
def health():
    return {"status": "ok", "service": "SmartBeach API"}


for r in (auth.router, beaches.router, bookings.router, admin.router, staff.router, assistant.router):
    app.include_router(r)
