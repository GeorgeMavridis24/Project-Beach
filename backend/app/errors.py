"""Σφάλματα της εφαρμογής. Στο main.py αντιστοιχίζονται σε HTTP status codes."""

from .booking_rules import BookingRuleError  # noqa: F401  (400 Bad Request)


class NotFoundError(Exception):
    """404 Not Found"""


class ConflictError(Exception):
    """409 Conflict - π.χ. η ξαπλώστρα κλείστηκε ήδη από άλλον."""
