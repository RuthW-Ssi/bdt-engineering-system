---
description: E2E test — Project Progress phase tracking (Form v2): migration truth, clamps, status ladder, bulk set-full, two-shade 3D coloring
---

# /test-project-progress-phase — Progress Form v2 (phase tracking) E2E

Verifies the Sprint 26 phase-tracking rebuild of `bom_assembly_progress`:
10 weighted fabrication stage percents, transport (dates + loaded pcs),
erection (erected pcs), 3 separate progress numbers, 5-status ladder with
light/dark shades, bulk set-full flags.

## 1. Environment verification

```bash
# Postgres (Docker) + backend + frontend must be up
docker ps --format '{{.Names}} {{.Status}}' | grep bdt-postgres
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" -d '{"login":"admin","password":"BdtDev2026!"}'   # expect 200/201
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/                            # expect 200
```

Test target: project `0X220` zone `17` (Zone-A, 50 ACTIVE assemblies with
real migrated v1 data). Reference assemblies: `TC-CO1` (id 80, qty 1),
`TC-FB1` (id 108, qty 16), `TC-FB3` (id 110, qty 8).

## 2. Test steps

1. **Migration truth** — `GET /projects/0X220/progress/rows`: expect 50
   rows, status counts `{notstart: 30, fabrication: 5, done: 15}` (from
   the v1 mapping: qc-passes → stage 100s, install dates → erected full).
   A migrated done row (e.g. TC-RF1) reads `qc_inspection=100,
   qc_final=100, loaded_pcs=qty, erected_pcs=qty, status=done`.
2. **Clamps** — PATCH stage `5000` → stored 100; `-5` → 0; `50.4` → 50;
   `loaded_pcs: 99` on qty-4 row → stored 4. UI number inputs clamp
   identically before staging.
3. **Partial update** — open a row's edit panel, change ONE field, Save:
   the PATCH body must contain only that field (diff-only semantics).
4. **Status ladder** (drive one multi-qty assembly, e.g. TC-FB1 qty 16):
   `weld1=50` → fabrication/light (fab 7.5) · all stages 100 →
   fabrication/dark · `loaded_pcs=5` → load/light · `=16` → load/dark ·
   `erected_pcs=5` → erection/light · `=16` → done. Chip + 3D recolor at
   every step.
5. **Bulk set-full** — select 2 rows with DIFFERENT qty (TC-FB1 16 +
   TC-FB3 8), tick "Set loaded = full qty", Apply: each row's
   `loaded_pcs` must equal its OWN qty (16 and 8), not a shared number.
6. **Pills + isolate** — Overview tab shows 5 pills (Not Start /
   Fabrication / Load / Erection / Done) with correct counts; clicking
   Fabrication isolates BOTH yellow shades together, everything else dims
   to `#4A4A4A`.
7. **Shade distinctness (pixel)** — screenshot the 3D canvas in isolate
   mode; sample pixels: light `#F2C14E` vs dark `#D48A0F` yellows must
   cluster separately, and neither may blur into notstart `#C7CBD1` or
   dim `#4A4A4A`.
8. **Restore** — revert every test edit via PATCH back to the captured
   pre-test values (keep the migrated demo state clean).

## 3. Assertion script

Automated version of steps 1/2/4/5 (adjust ids if data changed):

```bash
node - <<'EOF'
const API = 'http://localhost:3000/api/v1'
const ALL100 = Object.fromEntries(['cut','buildup','weld1','fitup_drill','weld2','qc_inspection','primer','fireproof','top_coat','qc_final'].map(s => [s, 100]))
const assert = (name, cond) => { if (!cond) { console.error('FAIL:', name); process.exitCode = 1 } else console.log('PASS:', name) }
const main = async () => {
  const { access_token } = await (await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: 'admin', password: 'BdtDev2026!' }) })).json()
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${access_token}` }
  const patch = async (id, b) => (await fetch(`${API}/projects/0X220/progress/assemblies/${id}`, { method: 'PATCH', headers: H, body: JSON.stringify(b) })).json()
  const rows = await (await fetch(`${API}/projects/0X220/progress/rows`, { headers: H })).json()
  assert('50 rows', rows.length === 50)

  const orig = rows.find(r => r.assembly_id === 108)
  let r = await patch(108, { weld1: 50 });  assert('fab light', r.status === 'fabrication' && r.shade === 'light' && r.fab_pct === 7.5)
  r = await patch(108, ALL100);             assert('fab dark', r.status === 'fabrication' && r.shade === 'dark')
  r = await patch(108, { loaded_pcs: 5 });  assert('load light', r.status === 'load' && r.shade === 'light')
  r = await patch(108, { loaded_pcs: 16 }); assert('load dark', r.status === 'load' && r.shade === 'dark')
  r = await patch(108, { erected_pcs: 5 }); assert('erection', r.status === 'erection')
  r = await patch(108, { erected_pcs: 16 });assert('done', r.status === 'done')
  r = await patch(108, { weld2: 5000 });    assert('pct clamp', r.weld2 === 100)
  r = await patch(108, { loaded_pcs: 99 }); assert('pcs clamp', r.loaded_pcs === 16)
  // restore
  await patch(108, { ...Object.fromEntries(Object.keys(ALL100).map(s => [s, orig[s]])), loaded_pcs: orig.loaded_pcs, erected_pcs: orig.erected_pcs })
  console.log('restore done')
}
main()
EOF
```

## 4. Report

Write to `docs/test-scripts/project-progress-phase/project-progress-phase-test-report-YYYY-MM-DD.md`:
per-step PASS/FAIL, screenshots of isolate mode + edit panel, pixel-sample
values for the shade check, and the restore confirmation.

## 5. Expected values reference

- Migration mapping (v1→v2): `qc_inspection_pass=true → qc_inspection=100`,
  `qc_final_pass=true → qc_final=100`, `actual_load_date → loaded_pcs=qty`,
  `install/qc_install date → erected_pcs=qty`.
- Stage weights: cut 10, buildup 10, weld1 15, fitup_drill 10, weld2 15,
  qc_inspection 10, primer 10, fireproof 5, top_coat 10, qc_final 5 (=100).
- Status hexes (statusMeta.ts): notstart `#C7CBD1`, fabrication
  `#F2C14E`/`#D48A0F`, load `#85B4E6`/`#2F6DB5`, erection `#9C8CE0`,
  done `#2E9E5F`; isolate dim `#4A4A4A`.

## 6. Re-run notes

- The ladder test mutates real demo data — the script restores afterwards,
  but if it crashes mid-run, re-apply the original values by hand (capture
  them first, as the script does).
- If zone 17's data has been reshuffled since 2026-07-30, the exact status
  counts in step 1 will differ — recapture the baseline before asserting.
