# /test-wo-bom-hold

> **Prerequisite:** requires [[wo-bom-hold-plan]] (all 12 tasks) to be implemented first — `ON_HOLD` status, `applyBomChangeHolds()`, extended `accept-new-version`/`cancel`, `hold_summary`, `stale_assembly_warnings` must all exist. If any endpoint below 404s or the response is missing a field, stop and report which task is incomplete instead of guessing around it.

Run the WO BOM-Version Hold feature (Sprint 20 / F-WO BOM-Version Hold) end-to-end against a fresh test fixture and generate a filled test report.

## What this skill does

1. Verifies servers are running
2. Authenticates and finds a usable project + zone (prefer a scratch/dedicated test zone — this test creates real MO/WO rows)
3. Uploads a baseline BOM revision with 3 known assembly marks
4. Creates + confirms an MO covering all 3 marks → auto-creates 3 WOs
5. Uploads a second BOM revision where mark A is removed, mark B's qty decreases, mark C's qty increases
6. Asserts the upload response's `hold_summary`, and each WO's resulting status + `bom-version-status` delta
7. Resolves WO-A via Cancel (REMOVED can't Accept — also asserts the 409 guard still fires if Accept is attempted), resolves WO-B via Accept + note
8. Checks a DRAFT MO's `stale_assembly_warnings`
9. Copies the template and fills in actual results
10. Reports pass/fail summary

---

## Step 1 — Verify environment

```bash
curl -s http://localhost:3000/api/v1/auth/login \
  -X POST -H "Content-Type: application/json" \
  -d '{"login":"admin","password":"BdtDev2026!"}' | python3 -c "import sys,json; d=json.load(sys.stdin); print('TOKEN:', d['access_token'][:30]+'...')"
```

If this fails → tell the user to start the backend first (`pnpm --filter backend dev`).

---

## Step 2 — Auth token + pick project/zone

```bash
TOKEN=$(curl -s http://localhost:3000/api/v1/auth/login \
  -X POST -H "Content-Type: application/json" \
  -d '{"login":"admin","password":"BdtDev2026!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

curl -s "http://localhost:3000/api/v1/projects?limit=5" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

Pick `project_id`, then find/pick a `zone_id` for it (prefer a zone with no existing WOs, to keep `applyBomChangeHolds()`'s candidate query small and the assertions unambiguous):

```bash
curl -s "http://localhost:3000/api/v1/projects/{project_id}/zones" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

---

## Step 3 — Upload baseline revision (3 known marks)

Use any 3-file BOM fixture with at least 3 assembly marks — reuse the existing `storage/test_bom_file/` set and note which 3 marks you'll track as **MARK-A**, **MARK-B**, **MARK-C**:

```bash
BASE="backend/storage/test_bom_file"

curl -s http://localhost:3000/api/v1/bom/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "project_id={project_id}" -F "zone_id={zone_id}" \
  -F "files=@\"${BASE}/2. THEPHA 28x54m. ZONE 2 Assembly List Rev.0.xls\"" -F "doc_types=ASSEMBLY_LIST" \
  -F "files=@\"${BASE}/3. THEPHA 28x54m. ZONE 2 Assembly Part List Rev.0.xls\"" -F "doc_types=ASSEMBLY_PART_LIST" \
  -F "files=@\"${BASE}/4. THEPHA 28x54m. ZONE 2 Part List Rev.0.xls\"" -F "doc_types=PART_LIST" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('D1 =', d.get('id','ERROR'))"
```

Record the dispatch id as **D1**. Pick 3 real assembly marks from D1's assembly list as MARK-A/B/C (e.g. via `GET /api/v1/dispatches/{D1}` or the assembly list response) — note their exact `qty`/`weight_kg` values, you'll need to change them for Step 5.

---

## Step 4 — Create + confirm an MO covering MARK-A/B/C → auto-creates 3 WOs

```bash
curl -s http://localhost:3000/api/v1/mo \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "primary_mark_prefix_code": "{pick any valid mark_prefix_master code}",
    "routing_template_id": {pick any valid routing_template id},
    "confirm": true,
    "assembly_lines": [
      {"bom_assembly_id": {MARK-A id}, "qty": 1},
      {"bom_assembly_id": {MARK-B id}, "qty": 1},
      {"bom_assembly_id": {MARK-C id}, "qty": 1}
    ]
  }' | python3 -c "import sys,json; d=json.load(sys.stdin); print('MO =', d.get('id','ERROR'))"
```

Record the MO id, then list its Work Orders and record **WO-A**, **WO-B**, **WO-C**'s ids (one per assembly line):

```bash
curl -s "http://localhost:3000/api/v1/wo?mo_id={MO_id}" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

---

## Step 5 — Upload a second revision: MARK-A removed, MARK-B qty decreased, MARK-C qty increased

Prepare a modified copy of the Rev.0 Assembly/Assembly-Part/Part List files (or use an existing "Rev.1" fixture and pick marks matching this exact pattern — check `storage/test_bom_file/test_diff_bom_file/` first before hand-editing new files):
- **MARK-A**: delete its row entirely from the Assembly List (and its junction/part rows)
- **MARK-B**: reduce its `qty` (e.g. 3 → 2)
- **MARK-C**: increase its `qty` (e.g. 1 → 2)

```bash
BASE1="{path to the modified Rev.1 files}"

curl -s http://localhost:3000/api/v1/bom/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "project_id={project_id}" -F "zone_id={zone_id}" \
  -F "files=@\"${BASE1}/Assembly List Rev.1.xls\"" -F "doc_types=ASSEMBLY_LIST" \
  -F "files=@\"${BASE1}/Assembly Part List Rev.1.xls\"" -F "doc_types=ASSEMBLY_PART_LIST" \
  -F "files=@\"${BASE1}/Part List Rev.1.xls\"" -F "doc_types=PART_LIST" \
  > /tmp/wo_hold_upload_result.json

cat /tmp/wo_hold_upload_result.json | python3 -m json.tool
```

Record the new dispatch id as **D2**.

---

## Step 6 — Capture WO + MO state after upload

```bash
curl -s "http://localhost:3000/api/v1/wo/{WO-A_id}" -H "Authorization: Bearer $TOKEN" > /tmp/wo_a.json
curl -s "http://localhost:3000/api/v1/wo/{WO-B_id}" -H "Authorization: Bearer $TOKEN" > /tmp/wo_b.json
curl -s "http://localhost:3000/api/v1/wo/{WO-C_id}" -H "Authorization: Bearer $TOKEN" > /tmp/wo_c.json
curl -s "http://localhost:3000/api/v1/wo/{WO-A_id}/bom-version-status" -H "Authorization: Bearer $TOKEN" > /tmp/wo_a_status.json
curl -s "http://localhost:3000/api/v1/wo/{WO-B_id}/bom-version-status" -H "Authorization: Bearer $TOKEN" > /tmp/wo_b_status.json
```

---

## Step 7 — Assert expected values

```bash
python3 << 'EOF'
import json

PASS, FAIL = '✅', '❌'
results = []

def check(label, actual, expected):
    results.append((PASS if actual == expected else FAIL, label, expected, actual))

with open('/tmp/wo_hold_upload_result.json') as f:
    upload = json.load(f)
hs = upload.get('hold_summary', {})
check('hold_summary.held_wo_count', hs.get('held_wo_count'), 2)

with open('/tmp/wo_a.json') as f: wo_a = json.load(f)
with open('/tmp/wo_b.json') as f: wo_b = json.load(f)
with open('/tmp/wo_c.json') as f: wo_c = json.load(f)
check('WO-A status (removed mark)', wo_a.get('status'), 'ON_HOLD')
check('WO-B status (qty decreased)', wo_b.get('status'), 'ON_HOLD')
results.append((PASS if wo_c.get('status') != 'ON_HOLD' else FAIL,
                 'WO-C status (qty increased → NOT held)', '!= ON_HOLD', wo_c.get('status')))

with open('/tmp/wo_a_status.json') as f: status_a = json.load(f)
with open('/tmp/wo_b_status.json') as f: status_b = json.load(f)
results.append((PASS if 'REMOVED' in status_a.get('delta_types', []) else FAIL,
                 'WO-A delta_types includes REMOVED', 'REMOVED', status_a.get('delta_types')))
results.append((PASS if 'QTY_CHANGED' in status_b.get('delta_types', []) else FAIL,
                 'WO-B delta_types includes QTY_CHANGED', 'QTY_CHANGED', status_b.get('delta_types')))
qty_delta = status_b.get('delta_details', {}).get('qty', {})
results.append((PASS if qty_delta.get('to', 0) < qty_delta.get('from', 0) else FAIL,
                 'WO-B qty delta direction is a decrease', 'to < from', qty_delta))

passed = sum(1 for r in results if r[0] == PASS)
failed = sum(1 for r in results if r[0] == FAIL)
print(f'\n{"="*60}\nRESULT: {passed} passed, {failed} failed out of {len(results)}\n{"="*60}')
for icon, label, expected, actual in results:
    if icon == FAIL:
        print(f'{icon} FAIL | {label} | expected={expected} | actual={actual}')
print('\n✅ ALL ASSERTIONS PASSED' if failed == 0 else f'\n❌ {failed} ASSERTION(S) FAILED — see above')
EOF
```

---

## Step 8 — Resolve WO-A via Cancel (REMOVED can't Accept)

First confirm Accept is blocked:

```bash
curl -s -X POST "http://localhost:3000/api/v1/wo/{WO-A_id}/accept-new-version" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"note":"trying anyway"}' -w "\nHTTP %{http_code}\n"
```
Expected: **HTTP 409** (`Assembly was REMOVED...`).

Then cancel it:

```bash
curl -s -X POST "http://localhost:3000/api/v1/wo/{WO-A_id}/cancel" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"reason":"BOM revision removed this mark","qty_reusable":0}' -w "\nHTTP %{http_code}\n"
```
Expected: **HTTP 200/201**, WO-A status → `CANCELLED`.

---

## Step 9 — Resolve WO-B via Accept + note

```bash
curl -s -X POST "http://localhost:3000/api/v1/wo/{WO-B_id}/accept-new-version" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"note":"qty reduced 3→2, no rework needed"}' -w "\nHTTP %{http_code}\n"
```
Expected: **HTTP 200/201**, WO-B status leaves `ON_HOLD` (back to `NOT_STARTED`/`IN_PROGRESS` per its pre-hold state).

```bash
curl -s "http://localhost:3000/api/v1/wo/{WO-B_id}/events" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```
Expected: event list contains one `HOLD` entry followed by one `ACCEPT_VERSION` entry whose `notes` includes "qty reduced 3→2, no rework needed".

---

## Step 10 — MO detail `stale_assembly_warnings` (DRAFT MO case)

Create a **second** MO, same project/zone, referencing MARK-B (or any superseded mark), with `confirm: false` (stays DRAFT — no WOs auto-created):

```bash
curl -s http://localhost:3000/api/v1/mo \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"primary_mark_prefix_code":"...", "routing_template_id": ..., "confirm": false, "assembly_lines":[{"bom_assembly_id": {MARK-B id from D1}, "qty": 1}]}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('MO2 =', d.get('id','ERROR'))"

curl -s "http://localhost:3000/api/v1/mo/{MO2_id}" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```
Expected: response includes `stale_assembly_warnings` with 1 entry referencing MARK-B's superseded assembly; MO status is still `DRAFT` (Confirm was not blocked by this warning).

---

## Step 11 — Generate test report

```bash
TODAY=$(date +%Y-%m-%d)
cp docs/test-scripts/wo-bom-hold/wo-bom-hold-test-report-template.md \
   docs/test-scripts/wo-bom-hold/wo-bom-hold-test-report-${TODAY}.md
```

Fill in: metadata (D1/D2/MO/MO2/WO-A/B/C ids), mark each check Pass/Fail from Step 7's assertion output + Steps 8-10's manual checks, log any failures in the Bug Log, fill the Summary table, present to the user.

---

## Expected Values Reference (source of truth)

```
Baseline (D1): MARK-A, MARK-B (qty=3), MARK-C (qty=1) all exist, no WO yet.
MO confirm → 3 WOs auto-created (WO-A, WO-B, WO-C), all NOT_STARTED.

Rev.2 (D2):
  MARK-A → removed entirely
  MARK-B → qty 3 → 2 (decrease)
  MARK-C → qty 1 → 2 (increase)

Expected after upload:
  hold_summary.held_wo_count = 2   (WO-A, WO-B — NOT WO-C)
  WO-A: status=ON_HOLD, bom-version-status.delta_types includes REMOVED, Accept → 409
  WO-B: status=ON_HOLD, delta_types includes QTY_CHANGED, delta_details.qty={from:3,to:2}
  WO-C: status unchanged (NOT_STARTED) — qty-increase is informational only, no hold

Expected after resolution:
  WO-A cancelled (qty_reusable=0, qty_done was 0)
  WO-B accepted with note, status back to NOT_STARTED, events = [HOLD, ACCEPT_VERSION]

Expected MO2 (DRAFT, references superseded MARK-B):
  stale_assembly_warnings.length = 1, MO2.status still DRAFT
```

---

## Re-run Notes

- This test **creates real MO/WO/dispatch rows** — prefer a scratch project/zone, or `TRUNCATE ... RESTART IDENTITY CASCADE` the relevant tables afterward per this project's established local-dev cleanup pattern (check zero downstream dependents first).
- If you need a qty_done > 0 variant (to also exercise the `qty_reusable`-required guard on Accept/Cancel), first call `POST /wo/:id/release` → `/start` → `/done` with `qty_done` set on a 4th WO before uploading the qty-decrease revision for its mark, then confirm both Accept and Cancel 400 without `qty_reusable` and succeed with it.
- If a new assembly/part fixture file is created for Step 5 instead of hand-editing, update the "Expected Values Reference" section above with the new marks/quantities.
