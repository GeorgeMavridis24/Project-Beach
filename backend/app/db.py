"""Πρόσβαση στη MySQL μέσω connection pool.

Αντί να ανοίγουμε νέα σύνδεση σε κάθε request (αργό), κρατάμε ένα pool
συνδέσεων. Ένας σημαφόρος κάνει τα requests να *περιμένουν* όταν όλες οι
συνδέσεις είναι πιασμένες, αντί να αποτυγχάνουν.
"""

import threading
from contextlib import contextmanager
from typing import Any, Iterator, Optional, Sequence

from mysql.connector import pooling

from .config import settings

_pool: Optional[pooling.MySQLConnectionPool] = None
_semaphore: Optional[threading.BoundedSemaphore] = None
_lock = threading.Lock()


def _get_pool() -> pooling.MySQLConnectionPool:
    global _pool, _semaphore
    if _pool is None:
        with _lock:
            if _pool is None:
                _pool = pooling.MySQLConnectionPool(
                    pool_name="smartbeach",
                    pool_size=settings.db_pool_size,
                    pool_reset_session=True,
                    host=settings.db_host,
                    port=settings.db_port,
                    user=settings.db_user,
                    password=settings.db_password,
                    database=settings.db_name,
                    charset="utf8mb4",
                    collation="utf8mb4_unicode_ci",
                    autocommit=True,
                    use_pure=True,
                )
                _semaphore = threading.BoundedSemaphore(settings.db_pool_size)
    return _pool


@contextmanager
def connection() -> Iterator[Any]:
    pool = _get_pool()
    assert _semaphore is not None
    _semaphore.acquire()
    try:
        conn = pool.get_connection()
        try:
            yield conn
        finally:
            conn.close()  # επιστρέφει στο pool
    finally:
        _semaphore.release()


@contextmanager
def transaction(isolation_level: Optional[str] = None) -> Iterator[Any]:
    """Ανοίγει transaction και δίνει cursor (dictionary). Commit στο τέλος,
    rollback αν προκύψει οποιοδήποτε σφάλμα."""
    with connection() as conn:
        if isolation_level:
            conn.start_transaction(isolation_level=isolation_level)
        else:
            conn.start_transaction()
        cur = conn.cursor(dictionary=True)
        try:
            yield cur
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            cur.close()


def fetch_all(sql: str, params: Sequence[Any] = ()) -> list[dict]:
    with connection() as conn:
        cur = conn.cursor(dictionary=True)
        try:
            cur.execute(sql, tuple(params))
            return cur.fetchall()
        finally:
            cur.close()


def fetch_one(sql: str, params: Sequence[Any] = ()) -> Optional[dict]:
    rows = fetch_all(sql, params)
    return rows[0] if rows else None


def execute(sql: str, params: Sequence[Any] = ()) -> tuple[int, int]:
    """Εκτελεί INSERT/UPDATE/DELETE. Επιστρέφει (rowcount, lastrowid)."""
    with transaction() as cur:
        cur.execute(sql, tuple(params))
        return cur.rowcount, cur.lastrowid
