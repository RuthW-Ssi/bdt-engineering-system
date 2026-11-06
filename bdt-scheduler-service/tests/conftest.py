"""Test helpers: a fake psycopg2 connection. Tests never touch a real database."""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _norm(sql: str) -> str:
    return " ".join(sql.split())


class FakeCursor:
    def __init__(self, conn):
        self.conn = conn
        self._rows = []

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql, params=None):
        sql = _norm(sql)
        self.conn.log.append((sql, params))
        self._rows = next((rows for key, rows in self.conn.responses if key in sql), [])

    def executemany(self, sql, seq):
        self.conn.log.append((_norm(sql), list(seq)))

    def fetchone(self):
        return self._rows[0] if self._rows else None

    def fetchall(self):
        return list(self._rows)


class FakeConn:
    """`responses` = [(sql substring, rows)]; the first substring found in a statement wins."""

    def __init__(self, responses=()):
        self.responses = list(responses)
        self.log = []          # (normalized sql | loader marker, params)
        self.commits = 0
        self.rollbacks = 0
        self.closed = False

    def cursor(self, cursor_factory=None):
        return FakeCursor(self)

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1

    def close(self):
        self.closed = True

    def sql(self):
        return [s for s, _ in self.log]


@pytest.fixture
def fake_conn():
    return FakeConn
