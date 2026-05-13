# /test-bom-diff

Run the BOM Diff feature test end-to-end against real test files and generate a filled test report.

## What this skill does

1. Verifies servers are running
2. Authenticates and finds a usable project + zone
3. Uploads Rev.0 BOM files → records Dispatch D1
4. Uploads Rev.1 BOM files → records Dispatch D2
5. Calls the diff API on D2 and asserts every expected value
6. Copies the template and fills in actual results
7. Reports pass/fail summary

---

## Step 1 — Verify environment

Check that both servers are up before doing anything else:

```bash
curl -s http://localhost:3000/api/v1/auth/login \
  -X POST -H "Content-Type: application/json" \
  -d '{"login":"admin","password":"BdtDev2026!"}' | python3 -c "import sys,json; d=json.load(sys.stdin); print('TOKEN:', d['access_token'][:30]+'...')"
```

If this fails → tell the user to start the backend first (`pnpm --filter backend dev`).

---

## Step 2 — Get auth token and find project/zone

```bash
# Get token
TOKEN=$(curl -s http://localhost:3000/api/v1/auth/login \
  -X POST -H "Content-Type: application/json" \
  -d '{"login":"admin","password":"BdtDev2026!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# List projects — pick first active one
curl -s "http://localhost:3000/api/v1/projects?limit=5" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

Pick `project_id` and then find a zone for that project:

```bash
curl -s "http://localhost:3000/api/v1/projects/{project_id}/zones" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

Pick `zone_id`. Note both values — use them for BOTH uploads.

---

## Step 3 — Upload Rev.0 (3 files)

```bash
BASE="backend/storage/test_bom_file"

curl -s http://localhost:3000/api/v1/bom/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "project_id={project_id}" \
  -F "zone_id={zone_id}" \
  -F "files=@\"${BASE}/2. THEPHA 28x54m. ZONE 2 Assembly List Rev.0.xls\"" \
  -F "doc_types=ASSEMBLY_LIST" \
  -F "files=@\"${BASE}/3. THEPHA 28x54m. ZONE 2 Assembly Part List Rev.0.xls\"" \
  -F "doc_types=ASSEMBLY_PART_LIST" \
  -F "files=@\"${BASE}/4. THEPHA 28x54m. ZONE 2 Part List Rev.0.xls\"" \
  -F "doc_types=PART_LIST" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('D1 =', d.get('id','ERROR'), '| status:', d.get('status'))"
```

Record the returned `id` as **D1**.

---

## Step 4 — Upload Rev.1 (3 files) — same project_id and zone_id

```bash
BASE1="backend/storage/test_bom_file/test_diff_bom_file"

curl -s http://localhost:3000/api/v1/bom/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "project_id={project_id}" \
  -F "zone_id={zone_id}" \
  -F "files=@\"${BASE1}/2. THEPHA 28x54m. ZONE 2 Assembly List Rev.1.xls\"" \
  -F "doc_types=ASSEMBLY_LIST" \
  -F "files=@\"${BASE1}/3. THEPHA 28x54m. ZONE 2 Assembly Part List Rev.1.xls\"" \
  -F "doc_types=ASSEMBLY_PART_LIST" \
  -F "files=@\"${BASE1}/4. THEPHA 28x54m. ZONE 2 Part List Rev.1.xls\"" \
  -F "doc_types=PART_LIST" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('D2 =', d.get('id','ERROR'), '| status:', d.get('status'))"
```

Record the returned `id` as **D2**.

---

## Step 5 — Call diff API and capture response

```bash
curl -s "http://localhost:3000/api/v1/dispatches/{D2}/diff" \
  -H "Authorization: Bearer $TOKEN" > /tmp/bom_diff_result.json

cat /tmp/bom_diff_result.json | python3 -m json.tool
```

If response is **204 No Content** → D1 was not found as previous version (wrong project/zone, or same sub_zone_id mismatch). Debug before continuing.

---

## Step 6 — Assert expected values

Run this assertion script against the captured response:

```bash
python3 << 'EOF'
import json, sys

with open('/tmp/bom_diff_result.json') as f:
    d = json.load(f)

agg = d['aggregate']
asm_diff = d['assembly_diff']
part_diff = d['part_diff']

PASS, FAIL = '✅', '❌'
results = []

def check(label, actual, expected, tol=0.01):
    ok = abs(actual - expected) < tol if isinstance(expected, float) else actual == expected
    results.append((PASS if ok else FAIL, label, expected, actual))

# Aggregate
check('weight_kg prev',    agg['weight_kg']['prev'],  11143.400, 0.01)
check('weight_kg curr',    agg['weight_kg']['curr'],  11855.220, 0.01)
check('weight_kg delta',   agg['weight_kg']['delta'],   711.820, 0.01)
check('area_m2 prev',      agg['area_m2']['prev'],      445.366, 0.01)
check('area_m2 curr',      agg['area_m2']['curr'],      479.597, 0.01)
check('area_m2 delta',     agg['area_m2']['delta'],      34.231, 0.01)
check('assembly_count prev', agg['assembly_count']['prev'], 47)
check('assembly_count curr', agg['assembly_count']['curr'], 47)
check('assembly added',    agg['assembly_changes']['added'],   2)
check('assembly removed',  agg['assembly_changes']['removed'], 2)
check('assembly changed',  agg['assembly_changes']['changed'], 4)
check('part_total prev',   agg['part_total']['prev'],  104)
check('part_total curr',   agg['part_total']['curr'],  104)
check('part added',        agg['part_changes']['added'],    2)
check('part removed',      agg['part_changes']['removed'],  2)
check('part changed',      agg['part_changes']['changed'], 13)

# Assembly added/removed
added_marks   = {r['curr']['assembly_mark'] for r in asm_diff if r['status'] == 'added'}
removed_marks = {r['prev']['assembly_mark'] for r in asm_diff if r['status'] == 'removed'}
changed_marks = {r['curr']['assembly_mark'] for r in asm_diff if r['status'] == 'changed'}

for m in ['TH-2CO12', 'TH-2RF16']:
    results.append((PASS if m in added_marks else FAIL, f'assembly added: {m}', 'added', 'found' if m in added_marks else 'NOT FOUND'))
for m in ['TH-2FB13', 'TH-2WH3']:
    results.append((PASS if m in removed_marks else FAIL, f'assembly removed: {m}', 'removed', 'found' if m in removed_marks else 'NOT FOUND'))
for m in ['TH-2CO5', 'TH-2FB5', 'TH-2PS1', 'TH-2RF1']:
    results.append((PASS if m in changed_marks else FAIL, f'assembly changed: {m}', 'changed', 'found' if m in changed_marks else 'NOT FOUND'))

# Assembly changed values
changed_map = {r['curr']['assembly_mark']: r for r in asm_diff if r['status'] == 'changed'}
def chk_asm(mark, field, prev_exp, curr_exp):
    r = changed_map.get(mark)
    if not r:
        results.append((FAIL, f'{mark}.{field}', f'{prev_exp}→{curr_exp}', 'MARK NOT FOUND'))
        return
    check(f'{mark}.{field} prev', r['prev'][field] or 0, prev_exp, 0.01)
    check(f'{mark}.{field} curr', r['curr'][field] or 0, curr_exp, 0.01)

chk_asm('TH-2CO5', 'weight_kg', 407.6,  412.85)
chk_asm('TH-2CO5', 'surface_area_m2', 15.801, 16.05)
chk_asm('TH-2FB5', 'qty',       36,     24)
chk_asm('TH-2FB5', 'weight_kg', 124.18, 82.79)
chk_asm('TH-2PS1', 'qty',       5,      6)
chk_asm('TH-2PS1', 'weight_kg', 405.35, 486.42)
chk_asm('TH-2RF1', 'weight_kg', 535.91, 549.21)

# Part added/removed
part_added   = {r['curr']['part_mark'] for r in part_diff if r['status'] == 'added'}
part_removed = {r['prev']['part_mark'] for r in part_diff if r['status'] == 'removed'}
part_changed_map = {r['curr']['part_mark']: r for r in part_diff if r['status'] == 'changed'}

for m in ['TH-2p77', 'TH-2p78']:
    results.append((PASS if m in part_added else FAIL, f'part added: {m}', 'added', 'found' if m in part_added else 'NOT FOUND'))
for m in ['TH-2FB13', 'TH-2WH3']:
    results.append((PASS if m in part_removed else FAIL, f'part removed: {m}', 'removed', 'found' if m in part_removed else 'NOT FOUND'))

# Part profile changes
def chk_part(mark, field, prev_exp, curr_exp):
    r = part_changed_map.get(mark)
    if not r:
        results.append((FAIL, f'part {mark}.{field}', f'{prev_exp}→{curr_exp}', 'MARK NOT FOUND'))
        return
    actual_prev = r['prev'][field]
    actual_curr = r['curr'][field]
    ok = str(actual_prev) == str(prev_exp) and str(actual_curr) == str(curr_exp)
    results.append((PASS if ok else FAIL, f'part {mark}.{field}', f'{prev_exp}→{curr_exp}', f'{actual_prev}→{actual_curr}'))

chk_part('TH-2WH1', 'profile', 'PL8x60',  'PL10x60')
chk_part('TH-2WH2', 'profile', 'PL8x60',  'PL10x60')
chk_part('TH-2m13', 'profile', 'RODRB19', 'RODRB22')
chk_part('TH-2m15', 'profile', 'RODRB19', 'RODRB22')

# Print results
passed = sum(1 for r in results if r[0] == PASS)
failed = sum(1 for r in results if r[0] == FAIL)
print(f'\n{"="*60}')
print(f'RESULT: {passed} passed, {failed} failed out of {len(results)}')
print(f'{"="*60}')
for icon, label, expected, actual in results:
    if icon == FAIL:
        print(f'{icon} FAIL | {label} | expected={expected} | actual={actual}')
if failed == 0:
    print('\n✅ ALL ASSERTIONS PASSED')
else:
    print(f'\n❌ {failed} ASSERTION(S) FAILED — see above')
EOF
```

---

## Step 7 — Generate test report

After assertions:

1. Copy template:
   ```bash
   TODAY=$(date +%Y-%m-%d)
   cp docs/test-scripts/bom-diff-test-report-template.md \
      docs/test-scripts/bom-diff-test-report-${TODAY}.md
   ```

2. Fill in the report file:
   - Metadata section: date, D1, D2, project, zone
   - Mark each test case Pass/Fail based on assertion output
   - Log any failed assertions in Bug Log section
   - Fill Summary table counts

3. Present the summary to the user.

---

## Expected Values Reference (source of truth)

> คำนวณจาก raw Excel files: `storage/test_bom_file/` vs `storage/test_bom_file/test_diff_bom_file/`
> อย่า hardcode ค่าใหม่โดยไม่ re-verify จากไฟล์จริง

```
ASSEMBLY LIST (Rev.0 → Rev.1):
  Total assemblies:   47 → 47
  Total weight_kg:    11143.400 → 11855.220  (Δ +711.820)
  Total area_m2:      445.366 → 479.597      (Δ +34.231)
  Added marks:        TH-2CO12, TH-2RF16
  Removed marks:      TH-2FB13, TH-2WH3
  Changed marks:      TH-2CO5, TH-2FB5, TH-2PS1, TH-2RF1

PART LIST (Rev.0 → Rev.1):
  Total parts:        104 → 104
  Added marks:        TH-2p77, TH-2p78
  Removed marks:      TH-2FB13, TH-2WH3
  Changed (qty):      TH-2FB5(36→24), TH-2p6(6→7), TH-2p7(6→7),
                      TH-2p8(6→7), TH-2p13(6→7), TH-2p40(1→2),
                      TH-2p57(96→102), TH-2p60(69→75), TH-2p61(40→44)
  Changed (profile):  TH-2WH1(PL8x60→PL10x60), TH-2WH2(PL8x60→PL10x60),
                      TH-2m13(RODRB19→RODRB22), TH-2m15(RODRB19→RODRB22)
```

---

## Known Issues (as of 2026-05-13)

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | `updateLine` / `removeLine` ไม่ check BOM state — แก้ line บน active BOM ได้ | P2 | Open |
| 2 | `activate()` ไม่ใช้ transaction — race condition ได้ 2 active BOMs | P2 | Open |
| 3 | `updateLine` partial XOR update อาจทำให้ line มีทั้ง material_id + sub_product_id | P2 | Open |

---

## Re-run Notes

ก่อน run ทุกครั้ง:
- ถ้า DB มี dispatch เก่าค้างอยู่ — ใช้ zone อื่น หรือ reset DB ก่อน เพื่อไม่ให้ previous pointer ชี้ผิด
- ถ้าเพิ่ม test file ใหม่ — อัปเดต Expected Values Reference section นี้ด้วย
