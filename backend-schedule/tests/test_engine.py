from datetime import datetime, timedelta, timezone

import pytest

from app.errors import DataNotReady, RunInProgress
from app.solver import engine, loader
from app.solver.factory_calendar import FactoryCalendar
from app.solver.models import Line, SchedulerConfig, WorkOrder

LOCK_SQL = "select pg_try_advisory_xact_lock(%s)"
DUE = datetime(2026, 10, 20, 17, 0)
RELEASE = datetime(2026, 10, 1, 8, 0)


def _wo(wo_id, wc_id, seq=10, mo_id=1):
    return WorkOrder(wo_id, mo_id, seq, wc_id, 120.0, DUE, RELEASE)


@pytest.fixture
def setup(monkeypatch, fake_conn):
    """Patch get_conn + the loaders; loader calls are recorded in conn.log to check ordering."""
    def make(wos, lines, responses=()):
        conn = fake_conn(responses)
        monkeypatch.setattr(engine, "get_conn", lambda dsn=None: conn)

        def rec(name, value):
            return lambda c, *a: (c.log.append((name, None)), value)[1]
        monkeypatch.setattr(loader, "load_config", rec("load_config", SchedulerConfig()))
        monkeypatch.setattr(loader, "load_calendar", rec("load_calendar", FactoryCalendar()))
        monkeypatch.setattr(loader, "load_work_orders", rec("load_work_orders", wos))
        monkeypatch.setattr(loader, "load_lines", rec("load_lines", lines))
        return conn
    return make


def _writes(conn):
    return [s for s in conn.sql() if s.split(" ", 1)[0] in ("insert", "update", "delete")]


def test_lock_not_acquired_raises_before_any_other_sql(setup):
    conn = setup([_wo(1, 1)], [Line(11, 1, 1, 2, "internal")], [("pg_try_advisory_xact_lock", [(False,)])])
    with pytest.raises(RunInProgress):
        engine.run("backward", "EDD", persist=True)
    assert conn.log == [(LOCK_SQL, (engine.LOCK_KEY,))]
    assert conn.commits == 0 and conn.closed


def test_lock_key_is_a_fixed_bigint():
    # shared with NestJS ScheduleService.activate(); changing it silently breaks that serialization
    assert engine.LOCK_KEY == 5999718590924016709 < 2 ** 63


def test_persisting_run_locks_first_and_returns_contract_fields(setup):
    conn = setup([_wo(1, 1)], [Line(11, 1, 1, 2, "internal")],
                 [("pg_try_advisory_xact_lock", [(True,)]), ("for update", [(77, True)])])
    now = datetime(2026, 10, 3, 8, 30, tzinfo=timezone(timedelta(hours=7)))
    out = engine.run("event", "SPT", now=now, persist=True, requested_by="somchai")
    assert conn.log[0] == (LOCK_SQL, (engine.LOCK_KEY,))
    assert set(out) == {"direction", "dispatch_rule", "kpi", "line_load_min", "version_id",
                        "version_code", "is_active", "requested_by"}
    assert out["direction"] == "event" and out["dispatch_rule"] == "SPT"
    assert (out["version_id"], out["version_code"], out["is_active"]) == (77, "EVENTBASED-V1", True)
    assert out["requested_by"] == "somchai"
    assert out["kpi"]["work_orders"] == 1 and out["kpi"]["span_start"] == "2026-10-03T08:30:00"
    update = next(p for s, p in conn.log if s.startswith("update prod_schedule_version set description"))
    assert update[3] == "somchai"   # created_by
    assert conn.commits == 1 and conn.closed


@pytest.mark.parametrize("direction,code", [("event", "EVENTBASED-V1"), ("forward", "EVENTBASED-V1"),
                                            ("backward", "BACKWARD-V1"), ("alap", "BACKWARD-V1")])
def test_version_codes_are_fixed(setup, direction, code):
    setup([_wo(1, 1)], [Line(11, 1, 1, 2, "internal")],
          [("pg_try_advisory_xact_lock", [(True,)]), ("returning id", [(1,)])])
    assert engine.run(direction, persist=True)["version_code"] == code


def test_non_persisting_run_takes_no_lock_and_writes_nothing(setup):
    conn = setup([_wo(1, 1)], [Line(11, 1, 1, 2, "internal")])
    out = engine.run("backward", "EDD", now=datetime(2026, 10, 3, 8, 30), persist=False, activate=True)
    assert (out["version_id"], out["version_code"], out["is_active"]) == (None, None, False)
    assert out["requested_by"] == "prod-scheduler"
    assert not any("advisory" in s for s in conn.sql())
    assert _writes(conn) == [] and conn.commits == 0 and conn.closed


def test_zero_schedulable_work_orders_is_data_not_ready(setup):
    conn = setup([], [Line(11, 1, 1, 2, "internal")], [("pg_try_advisory_xact_lock", [(True,)])])
    with pytest.raises(DataNotReady) as e:
        engine.run("backward", persist=True)
    assert len(e.value.reasons) == 1 and "no schedulable work orders" in e.value.reasons[0]
    assert _writes(conn) == [] and conn.commits == 0 and conn.closed


def test_work_centers_without_active_lines_are_named_with_counts(setup):
    wos = [_wo(1, 1), _wo(2, 2, mo_id=2), _wo(3, 2, mo_id=3), _wo(4, 3, mo_id=4)]
    conn = setup(wos, [Line(11, 1, 1, 2, "internal")],
                 [("pg_try_advisory_xact_lock", [(True,)]),
                  ("from mrp_workcenter where id = any", [(2, "WELD"), (3, "PAINT")])])
    with pytest.raises(DataNotReady) as e:
        engine.run("event", persist=True)
    assert e.value.reasons == ["work center WELD has no active line (2 work orders)",
                               "work center PAINT has no active line (1 work orders)"]
    codes_query = next(p for s, p in conn.log if "from mrp_workcenter" in s)
    assert sorted(codes_query[0]) == [2, 3]
    assert _writes(conn) == [] and conn.commits == 0


def test_default_now_uses_bangkok_date_not_host_clock(monkeypatch):
    instant = datetime(2026, 10, 2, 20, 0, tzinfo=timezone.utc)   # = 2026-10-03 03:00 in Bangkok

    class HostInUTC(datetime):
        @classmethod
        def now(cls, tz=None):
            return instant.astimezone(tz) if tz else instant.replace(tzinfo=None)

    monkeypatch.setattr(engine, "datetime", HostInUTC)
    assert engine.default_now() == datetime(2026, 10, 3, 8, 30)


def test_aware_now_is_converted_to_bangkok_local(setup):
    setup([_wo(1, 1)], [Line(11, 1, 1, 2, "internal")])
    out = engine.run("event", now=datetime(2026, 10, 3, 1, 30, tzinfo=timezone.utc), persist=False)
    assert out["kpi"]["span_start"] == "2026-10-03T08:30:00"
