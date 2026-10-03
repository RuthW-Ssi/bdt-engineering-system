"""Load scheduler inputs from the database."""
from __future__ import annotations
from datetime import date
import psycopg2.extras

from ..db import to_local
from .factory_calendar import FactoryCalendar
from .models import WorkOrder, Line, SchedulerConfig

WO_STATUSES_SCHEDULABLE = ("NOT_STARTED", "RELEASED")


def load_work_orders(conn) -> list[WorkOrder]:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        # plan_start / plan_finish = the WO's release / due (renamed from earliest_start_at /
        # target_end_at on main, 2026-09-22). ON_HOLD / PAUSED WOs are not schedulable.
        cur.execute("""
            select w.id wo_id, w.mo_id, w.sequence, w.work_center_id wc_id,
                   w.expected_duration_min dur, w.plan_finish, w.plan_start
            from work_order w
            join mrp_workcenter mw on mw.id = w.work_center_id and mw.active
            where w.status::text = any(%s) and w.expected_duration_min > 0
              and w.plan_finish is not null and w.plan_start is not null
            order by w.mo_id, w.sequence
        """, (list(WO_STATUSES_SCHEDULABLE),))
        return [WorkOrder(r["wo_id"], r["mo_id"], r["sequence"], r["wc_id"],
                          float(r["dur"]), to_local(r["plan_finish"]),
                          to_local(r["plan_start"])) for r in cur.fetchall()]


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
