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


def _check_ready(conn, wos, lines, skipped=()) -> None:
    """Raise DataNotReady (before anything is solved or written) if the inputs can't be scheduled."""
    if not wos:
        raise DataNotReady(["ไม่มีงานที่จัดได้ — ต้องเป็น WO ที่ยังไม่เริ่ม / ปล่อยงานแล้ว มีเวลาทำงาน "
                            "มีวันเริ่ม-เสร็จตามแผน และ work center เปิดใช้"]
                           + [f"{s['wo_code']} — {s['reason']}" for s in skipped])
    covered = {ln.wc_id for ln in lines}
    missing = collections.Counter(w.wc_id for w in wos if w.wc_id not in covered)
    if missing:
        codes = loader.load_workcenter_codes(conn, missing)
        raise DataNotReady([f"{codes.get(wc, wc)} ไม่มีไลน์ผลิต ({n} WO) — แจ้งแอดมินเพิ่มไลน์ หรือเอา WO ออกจากการจัด"
                            for wc, n in sorted(missing.items())])


def _reserve_lines(started, lines, now):
    """Put each started WO on the line of its work center that frees up first, busy until its
    plan_finish (ones already past it don't block). -> ({line_id: until}, report rows)."""
    by_wc = collections.defaultdict(list)
    for ln in lines:
        by_wc[ln.wc_id].append(ln.line_id)
    busy: dict[int, datetime] = {}
    reserved = []
    for wc_id, wo_code, until in started:
        if until <= now or not by_wc[wc_id]:
            continue
        line_id = min(by_wc[wc_id], key=lambda lid: busy.get(lid, now))
        busy[line_id] = max(busy.get(line_id, now), until)
        reserved.append({"wo_code": wo_code, "line_id": line_id, "until": until.isoformat()})
    return busy, reserved


def run(direction: str | None = None, dispatch_rule: str | None = None,
        now: datetime | None = None, persist: bool = True, dsn: str | None = None,
        activate: bool = False, requested_by: str = "prod-scheduler",
        work_order_ids: list[int] | None = None) -> dict:
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
        # work_order_ids = the planner's pick (▶ Run · เลือกเอง); None = every schedulable WO
        wos = (loader.load_work_orders(conn) if work_order_ids is None
               else loader.load_work_orders(conn, work_order_ids))
        lines = loader.load_lines(conn)
        skipped = loader.load_skipped(conn) if work_order_ids is None else loader.load_skipped(conn, work_order_ids)
        _check_ready(conn, wos, lines, skipped)
        busy, reserved = _reserve_lines(loader.load_reservations(conn), lines, now)
        sched = Scheduler(wos, lines, cal, cfg, now, busy_until=busy).run()
        by_id = {w.wo_id: w for w in wos}
        result = {"direction": cfg.direction, "dispatch_rule": cfg.dispatch_rule,
                  "kpi": kpi.compute(sched, by_id, now), "line_load_min": kpi.line_load(sched, by_id),
                  "version_id": None, "version_code": None, "is_active": False,
                  "requested_by": requested_by, "skipped": skipped, "reserved": reserved}
        if persist:
            vc = VERSION_CODE.get(cfg.direction, "SCHED-V1")
            desc = f"{cfg.direction} {cfg.dispatch_rule}"
            if work_order_ids is not None:
                desc += f" · {len(wos)} WO selected"
            vid, is_active = write_schedule(conn, vc, desc,
                                            SOURCE.get(cfg.direction, "heuristic"), sched,
                                            created_by=requested_by, activate=activate)
            result.update(version_id=vid, version_code=vc, is_active=is_active)
        return result
    finally:
        try:
            conn.rollback()   # no-op after the writer's commit; otherwise releases the lock now
        finally:
            conn.close()
