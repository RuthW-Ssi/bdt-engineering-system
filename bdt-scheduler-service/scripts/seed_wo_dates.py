"""Seed release/due planning dates onto work_order (plan_start / plan_finish).

Work orders without plan_start / plan_finish are dropped by the scheduler loader
(it requires both non-null) and never reach prod_schedule. This script fills them
per MO, then writes:

    plan_start  = release   (same start for every WO in the MO)
    plan_finish = MO due    (release + lead time)

SAFETY: plan_start / plan_finish are user-entered planning dates in the BDT app
(renamed from earliest_start_at / target_end_at on 2026-09-22). By default only WOs
with a missing plan_start or plan_finish are touched; pass --overwrite to replace
existing plans.

Lead time: --lead-days N uses a fixed lead time (plant rule: 21 days per MO);
without it, lead time is derived from the routing's work content (below).

Both are set per-MO (not per-op). The backward scheduler then derives each
operation's own start/end from stage precedence + finite line capacity, capping
each op by  deadline = min(target_end, successor.start)  — so a single MO due is
all the engine needs, and per-op timing stays routing-consistent.

Lead time is derived from finite-capacity reality, not the raw critical path:
an MO with 91.5h of work must be due later than one with 7.7h, even if their
critical paths (sum of max-duration per stage) are similar, because parallel ops
in a stage still contend for a limited number of lines.

    lead_days = ceil(total_work_min / (PROD_MIN_PER_DAY * NOMINAL_LINES))
                + QUEUE_DAYS_PER_STAGE * num_stages
                + BUFFER_DAYS

Usage:
    python scripts/seed_wo_dates.py --dry-run                       # print the plan, write nothing
    python scripts/seed_wo_dates.py --lead-days 21                  # fill missing dates, 21-day lead time
    python scripts/seed_wo_dates.py --release 2026-10-06 --lead-days 21
    python scripts/seed_wo_dates.py --overwrite                     # also replace existing plans
"""
from __future__ import annotations
import argparse
import collections
import math
import os
from datetime import datetime, timedelta

import psycopg2
import psycopg2.extras

from app.db import TZ  # +07 Asia/Bangkok

# ---- routing → lead-time knobs (tune here) --------------------------------
PROD_MIN_PER_DAY = 450      # productive minutes per line per working day (~7.5h)
NOMINAL_LINES = 3           # assumed concurrent lines an MO can spread across
QUEUE_DAYS_PER_STAGE = 0.5  # wait/queue slack added per routing stage
BUFFER_DAYS = 2             # flat safety buffer on every MO
RELEASE_HOUR = 8            # release lands at 08:00 local
DUE_HOUR = 17               # due dates land at 17:00 local
# ---------------------------------------------------------------------------

WO_STATUSES = ("NOT_STARTED", "RELEASED")


def add_business_days(start: datetime, days: int) -> datetime:
    """Advance `days` working days (skip Sat/Sun)."""
    d = start
    remaining = days
    while remaining > 0:
        d += timedelta(days=1)
        if d.weekday() < 5:       # 0=Mon .. 4=Fri
            remaining -= 1
    return d


def compute_plan(conn, release: datetime, lead_days_fixed: int | None, overwrite: bool):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """select id, mo_id, sequence, expected_duration_min dur
                 from work_order
                where status::text = any(%s) and expected_duration_min > 0
                  and (%s or plan_start is null or plan_finish is null)
                order by mo_id, sequence""",
            (list(WO_STATUSES), overwrite),
        )
        rows = cur.fetchall()

    by_mo = collections.defaultdict(list)
    for r in rows:
        by_mo[r["mo_id"]].append(r)

    plan = {}   # mo_id -> (release, due, meta)
    for mo_id, wos in by_mo.items():
        stages = collections.defaultdict(list)
        for w in wos:
            stages[w["sequence"]].append(w["dur"])
        num_stages = len(stages)
        total_work = sum(w["dur"] for w in wos)
        crit_path = sum(max(v) for v in stages.values())

        if lead_days_fixed is not None:
            lead_days = lead_days_fixed
            due = (release + timedelta(days=lead_days)).replace(hour=DUE_HOUR, minute=0)
        else:
            lead_days = (
                math.ceil(total_work / (PROD_MIN_PER_DAY * NOMINAL_LINES))
                + math.ceil(QUEUE_DAYS_PER_STAGE * num_stages)
                + BUFFER_DAYS
            )
            due = add_business_days(release, lead_days).replace(hour=DUE_HOUR, minute=0)
        plan[mo_id] = {
            "release": release,
            "due": due,
            "wo_ids": [w["id"] for w in wos],
            "n_wo": len(wos),
            "n_stages": num_stages,
            "total_work": total_work,
            "crit_path": crit_path,
            "lead_days": lead_days,
        }
    return plan


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="print the plan, write nothing")
    ap.add_argument("--release", help="release date YYYY-MM-DD (default: today)")
    ap.add_argument("--lead-days", type=int, help="fixed lead time in calendar days (plant rule: 21)")
    ap.add_argument("--overwrite", action="store_true", help="also replace existing plan_start/plan_finish")
    args = ap.parse_args()

    rel_day = datetime.strptime(args.release, "%Y-%m-%d") if args.release else datetime.now()
    release = rel_day.replace(hour=RELEASE_HOUR, minute=0, second=0, microsecond=0)

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        plan = compute_plan(conn, release, args.lead_days, args.overwrite)
        print(f"{'MO':>5} {'#WO':>4} {'stages':>6} {'work(h)':>8} {'critPath(h)':>11} "
              f"{'lead(d)':>8}  {'release':>16}  {'due':>16}")
        for mo_id, p in sorted(plan.items()):
            print(f"{mo_id:>5} {p['n_wo']:>4} {p['n_stages']:>6} "
                  f"{p['total_work']/60:>8.1f} {p['crit_path']/60:>11.1f} "
                  f"{p['lead_days']:>8}  {p['release']:%Y-%m-%d %H:%M}  {p['due']:%Y-%m-%d %H:%M}")
        total_wo = sum(p["n_wo"] for p in plan.values())
        print(f"\n{total_wo} work orders across {len(plan)} MOs.")

        if args.dry_run:
            print("DRY-RUN — no rows written.")
            return

        with conn.cursor() as cur:
            for mo_id, p in plan.items():
                cur.execute(
                    """update work_order
                          set plan_start = %s, plan_finish = %s, updated_at = now()
                        where id = any(%s)""",
                    (p["release"].replace(tzinfo=TZ), p["due"].replace(tzinfo=TZ), p["wo_ids"]),
                )
        conn.commit()
        print(f"Applied: seeded release/due on {total_wo} work orders.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
