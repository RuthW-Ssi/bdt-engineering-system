"""Build a static demo of cockpit/prod-scheduler.html (for a Vercel preview branch).

The live page calls Supabase REST with the anon key; with RLS disabled that key can also
write, so it must not be published. This bakes the data into snapshot.js instead:

  * every table the page reads, fetched as role `anon` in a READ ONLY transaction
    (so tables anon can't read stay unreadable in the demo: errors {"operator": "401"})
  * prod_schedule = an in-memory scheduler run (persist=False) — nothing is written

Output dir gets index.html (key removed + <script src="snapshot.js">), the design-system
CSS and snapshot.js.

Usage:
    python scripts/build_demo_snapshot.py ../public/prod-scheduler
"""
from __future__ import annotations
import datetime
import decimal
import json
import os
import re
import shutil
import sys

import psycopg2
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.db import get_conn, to_db  # noqa: E402
from app.solver import loader  # noqa: E402
from app.solver.engine import default_now  # noqa: E402
from app.solver.schedulers import Scheduler  # noqa: E402

COCKPIT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "cockpit")

# the page's own select lists (cockpit/prod-scheduler.html load() / load4M())
TABLES = {
    "prod_schedule_version": "id,version_code,description,scheduler_source,is_active",
    "work_order": "id,wo_code,mo_id,sequence,expected_duration_min,setup_time_min,plan_start,plan_finish,"
                  "source_routing_op_id,status,subcontractor_id,team_headcount",
    "manufacturing_order": "id,mo_code,primary_mark_prefix_code,plan_start,plan_finish",
    "mrp_workcenter": "id,code,name,active,availability,performance,quality,oee_target",
    "mrp_workcenter_line": "id,workcenter_id,line_no,name,active",
    "calendar_exception": "date,is_working",
    "mrp_routing_workcenter": "id,op_type_id",
    "mrp_op_type": "id,key,label",
    "team": "id,code,name,team_type,active",
    "operator": "id,team_id,active",
    "work_order_part": "id,work_order_id,bom_assembly_part_id,weight_kg",
    "wip_balance": "storage_code,ver,t,area_pct",
    "stock_quant": "material_id,quantity,reserved_quantity",
}
COUNTS = ["materials"]


def enc(o):
    if isinstance(o, decimal.Decimal):
        return float(o)
    if isinstance(o, (datetime.datetime, datetime.date)):
        return o.isoformat()
    raise TypeError(type(o))


def read_as_anon(conn, table, cols):
    """rows of `table` as the anon role would see them, or an HTTP-like error code."""
    with conn.cursor() as cur:
        try:
            cur.execute("set transaction read only")
            cur.execute("set local role anon")
            cur.execute(f'select {",".join(f"{chr(34)}{c}{chr(34)}" for c in cols.split(","))} from public."{table}"')
            names = [d[0] for d in cur.description]
            return [dict(zip(names, r)) for r in cur.fetchall()], None
        except psycopg2.errors.InsufficientPrivilege:
            return None, "401"
        except psycopg2.errors.UndefinedTable:
            return None, "404"
        finally:
            conn.rollback()


def preview_schedule(dsn):
    """event + backward runs in memory, shaped like prod_schedule_version / prod_schedule rows."""
    conn = get_conn(dsn)
    try:
        cfg = loader.load_config(conn)
        cal = loader.load_calendar(conn, cfg.allow_ot)
        wos, lines = loader.load_work_orders(conn), loader.load_lines(conn)
        vers, rows = [], []
        for vid, code, direction in ((-1, "PREVIEW-EVENT", "event"), (-2, "PREVIEW-BACKWARD", "backward")):
            cfg.direction = direction
            sched = Scheduler(wos, lines, cal, cfg, default_now()).run()
            vers.append({"id": vid, "version_code": code, "is_active": vid == -1, "scheduler_source": "preview",
                         "description": f"{direction} — in-memory preview, NOT saved"})
            rows += [{"prod_schedule_version_id": vid, "work_order_id": a.wo_id, "start_datetime": to_db(a.start),
                      "end_datetime": to_db(a.end), "workcenter_line_id": a.line_id} for a in sched.values()]
        return vers, rows
    finally:
        conn.close()


def main():
    out = os.path.abspath(sys.argv[1])
    load_dotenv(os.path.join(os.path.dirname(COCKPIT), ".env"))
    dsn = os.environ["DATABASE_URL"]
    conn = psycopg2.connect(dsn)
    tables, errors, counts = {}, {}, {}
    for t, cols in TABLES.items():
        rows, err = read_as_anon(conn, t, cols)
        if err:
            errors[t] = err
        else:
            tables[t] = rows
    for t in COUNTS:
        rows, err = read_as_anon(conn, t, "id")
        counts[t] = len(rows or [])
    conn.close()

    vers, rows = preview_schedule(dsn)
    # real versions stay listed but inactive; the page only offers versions that have rows
    tables["prod_schedule_version"] = vers + [dict(v, is_active=False) for v in tables.get("prod_schedule_version", [])]
    tables["prod_schedule"] = rows

    at = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7))).strftime("%Y-%m-%d %H:%M")
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, "snapshot.js"), "w", encoding="utf-8") as f:
        f.write("window.SCHED_SNAPSHOT=" + json.dumps({"at": at, "tables": tables, "errors": errors, "counts": counts},
                                                     default=enc, ensure_ascii=False) + ";\n")

    html = open(os.path.join(COCKPIT, "prod-scheduler.html"), encoding="utf-8").read()
    html = re.sub(r'const SUPA="[^"]*";', 'const SUPA="";', html)
    html = re.sub(r'const ANON="[^"]*";', 'const ANON="";  // demo build: no key', html)
    html = html.replace("\n<script>\n", '\n<script src="snapshot.js"></script>\n<script>\n', 1)
    if "eyJ" in html or "supabase.co" in html:
        sys.exit("refusing to write: key or Supabase URL still in the page")
    with open(os.path.join(out, "index.html"), "w", encoding="utf-8") as f:
        f.write(html)
    shutil.copy(os.path.join(COCKPIT, "sched-design-system.css"), out)
    print(f"demo → {out}  ({len(rows)} preview ops, errors={errors}, snapshot at {at})")


if __name__ == "__main__":
    main()
