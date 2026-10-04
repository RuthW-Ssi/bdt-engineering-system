from datetime import datetime

from app.solver.models import Assignment
from app.solver.writer import write_schedule

SCHED = {7: Assignment(7, datetime(2026, 10, 3, 8, 30), datetime(2026, 10, 3, 10, 0), 11)}
FIND = "select id, is_active from prod_schedule_version where version_code=%s for update"
CLEAR_OTHERS = "update prod_schedule_version set is_active = false where is_active and version_code <> %s"


def _write(conn, **kw):
    return write_schedule(conn, "BACKWARD-V1", "backward EDD", "heuristic-backward", SCHED, **kw)


def _params(conn, prefix):
    return next(p for s, p in conn.log if s.startswith(prefix))


def test_overwriting_active_version_updates_in_place_and_keeps_it_active(fake_conn):
    conn = fake_conn([("for update", [(42, True)])])
    assert _write(conn, created_by="somchai") == (42, True)
    assert _params(conn, "update prod_schedule_version set description") == (
        "backward EDD", True, "heuristic-backward", "somchai", 42)
    assert _params(conn, "delete from prod_schedule where") == (42,)
    sql = conn.sql()
    assert not any(s.startswith("insert into prod_schedule_version") for s in sql)   # id stays stable
    assert not any(s.startswith("delete from prod_schedule_version") for s in sql)   # no FK conflict
    assert CLEAR_OTHERS not in sql     # nothing else changes state
    assert conn.commits == 1


def test_replacing_inactive_version_stays_inactive(fake_conn):
    conn = fake_conn([("for update", [(5, False)])])
    assert _write(conn) == (5, False)
    assert _params(conn, "update prod_schedule_version set description")[1] is False


def test_first_write_without_activate_inserts_inactive(fake_conn):
    conn = fake_conn([("returning id", [(5,)])])   # no row for this version_code yet
    assert _write(conn) == (5, False)
    assert _params(conn, "insert into prod_schedule_version") == (
        "BACKWARD-V1", "backward EDD", False, "heuristic-backward", "prod-scheduler")


def test_activate_clears_other_active_versions_before_writing(fake_conn):
    conn = fake_conn([("for update", [(9, False)])])
    assert _write(conn, activate=True) == (9, True)
    sql = conn.sql()
    clear = sql.index(CLEAR_OTHERS)
    update = next(i for i, s in enumerate(sql) if s.startswith("update prod_schedule_version set description"))
    assert sql.index(FIND) < clear < update
    assert _params(conn, CLEAR_OTHERS) == ("BACKWARD-V1",)
    assert _params(conn, "update prod_schedule_version set description")[1] is True
    assert conn.commits == 1


def test_rows_are_written_under_the_version_id_as_plus_07(fake_conn):
    conn = fake_conn([("returning id", [(3,)])])
    _write(conn)
    rows = _params(conn, "insert into prod_schedule (")
    assert [(r[0], r[1], r[4]) for r in rows] == [(3, 7, 11)]
    assert rows[0][2].utcoffset().total_seconds() == 7 * 3600   # stored as +07
