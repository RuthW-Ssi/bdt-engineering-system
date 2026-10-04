"""Orchestrator: lock -> load inputs -> readiness check -> run scheduler -> KPIs -> persist."""
from __future__ import annotations
import collections
from datetime import datetime

from ..db import TZ, get_conn, to_local
from ..errors import DataNotReady, RunInProgress
from . import loader, kpi
from .schedulers import Scheduler
from .writer import write_schedule

# pg_try_advisory_xact_lock key serializing persisting runs (ASCII "SCHEDULE" as a bigint,
# = 5999718590924016709). Shared contract: NestJS activate() must take the same key so a manual
# activation can't race a run's is_active writes. Never change it without changing both sides.
LOCK_KEY = 0x5343484544554C45


# productive start of "today" after the morning overhead (08:00 + 30min), Asia/Bangkok
def default_now() -> datetime:
    d = datetime.now(TZ)
    return datetime(d.year, d.month, d.day, 8, 30)


VERSION_CODE = {"event": "EVENTBASED-V1", "forward": "EVENTBASED-V1",
                "backward": "BACKWARD-V1", "alap": "BACKWARD-V1"}
SOURCE = {"event": "heuristic-eventbased", "forward": "heuristic-eventbased",
          "backward": "heuristic-backward", "alap": "heuristic-backward"}


def _check_ready(conn, wos, lines) -> None:
    """Raise DataNotReady (before anything is solved or written) if the inputs can't be scheduled."""
    if not wos:
        raise DataNotReady(["no schedulable work orders (status NOT_STARTED/RELEASED, "
                            "expected_duration_min > 0, plan_start and plan_finish set, active work center)"])
    covered = {ln.wc_id for ln in lines}
    missing = collections.Counter(w.wc_id for w in wos if w.wc_id not in covered)
    if missing:
        codes = loader.load_workcenter_codes(conn, missing)
        raise DataNotReady([f"work center {codes.get(wc, wc)} has no active line ({n} work orders)"
                            for wc, n in sorted(missing.items())])


def run(direction: str | None = None, dispatch_rule: str | None = None,
        now: datetime | None = None, persist: bool = True, dsn: str | None = None,
        activate: bool = False, requested_by: str = "prod-scheduler") -> dict:
    """One run = one transaction. `now` may be aware or naive Asia/Bangkok local."""
    now = to_local(now) if now else default_now()
    conn = get_conn(dsn)
    try:
        if persist:
            with conn.cursor() as cur:   # first statement of the transaction; released on commit/rollback
                cur.execute("select pg_try_advisory_xact_lock(%s)", (LOCK_KEY,))
                if not cur.fetchone()[0]:
                    raise RunInProgress()
        cfg = loader.load_config(conn)
        if direction:
            cfg.direction = direction
        if dispatch_rule:
            cfg.dispatch_rule = dispatch_rule
        cal = loader.load_calendar(conn, cfg.allow_ot)
        wos = loader.load_work_orders(conn)
        lines = loader.load_lines(conn)
        _check_ready(conn, wos, lines)
        sched = Scheduler(wos, lines, cal, cfg, now).run()
        by_id = {w.wo_id: w for w in wos}
        result = {"direction": cfg.direction, "dispatch_rule": cfg.dispatch_rule,
                  "kpi": kpi.compute(sched, by_id, now), "line_load_min": kpi.line_load(sched, by_id),
                  "version_id": None, "version_code": None, "is_active": False,
                  "requested_by": requested_by}
        if persist:
            vc = VERSION_CODE.get(cfg.direction, "SCHED-V1")
            vid, is_active = write_schedule(conn, vc, f"{cfg.direction} {cfg.dispatch_rule}",
                                            SOURCE.get(cfg.direction, "heuristic"), sched,
                                            created_by=requested_by, activate=activate)
            result.update(version_id=vid, version_code=vc, is_active=is_active)
        return result
    finally:
        try:
            conn.rollback()   # no-op after the writer's commit; otherwise releases the lock now
        finally:
            conn.close()
