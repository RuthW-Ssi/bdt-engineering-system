---
description: E2E test — Traceability (heat lot ↔ plate ↔ nesting sheet ↔ parts). Assign a heat no. to a plate sheet, check it reaches every part, completeness %, untraced filter, forward/backward, replace/void, CSV, bulk. Draft test plan — not yet run against a live stack.
---

# /test-traceability — Traceability E2E

Verifies the `traceability` module (`backend/src/modules/traceability/`) and its two screens:
the **Heat no.** column / **Assign heat no.** action on the cutting-plan **Plates** tab, and the
`/traceability` page. Rules under test (from `traceability.logic.ts`, all **DRAFT pending QA sign-off**):

- assigning a heat no. to a sheet writes one `plate_cut_record` and one `part_trace` per
  `cutting_plan_order_part` row of that sheet (same transaction);
- a second assignment to the same plate (`plate_seq`) voids the first (kept, `status = VOID`) and needs a reason;
- completeness counts only the newest upload of each NC file; scope `main_or_unknown` (default) = every
  part whose BOM slot is not `ACC`;
- forward / backward and completeness read ACTIVE records only.

> **Status: draft test plan, not yet run against a live stack.** The first live run must correct anything
> marked "(unverified)" and remove this note.

## 1. Environment verification

```bash
docker ps --format '{{.Names}} {{.Status}}' | grep bdt-postgres
cd backend && pnpm prisma migrate status | grep -i traceability     # 20261123100000_traceability applied
API=http://localhost:3000/api/v1
TOKEN=$(curl -s -X POST $API/auth/login -H "Content-Type: application/json" \
  -d "{\"login\":\"admin\",\"password\":\"$BDT_ADMIN_PASSWORD\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" "$API/traceability/heat-lots"   # expect 200
```

Pick test data (any dev project works):
- `PROJECT_ID` — a project that has a **PLATE** cutting plan whose order parts carry its `project_code`;
- `UPLOAD_ID` — that cutting plan upload; `NESTING_ID` — one of its sheets with ≥ 1 part;
- a fresh heat number per run: `HEAT=TEST$(date +%y%m%d%H%M)` (never reuse a real heat no.).

## 2. Test steps

1. **Baseline**: `GET /traceability/projects/$PROJECT_ID/completeness` → note `parts_total`, `parts_traced`.
2. **Sheets of the upload**: `GET /traceability/uploads/$UPLOAD_ID/sheets` → the row with `nesting_id = NESTING_ID`
   has `parts = N` (> 0) and `traced = false` (choose an untraced sheet).
3. **Assign**: `POST /traceability/sheets/$NESTING_ID/assign` body `{"heat_no":"<HEAT lower-case with a blank>","mill":"TEST MILL"}`
   → 201, `heat_lot.heat_no` = HEAT upper-case without blanks, `parts_traced = N`, `replaced = 0`.
4. **Propagation**: step 2 again → the sheet has `traced = true`, one plate cut with `parts_traced = N`.
5. **Completeness moved**: step 1 again → `parts_traced` grew by the number of that sheet's in-scope parts
   (equal to N when none of them is an `ACC` BOM part; check `scope=all` for exactly N).
6. **Untraced filter**: `GET /traceability/projects/$PROJECT_ID/parts?untraced=true` → no row has `traced = true`;
   no row has `nesting_id = NESTING_ID`.
7. **Forward**: `GET /traceability/forward?heat_no=$HEAT` → one lot, one plate (`nesting_id = NESTING_ID`), N parts.
8. **Backward**: take one `part_mark` from step 7 → `GET /traceability/backward?part_mark=<mark>` → a trace with
   `heat_lot.heat_no = HEAT`.
9. **Replace needs a new record**: `POST /traceability/sheets/$NESTING_ID/assign` with `{"heat_no":"${HEAT}B","reason":"test replace"}`
   → `replaced = 1`; forward for `HEAT` now returns the lot with **0 plates** (the old record is VOID).
10. **Void**: `PATCH /traceability/plate-cuts/<id from step 9>/void` `{"reason":"test cleanup"}` → `{"voided":true}`;
    a second identical call → 400.
11. **CSV**: `GET /traceability/projects/$PROJECT_ID/export.csv` → 200, `Content-Type: text/csv`, body starts with the
    UTF-8 BOM, first line = `project_code,part_mark,main_part,sheet,nc_file,quality,thick_mm,qty,weight_kg,traced,heat_no,mill,cert_no,plate_no,plate_seq,cut_date`.
12. **Bulk with one bad id**: `POST /traceability/sheets/assign-bulk` `{"heat_no":"${HEAT}C","nesting_ids":[$NESTING_ID, 999999999]}`
    → `assigned = 1`, `failed = [{nesting_id: 999999999, ...}]`. Void the created record afterwards (step 10).
13. **Permission**: a user without `cutting-plan` update → `POST .../assign` returns 403; with view only, the GETs return 200.
14. **UI** (Playwright or by hand): Plates tab shows the **Heat no.** column; **Assign heat no.** opens the dialog;
    after saving, the chip shows the heat no.; `/traceability` shows the gauge, the table and the **Untraced only** toggle.
15. **History**: `GET /traceability/sheets/$NESTING_ID/history` after the clean-ups → every record made on that
    sheet in steps 3, 9 and 12, all `status = VOID`, newest first, each with its `void_reason` (step 3's = "test replace"),
    `assigned_by` / `voided_by` filled;
    unknown id → 404. In the dialog, **Show history** lists the same rows (VOID struck through).
16. **Forward CSV**: `GET /traceability/forward/export.csv?heat_no=${HEAT}B` → 200, UTF-8 BOM, header
    `heat_no,mill,cert_no,sheet,nc_file,plate_no,plate_seq,cut_date,project_code,part_mark,main_part,qty,weight_kg`;
    0 data lines once step 10 voided the record (forward reads ACTIVE records only), N lines when run before step 10.

## 3. Assertion script (fill in the ids, run with `python3`)

```python
import os, json, urllib.request
API, TOKEN = os.environ["API"], os.environ["TOKEN"]
PROJECT_ID, UPLOAD_ID, NESTING_ID, HEAT = int(os.environ["PROJECT_ID"]), int(os.environ["UPLOAD_ID"]), int(os.environ["NESTING_ID"]), os.environ["HEAT"]

def call(method, path, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r:
        raw = r.read().decode("utf-8")
        return json.loads(raw) if r.headers.get_content_type() == "application/json" else raw

before = call("GET", f"/traceability/projects/{PROJECT_ID}/completeness?scope=all")["completeness"]
sheet = next(s for s in call("GET", f"/traceability/uploads/{UPLOAD_ID}/sheets") if s["nesting_id"] == NESTING_ID)
assert not sheet["traced"], "pick an untraced sheet"
res = call("POST", f"/traceability/sheets/{NESTING_ID}/assign", {"heat_no": HEAT.lower()[:3] + " " + HEAT.lower()[3:], "mill": "TEST MILL"})
assert res["heat_lot"]["heat_no"] == HEAT.upper() and res["parts_traced"] == sheet["parts"] and res["replaced"] == 0, res
after = call("GET", f"/traceability/projects/{PROJECT_ID}/completeness?scope=all")["completeness"]
delta = after["parts_traced"] - before["parts_traced"]
assert 0 <= delta <= sheet["parts"], (before, after)  # = sheet["parts"] when the sheet is the newest version of its NC file
fw = call("GET", f"/traceability/forward?heat_no={HEAT}")
assert len(fw["lots"]) == 1 and fw["lots"][0]["parts_total"] == sheet["parts"], fw
csv = call("GET", f"/traceability/projects/{PROJECT_ID}/export.csv")
assert csv.startswith("﻿project_code,part_mark,main_part,"), csv[:80]
call("PATCH", f"/traceability/plate-cuts/{res['plate_cut_id']}/void", {"reason": "test cleanup"})
print("PASS", {"sheet_parts": sheet["parts"], "traced_before": before["parts_traced"], "traced_after": after["parts_traced"]})
```

The completeness delta is exactly `sheet["parts"]` when the sheet is the newest upload of its NC file (older
versions are not counted at all, so the delta is 0 for them). Tighten the check after the first live run.

## 4. Report

Write `docs/test-scripts/traceability/traceability-test-report-YYYY-MM-DD.md`: environment, ids used, each step
✅/❌ with the observed value, and the cleanup done (every TEST heat record voided).

## 5. Expected values reference

| Check | Expected |
|---|---|
| heat no. stored | trimmed, blanks removed, upper-case |
| parts written on assign | = order-part rows of the sheet (`parts` in the sheets list) |
| replace | old record `VOID` with the reason, `replaced = 1`, reason required by the UI |
| completeness | ACTIVE records only; newest upload per NC file; `pct_*` one decimal, `null` when nothing to trace |
| CSV | UTF-8 BOM, CRLF, 16 columns, one line per part × plate, cells starting `= + - @` prefixed with `'` |
| bulk | each sheet its own transaction; failures listed, not thrown |

## 6. Re-run notes

- Use a new `HEAT` every run; void every TEST record at the end (records are never deleted by design).
- `heat_lot` rows created by the test stay (no delete endpoint) — they are harmless, prefixed `TEST`.
- If step 3 answers 409, someone assigned the same plate at the same moment — reload and repeat.
