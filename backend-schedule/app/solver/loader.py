"""Load scheduler inputs from the database."""
from __future__ import annotations
from datetime import date
import psycopg2.extras

from ..db import to_local
from .factory_calendar import FactoryCalendar
from .models import WorkOrder, Line, SchedulerConfig

WO_STATUSES_SCHEDULABLE = ("NOT_STARTED", "RELEASED")


def load_work_orders(conn, work_order_ids: list[int] | None = None) -> list[WorkOrder]:
    """Schedulable WOs. `work_order_ids` limits the run to the WOs the planner picked
    (Production Schedule ▶ Run · เลือกเอง); None keeps the original all-WO query."""
    picked = work_order_ids is not None
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        # plan_start / plan_finish = the WO's release / due (renamed from earliest_start_at /
        # target_end_at on main, 2026-09-22). ON_HOLD / PAUSED WOs are not schedulable.
        cur.execute(f"""
            select w.id wo_id, w.mo_id, w.sequence, w.work_center_id wc_id,
                   w.expected_duration_min dur, w.plan_finish, w.plan_start
            from work_order w
            join mrp_workcenter mw on mw.id = w.work_center_id and mw.active
            where w.status::text = any(%s) and w.expected_duration_min > 0
              and w.plan_finish is not null and w.plan_start is not null
              {"and w.id = any(%s)" if picked else ""}
            order by w.mo_id, w.sequence
        """, (list(WO_STATUSES_SCHEDULABLE),) + ((list(work_order_ids),) if picked else ()))
        wos = [WorkOrder(r["wo_id"], r["mo_id"], r["sequence"], r["wc_id"],
                         float(r["dur"]), to_local(r["plan_finish"]),
                         to_local(r["plan_start"])) for r in cur.fetchall()]
        if not picked or not wos:
            return wos
        # An earlier operation of the same MO left out of the run (and not finished) still
        # has to happen first: its successor may start only after that op's plan_finish.
        cur.execute("""
            select w.mo_id, w.sequence, w.plan_finish
            from work_order w
            where w.mo_id = any(%s) and not (w.id = any(%s))
              and w.status::text not in ('DONE', 'CANCELLED') and w.plan_finish is not null
        """, (sorted({w.mo_id for w in wos}), list(work_order_ids)))
        held = cur.fetchall()
    for w in wos:
        waits = [to_local(h["plan_finish"]) for h in held if h["mo_id"] == w.mo_id and h["sequence"] < w.sequence]
        w.earliest_start = max([w.earliest_start] + waits)
    return wos


def skip_reason(r) -> str | None:
    """Why a WO cannot be scheduled (Thai, joined with ' · '); None when it can."""
    if r["status"] not in WO_STATUSES_SCHEDULABLE:
        return f"สถานะ {r['status']} — จัดได้เฉพาะ ยังไม่เริ่ม / ปล่อยงานแล้ว"
    why = []
    if not r["wc_active"]:
        why.append("work center ปิดใช้")
    if not r["dur"] or r["dur"] <= 0:
        why.append("ไม่มีเวลาทำงาน")
    if r["plan_start"] is None or r["plan_finish"] is None:
        why.append("ไม่มีวันเริ่ม/วันเสร็จตามแผน")
    return " · ".join(why) or None


def load_skipped(conn, work_order_ids: list[int] | None = None) -> list[dict]:
    """WOs left out of the run, with the reason — so a run never drops work silently.
    Without a pick: NOT_STARTED / RELEASED WOs that fail load_work_orders' filter.
    With a pick: every picked WO that fails it (any status)."""
    picked = work_order_ids is not None
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(f"""
            select w.id wo_id, w.wo_code, w.status::text status, w.expected_duration_min dur,
                   w.plan_start, w.plan_finish, coalesce(mw.active, false) wc_active
            from work_order w
            left join mrp_workcenter mw on mw.id = w.work_center_id
            where {"w.id = any(%s)" if picked else "w.status::text = any(%s)"}
            order by w.mo_id, w.sequence, w.id
        """, (list(work_order_ids) if picked else list(WO_STATUSES_SCHEDULABLE),))
        rows = cur.fetchall()
    return [{"wo_id": r["wo_id"], "wo_code": r["wo_code"], "reason": why}
            for r in rows if (why := skip_reason(r))]


def load_reservations(conn) -> list[tuple[int, str, "datetime"]]:
    """Started WOs (IN_PROGRESS / PAUSED) still occupy a line of their work center until
    their plan_finish: (wc_id, wo_code, plan_finish local)."""
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            select w.work_center_id wc_id, w.wo_code, w.plan_finish
            from work_order w
            join mrp_workcenter mw on mw.id = w.work_center_id and mw.active
            where w.status::text in ('IN_PROGRESS', 'PAUSED') and w.plan_finish is not null
            order by w.plan_finish, w.id
        """)
        return [(r["wc_id"], r["wo_code"], to_local(r["plan_finish"])) for r in cur.fetchall()]


def load_lines(conn) -> list[Line]:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            select ml.id line_id, ml.workcenter_id wc_id, ml.line_no,
                   ml.crew_size, ml.labor_mode
            from mrp_workcenter_line ml
            join mrp_workcenter w on w.id = ml.workcenter_id and w.active
            where ml.active
            order by ml.workcenter_id, ml.line_no
        """)
        return [Line(r["line_id"], r["wc_id"], r["line_no"], r["crew_size"], r["labor_mode"])
                for r in cur.fetchall()]


def load_workcenter_codes(conn, wc_ids) -> dict[int, str]:
    with conn.cursor() as cur:
        cur.execute("select id, code from mrp_workcenter where id = any(%s)", (list(wc_ids),))
        return dict(cur.fetchall())


def load_calendar(conn, allow_ot: bool) -> FactoryCalendar:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("select day_start_overhead_min, day_end_overhead_min "
                    "from calendar where code='FACTORY-STD'")
        c = cur.fetchone() or {"day_start_overhead_min": 30, "day_end_overhead_min": 15}
        cur.execute("select date from calendar_exception where coalesce(is_working,false)=false")
        hol = {r["date"] if isinstance(r["date"], date) else r["date"] for r in cur.fetchall()}
    return FactoryCalendar(holidays=set(hol), allow_ot=allow_ot,
                           day_start_overhead_min=c["day_start_overhead_min"],
                           day_end_overhead_min=c["day_end_overhead_min"])


def load_config(conn) -> SchedulerConfig:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""select direction, dispatch_rule, allow_ot, horizon_days
                       from scheduler_config order by prod_schedule_version_id nulls first limit 1""")
        r = cur.fetchone()
    if not r:
        return SchedulerConfig()
    return SchedulerConfig(direction=r["direction"], dispatch_rule=r["dispatch_rule"],
                           allow_ot=r["allow_ot"], horizon_days=r["horizon_days"])
