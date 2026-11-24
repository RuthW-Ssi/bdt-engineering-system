#!/usr/bin/env python3
"""Per-piece job sheet — API assertion script (checks A1-A11 of
job-sheet-test-report-template.md).

Usage:
    export BDT_API=http://localhost:3000/api/v1 BDT_USER=<login> BDT_PASS=<password>
    python3 docs/test-scripts/job-sheet/job_sheet_api_check.py --mo 3 [--wo 12] [--zone 5]

Credentials come from the environment only — never hard-code them here.
Needs: requests. Not yet run against a live backend — treat the first run
as part of the test.
"""
import argparse
import os
import re
import sys

import requests

API = os.environ.get("BDT_API", "http://localhost:3000/api/v1").rstrip("/")
results = []


def check(code, name, ok, detail=""):
    results.append((code, name, bool(ok), detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {code} {name}" + (f" — {detail}" if detail else ""))


def login():
    user, pw = os.environ.get("BDT_USER"), os.environ.get("BDT_PASS")
    if not user or not pw:
        sys.exit("Set BDT_USER and BDT_PASS in the environment")
    r = requests.post(f"{API}/auth/login", json={"login": user, "password": pw}, timeout=30)
    if r.status_code >= 400:  # some builds name the field `username`
        r = requests.post(f"{API}/auth/login", json={"username": user, "password": pw}, timeout=30)
    r.raise_for_status()
    body = r.json()
    token = body.get("access_token") or body.get("accessToken") or body.get("token")
    if not token:
        sys.exit(f"No token in the login response: {list(body)}")
    return {"Authorization": f"Bearer {token}"}


def err_code(resp):
    try:
        return resp.json().get("code")
    except ValueError:
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mo", type=int, required=True)
    ap.add_argument("--wo", type=int)
    ap.add_argument("--zone", type=int)
    args = ap.parse_args()
    h = login()
    base = f"{API}/mo/{args.mo}/job-sheets"

    # A1 — preview shape
    r = requests.get(f"{base}/preview", headers=h, timeout=120)
    check("A1", "preview 200", r.status_code == 200, f"status {r.status_code}")
    if r.status_code != 200:
        return finish()
    pv = r.json()
    sheets = pv["sheets"]
    check("A1", "totals.sheets == len(sheets)", pv["totals"]["sheets"] == len(sheets))
    check("A1", "sheetNo runs 1..N", [s["sheetNo"] for s in sheets] == list(range(1, len(sheets) + 1)))

    # A2 — piece mode expansion
    groups = {}
    for s in sheets:
        groups.setdefault((s["assemblyMark"], s["partMark"]), []).append(s)
    ok = all(
        sorted(x["pieceNo"] for x in g) == list(range(1, g[0]["pieceTotal"] + 1)) and len(g) == g[0]["pieceTotal"]
        for g in groups.values()
    )
    check("A2", "piece mode: pieceNo 1..pieceTotal per part", ok, f"{len(groups)} part marks")

    # A3 — part mode
    r = requests.get(f"{base}/preview", headers=h, params={"mode": "part"}, timeout=120)
    if r.status_code == 200:
        ps = r.json()["sheets"]
        check("A3", "part mode: one sheet per (assembly, part mark)", len(ps) == len(groups), f"{len(ps)} vs {len(groups)}")
        check("A3", "part mode: pieceNo is null", all(s["pieceNo"] is None for s in ps))
        check("A3", "part mode: sum(pieceTotal) == piece-mode sheets", sum(s["pieceTotal"] for s in ps) == len(sheets))
    else:
        check("A3", "part mode 200", False, f"status {r.status_code}")

    # A4 — WO scope
    if args.wo:
        r = requests.get(f"{base}/preview", headers=h, params={"wo_ids": str(args.wo)}, timeout=120)
        if r.status_code == 200:
            ws = r.json()["sheets"]
            check("A4", "wo scope: no more sheets than the whole MO", len(ws) <= len(sheets), f"{len(ws)} <= {len(sheets)}")
            check("A4", "wo scope: every sheet routes through that WO", all(any(op["woId"] == args.wo for op in s["routing"]) for s in ws))
        else:
            check("A4", "wo scope 200 (or 409 if the WO has no marks)", r.status_code == 409, f"status {r.status_code}")

    # A5 — zone scope
    if args.zone:
        r = requests.get(f"{base}/preview", headers=h, params={"zone_id": str(args.zone)}, timeout=120)
        check("A5", "real zone: same batch as the whole MO", r.status_code == 200 and len(r.json()["sheets"]) == len(sheets), f"status {r.status_code}")
    r = requests.get(f"{base}/preview", headers=h, params={"zone_id": "999999"}, timeout=120)
    # A size-based MO Part is filtered by its own zone_id (all or nothing), an
    # assembly MO by each line's dispatch — either way nothing is in zone 999999.
    check("A5", "unknown zone: 409 JOB_SHEET_EMPTY", r.status_code == 409 and err_code(r) == "JOB_SHEET_EMPTY", f"status {r.status_code}")

    # A6 — empty
    r = requests.get(f"{base}/preview", headers=h, params={"part_marks": "__NOPE__"}, timeout=120)
    check("A6", "no match: 409 JOB_SHEET_EMPTY", r.status_code == 409 and err_code(r) == "JOB_SHEET_EMPTY", f"status {r.status_code}")

    # A7 — the PDF
    r = requests.get(base, headers=h, params={"lang": "th"}, timeout=300)
    is_pdf = r.status_code == 200 and r.content[:5] == b"%PDF-"
    check("A7", "pdf 200 + %PDF-", is_pdf, f"status {r.status_code}, {r.headers.get('content-type')}, {len(r.content)} bytes")
    if is_pdf:
        # pdf-lib may pack page objects into compressed object streams, so a
        # raw byte count can under-report — a mismatch here means "open the
        # file and count", not necessarily a defect.
        pages = len(re.findall(rb"/Type\s*/Page[^s]", r.content))
        check("A7", "page count == totals.sheets (raw scan; verify by eye if it fails)", pages == len(sheets), f"{pages} vs {len(sheets)}")

    # A8 / A9 — errors
    r = requests.get(f"{API}/mo/999999999/job-sheets/preview", headers=h, timeout=60)
    check("A8", "unknown MO: 404", r.status_code == 404, f"status {r.status_code}")
    r = requests.get(f"{base}/preview", timeout=60)
    check("A9", "no token: 401", r.status_code == 401, f"status {r.status_code}")

    # A10 / A11 — content rules
    check("A10", "routing sorted by sequence", all([op["sequence"] for op in s["routing"]] == sorted(op["sequence"] for op in s["routing"]) for s in sheets))
    check("A11", "heatNo / plateId null until heat / plate traceability", all(s["heatNo"] is None and s["plateId"] is None for s in sheets),
          "non-null is fine once bom_part.attributes carries heat_no / plate_id")
    check("A11", "every sheet carries its MO (moId / moCode)", all(s.get("moId") == args.mo and s.get("moCode") for s in sheets))

    # A12 — zone batch: every CONFIRMED / IN_PROGRESS MO with work in the zone
    if args.zone:
        zbase = f"{API}/mo/job-sheets/zone/{args.zone}"
        r = requests.get(f"{zbase}/preview", headers=h, params={"mode": "part"}, timeout=300)
        ok_status = r.status_code == 200 or (r.status_code == 409 and err_code(r) in ("JOB_SHEET_EMPTY", "JOB_SHEET_TOO_MANY", "JOB_SHEET_TOO_MANY_MOS"))
        check("A12", "zone preview: 200 or a documented 409", ok_status, f"status {r.status_code} {err_code(r) if r.status_code != 200 else ''}")
        if r.status_code == 200:
            zp = r.json()
            zs = zp["sheets"]
            check("A12", "zone preview: mo is null, zone.id matches", zp["mo"] is None and zp["zone"]["id"] == args.zone)
            check("A12", "zone preview: sheetNo runs 1..N across MOs", [s["sheetNo"] for s in zs] == list(range(1, len(zs) + 1)))
            check("A12", "zone preview: every sheet's MO is listed in zone.moCodes", all(s["moCode"] in zp["zone"]["moCodes"] for s in zs))
            check("A12", "zone preview: no MO is both printed and skipped", not set(zp["zone"]["moCodes"]) & set(zp["zone"]["skippedMoCodes"]))
            r = requests.get(zbase, headers=h, params={"mode": "part", "lang": "th"}, timeout=300)
            check("A12", "zone pdf 200 + %PDF-", r.status_code == 200 and r.content[:5] == b"%PDF-", f"status {r.status_code}, {len(r.content)} bytes")
        r = requests.get(f"{API}/mo/job-sheets/zone/999999999/preview", headers=h, timeout=60)
        check("A12", "unknown zone (zone batch): 404 ZONE_NOT_FOUND", r.status_code == 404 and err_code(r) == "ZONE_NOT_FOUND", f"status {r.status_code}")
    finish()


def finish():
    failed = [r for r in results if not r[2]]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
