"""Persist a schedule into prod_schedule_version + prod_schedule."""
from __future__ import annotations
from ..db import to_db
from .models import Assignment


def write_schedule(conn, version_code: str, description: str, scheduler_source: str,
                   sched: dict[int, Assignment], created_by: str = "prod-scheduler",
                   activate: bool = False) -> tuple[int, bool]:
    """Replace the version_code's rows with `sched` in one transaction; return (id, is_active).

    The version row is updated in place, so its id stays stable across runs and rows that
    reference it (scheduler_config.prod_schedule_version_id, FK ON DELETE NO ACTION) never
    block a run. It stays active if it was active (overwriting the active version keeps it
    active); activate=True makes it the single active version (main's ScheduleService serves
    GET /schedule/versions/active from it — one active version system-wide).
    """
    with conn.cursor() as cur:
        cur.execute("select id, is_active from prod_schedule_version where version_code=%s for update",
                    (version_code,))
        existing = cur.fetchone()
        is_active = activate or bool(existing and existing[1])
        if activate:
            cur.execute("update prod_schedule_version set is_active = false where is_active and version_code <> %s",
                        (version_code,))
        if existing:
            vid = existing[0]
            cur.execute("delete from prod_schedule where prod_schedule_version_id=%s", (vid,))
            cur.execute("""update prod_schedule_version
                           set description=%s, is_active=%s, scheduler_source=%s, created_by=%s, created_at=now()
                           where id=%s""",
                        (description, is_active, scheduler_source, created_by, vid))
        else:
            cur.execute("""insert into prod_schedule_version
                           (version_code, description, is_active, scheduler_source, created_by)
                           values (%s,%s,%s,%s,%s) returning id""",
                        (version_code, description, is_active, scheduler_source, created_by))
            vid = cur.fetchone()[0]
        rows = [(vid, a.wo_id, to_db(a.start), to_db(a.end), a.line_id) for a in sched.values()]
        cur.executemany("""insert into prod_schedule
                           (prod_schedule_version_id, work_order_id, start_datetime, end_datetime, workcenter_line_id)
                           values (%s,%s,%s,%s,%s)""", rows)
    conn.commit()
    return vid, is_active
