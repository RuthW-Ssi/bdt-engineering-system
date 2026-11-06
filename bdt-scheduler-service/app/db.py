"""Database access (PostgreSQL / Supabase) via psycopg2.

The scheduler works in NAIVE LOCAL time (Asia/Bangkok, UTC+7). DB stores
timestamptz; we convert on read/write with a fixed +7 offset (SSI is single-site).
"""
from __future__ import annotations
import os
from datetime import datetime, timezone, timedelta

try:
    import psycopg2
    import psycopg2.extras
except ImportError:  # allow import without the driver installed (e.g. docs/tests)
    psycopg2 = None

TZ = timezone(timedelta(hours=7))   # Asia/Bangkok


def get_conn(dsn: str | None = None):
    if psycopg2 is None:
        raise RuntimeError("psycopg2 not installed (pip install -r requirements.txt)")
    dsn = dsn or os.environ["DATABASE_URL"]
    return psycopg2.connect(dsn)


def to_local(dt: datetime) -> datetime:
    """timestamptz -> naive local."""
    if dt.tzinfo is None:
        return dt
    return dt.astimezone(TZ).replace(tzinfo=None)


def to_db(dt: datetime) -> datetime:
    """naive local -> tz-aware (+07) for storage."""
    return dt.replace(tzinfo=TZ)
