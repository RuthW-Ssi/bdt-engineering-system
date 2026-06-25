"""Persist a schedule into prod_schedule_version + prod_schedule."""
from __future__ import annotations
from ..db import to_db
from .models import Assignment


def write_schedule(conn, version_code: str, description: str, scheduler_source: str,
                   sched: dict[int, Assignment], created_by: str = "backend-schedule") -> int:
    with conn.cursor() as cur:
        # replace any prior run of this version_code
        cur.execute("""delete from prod_schedule where prod_schedule_version_id in
                       (select id from prod_schedule_version where version_code=%s)""", (version_code,))
        cur.execute("delete from prod_schedule_version where version_code=%s", (version_code,))
        cur.execute("""insert into prod_schedule_version
                       (version_code, description, is_active, scheduler_source, created_by)
                       values (%s,%s,false,%s,%s) returning id""",
                    (version_code, description, scheduler_source, created_by))
        vid = cur.fetchone()[0]
        rows = [(vid, a.wo_id, to_db(a.start), to_db(a.end), a.line_id) for a in sched.values()]
        cur.executemany("""insert into prod_schedule
                           (prod_schedule_version_id, work_order_id, start_datetime, end_datetime, workcenter_line_id)
                           values (%s,%s,%s,%s,%s)""", rows)
    conn.commit()
    return vid
