"""Rebuild mrp_workcenter_line from the authoritative APS_WC_LINE_LAYOUT.xlsx.

Root cause this fixes: when the work-center spine was regenerated (2026-07-01, new
mrp_workcenter ids 12-35), mrp_workcenter_line was NOT migrated — its 8 rows still
point at the OLD work-center ids (6/11/14 now inactive; 19's rows are mislabeled
leftovers). Result: every active WC the current work orders run on (CUT-PIPE,
CUT-SAW, DRILL, HBEAM, PAINT, SURFACE, ...) has ZERO lines, so the finite-capacity
scheduler finds no line for those WOs and crashes (best=None on unpack).

This rebuilds the line topology by matching the spec's `wc_code` to the current
mrp_workcenter.id, so the table reflects the real shop layout (line count +
crew_size per WC) instead of stale ids.

Safe to delete-and-reinsert: prod_schedule (the only consumer of
workcenter_line_id) is currently empty, so there are no FK dependents.

Usage:
    python scripts/rebuild_wc_lines.py --dry-run   # print the plan, write nothing
    python scripts/rebuild_wc_lines.py             # DELETE stale rows + INSERT from spec
"""
from __future__ import annotations
import argparse
import os

import openpyxl
import psycopg2
import psycopg2.extras

SPEC_XLSX = "docs/APS_WC_LINE_LAYOUT.xlsx"


def read_spec():
    """-> list of dicts {wc_code, line_no, name, crew_size, labor_mode}."""
    wb = openpyxl.load_workbook(SPEC_XLSX, data_only=True)
    ws = wb["wc_line"]
    header = None
    out = []
    for row in ws.iter_rows(values_only=True):
        if header is None:
            header = [str(c).strip() if c is not None else "" for c in row]
            continue
        rec = dict(zip(header, row))
        if not rec.get("wc_code"):
            continue
        stage = str(rec.get("stage") or "")
        labor_mode = "subcontract" if "Fab-sub" in stage else "internal"
        crew = rec.get("crew_layout")
        out.append({
            "wc_code": str(rec["wc_code"]).strip(),
            "line_no": int(rec["line_no"]),
            "name": str(rec.get("line_name") or "").strip(),
            "crew_size": int(crew) if crew is not None else 0,
            "labor_mode": labor_mode,
        })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="print the plan, write nothing")
    args = ap.parse_args()

    spec = read_spec()
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("select id, code, active from mrp_workcenter")
            wc = {r["code"]: r for r in cur.fetchall()}

        # Build the desired line rows, matching spec wc_code -> current WC id.
        desired, skipped = [], []
        for s in spec:
            w = wc.get(s["wc_code"])
            if not w:
                skipped.append(s["wc_code"])
                continue
            desired.append({
                "workcenter_id": w["id"],
                "line_no": s["line_no"],
                "name": s["name"],
                "active": bool(w["active"]),   # line active iff its WC is active
                "crew_size": s["crew_size"],
                "labor_mode": s["labor_mode"],
                "wc_code": s["wc_code"],
            })

        print(f"{'wc_code':<20} {'wc_id':>5} {'ln':>3} {'crew':>4} {'mode':<11} {'active':>6}  name")
        for d in desired:
            print(f"{d['wc_code']:<20} {d['workcenter_id']:>5} {d['line_no']:>3} "
                  f"{d['crew_size']:>4} {d['labor_mode']:<11} {str(d['active']):>6}  {d['name']}")
        n_active = sum(1 for d in desired if d["active"])
        print(f"\n{len(desired)} lines total · {n_active} active (on active WCs).")
        if skipped:
            print(f"Skipped (wc_code not in DB): {sorted(set(skipped))}")

        if args.dry_run:
            print("DRY-RUN — no rows written.")
            return

        with conn.cursor() as cur:
            cur.execute("select count(*) from prod_schedule")
            if cur.fetchone()[0] != 0:
                raise SystemExit("ABORT: prod_schedule is not empty — lines may have FK "
                                 "dependents. Clear/rebuild schedule first.")
            cur.execute("delete from mrp_workcenter_line")
            for d in desired:
                cur.execute(
                    """insert into mrp_workcenter_line
                         (workcenter_id, line_no, name, active, crew_size, labor_mode)
                       values (%s,%s,%s,%s,%s,%s)""",
                    (d["workcenter_id"], d["line_no"], d["name"], d["active"],
                     d["crew_size"], d["labor_mode"]),
                )
        conn.commit()
        print(f"Applied: rebuilt mrp_workcenter_line — {len(desired)} rows ({n_active} active).")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
