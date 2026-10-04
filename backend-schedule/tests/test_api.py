import logging
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app import main
from app.errors import DataNotReady, RunInProgress
from app.solver import engine, loader
from app.solver.factory_calendar import FactoryCalendar
from app.solver.models import Line, SchedulerConfig, WorkOrder

RESULT = {"direction": "backward", "dispatch_rule": "EDD", "kpi": {"work_orders": 1}, "line_load_min": {},
          "version_id": 1, "version_code": "BACKWARD-V1", "is_active": False, "requested_by": "prod-scheduler"}


@pytest.fixture
def client():
    return TestClient(main.app, raise_server_exceptions=False)


@pytest.fixture
def calls(monkeypatch):
    """Replace engine.run; record the kwargs the API passes."""
    seen = []

    def fake_run(**kw):
        seen.append(kw)
        return {**RESULT, "direction": kw["direction"]}
    monkeypatch.setattr(engine, "run", fake_run)
    return seen


def _raise(exc):
    def fake_run(**kw):
        raise exc
    return fake_run


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200 and r.json() == {"status": "ok", "service": "prod-scheduler"}


def test_schedule_defaults(client, calls):
    r = client.post("/schedule", json={})
    assert r.status_code == 200 and r.json() == RESULT
    assert calls == [{"direction": "backward", "dispatch_rule": "EDD", "now": None, "persist": True,
                      "activate": False, "requested_by": "prod-scheduler"}]


def test_schedule_passes_body_fields(client, calls):
    r = client.post("/schedule", json={"direction": "event", "dispatch_rule": "CR", "activate": True,
                                       "requested_by": "somchai"})
    assert r.status_code == 200
    assert calls[0] | {"now": None} == {"direction": "event", "dispatch_rule": "CR", "now": None,
                                        "persist": True, "activate": True, "requested_by": "somchai"}


def test_activate_ignored_without_persist(client, calls):
    client.post("/schedule", json={"activate": True, "persist": False})
    assert calls[0]["persist"] is False and calls[0]["activate"] is False


@pytest.mark.parametrize("now", ["2026-10-03T08:30:00+07:00", "2026-10-03T01:30:00Z",
                                 "2026-10-03T03:30:00+02:00"])
def test_now_with_offset_becomes_naive_bangkok_local(client, calls, now):
    assert client.post("/schedule", json={"now": now}).status_code == 200
    assert calls[0]["now"] == datetime(2026, 10, 3, 8, 30) and calls[0]["now"].tzinfo is None


@pytest.mark.parametrize("body", [
    {"unexpected": 1},                          # extra="forbid"
    {"direction": "sideways"},
    {"dispatch_rule": "LIFO"},
    {"now": "2026-10-03T08:30:00"},             # offset required
    {"now": "not-a-date"},
    {"requested_by": "x" * 121},
])
def test_invalid_body_is_fastapi_422(client, calls, body):
    r = client.post("/schedule", json=body)
    assert r.status_code == 422 and "detail" in r.json()
    assert calls == []


def test_query_params_interface_is_gone(client, calls):
    assert client.post("/schedule?direction=event").status_code == 422   # body required
    assert calls == []


def test_run_in_progress_is_409(client, monkeypatch):
    monkeypatch.setattr(engine, "run", _raise(RunInProgress()))
    r = client.post("/schedule", json={})
    assert r.status_code == 409
    assert r.json()["code"] == "run_in_progress" and r.json()["message"]


def test_data_not_ready_is_422_with_reasons(client, monkeypatch):
    reasons = ["work center WELD has no active line (2 work orders)"]
    monkeypatch.setattr(engine, "run", _raise(DataNotReady(reasons)))
    r = client.post("/schedule", json={})
    assert r.status_code == 422
    body = r.json()
    assert body["code"] == "data_not_ready" and body["message"] and body["reasons"] == reasons


def test_unexpected_error_is_generic_500_and_logged(client, monkeypatch, caplog):
    secret = 'password=hunter2 relation "prod_schedule" does not exist: SELECT * FROM work_order'
    monkeypatch.setattr(engine, "run", _raise(RuntimeError(secret)))
    with caplog.at_level(logging.ERROR):
        r = client.post("/schedule", json={})
    assert r.status_code == 500
    assert r.json() == {"code": "internal", "message": "scheduler failed"}
    assert "hunter2" not in r.text and "SELECT" not in r.text
    assert any(rec.exc_info and secret in str(rec.exc_info[1]) for rec in caplog.records)


def test_compare_runs_both_directions_without_persisting(client, calls):
    r = client.post("/schedule/compare", json={"dispatch_rule": "SPT", "now": "2026-10-03T08:30:00+07:00",
                                               "requested_by": "somchai"})
    assert r.status_code == 200 and set(r.json()) == {"backward", "event_based"}
    assert [c["direction"] for c in calls] == ["backward", "event"]
    for c in calls:
        assert c["persist"] is False and "activate" not in c
        assert c["dispatch_rule"] == "SPT" and c["requested_by"] == "somchai"
        assert c["now"] == datetime(2026, 10, 3, 8, 30)


@pytest.mark.parametrize("body", [{"persist": True}, {"activate": True}, {"direction": "event"}])
def test_compare_rejects_write_or_direction_fields(client, calls, body):
    assert client.post("/schedule/compare", json=body).status_code == 422
    assert calls == []


def test_compare_end_to_end_never_writes(client, monkeypatch, fake_conn):
    conns = []

    def get_conn(dsn=None):
        conns.append(fake_conn())
        return conns[-1]
    monkeypatch.setattr(engine, "get_conn", get_conn)
    monkeypatch.setattr(loader, "load_config", lambda c: SchedulerConfig())
    monkeypatch.setattr(loader, "load_calendar", lambda c, ot: FactoryCalendar())
    monkeypatch.setattr(loader, "load_work_orders", lambda c: [
        WorkOrder(1, 1, 10, 1, 120.0, datetime(2026, 10, 20, 17), datetime(2026, 10, 1, 8))])
    monkeypatch.setattr(loader, "load_lines", lambda c: [Line(11, 1, 1, 2, "internal")])
    r = client.post("/schedule/compare", json={})
    assert r.status_code == 200
    for side in ("backward", "event_based"):
        assert r.json()[side]["version_id"] is None and r.json()[side]["is_active"] is False
    assert len(conns) == 2
    for c in conns:
        assert c.log == [] and c.commits == 0 and c.closed   # no lock, no writes
