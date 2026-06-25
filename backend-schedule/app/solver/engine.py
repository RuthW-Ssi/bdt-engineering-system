"""Orchestrator: load inputs -> run scheduler -> validate -> persist -> KPIs."""
from __future__ import annotations
from datetime import datetime

from ..db import get_conn
from . import loader, kpi
from .models import SchedulerConfig
from .schedulers import Scheduler

# productive start of "today" after the morning overhead (08:00 + 30min)
def default_now() -> datetime:
    d = datetime.now()
    return datetime(d.year, d.month, d.day, 8, 30)


VERSION_CODE = {"event": "EVENTBASED-V1", "forward": "EVENTBASED-V1",
                "backward": "BACKWARD-V1", "alap": "BACKWARD-V1"}
SOURCE = {"event": "heuristic-eventbased", "forward": "heuristic-eventbased",
          "backward": "heuristic-backward", "alap": "heuristic-backward"}


def run(direction: str | None = None, dispatch_rule: str | None = None,
        now: datetime | None = None, persist: bool = True, dsn: str | None = None) -> dict:
    now = now or default_now()
    conn = get_conn(dsn)
    try:
        cfg = loader.load_config(conn)
        if direction:
            cfg.direction = direction
        if dispatch_rule:
            cfg.dispatch_rule = dispatch_rule
        cal = loader.load_calendar(conn, cfg.allow_ot)
        wos = loader.load_work_orders(conn)
        lines = loader.load_lines(conn)
        sched = Scheduler(wos, lines, cal, cfg, now).run()
        metrics = kpi.compute(sched, {w.wo_id: w for w in wos}, now)
        result = {"direction": cfg.direction, "dispatch_rule": cfg.dispatch_rule,
                  "kpi": metrics, "line_load_min": kpi.line_load(sched, {w.wo_id: w for w in wos})}
        if persist:
            from .writer import write_schedule
            vc = VERSION_CODE.get(cfg.direction, "SCHED-V1")
            vid = write_schedule(conn, vc, f"{cfg.direction} {cfg.dispatch_rule}",
                                 SOURCE.get(cfg.direction, "heuristic"), sched)
            result["version_code"] = vc
            result["version_id"] = vid
        return result
    finally:
        conn.close()
