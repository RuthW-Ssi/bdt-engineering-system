# QA findings — MO type PRE_SHOP / FULL_SHOP (2026-10-09)

Branch `dev-t-mo-preshop` · worktree `bdt-app-mo-part` · scope = uncommitted diff vs `origin/dev` + untracked files
(41 modified files, 5 new migrations, new `preshop/` module, 8 new FE components, 5 new FE lib + tests).
Decision recommendation: **WARN** — no Critical / High; 4 Medium, 6 Low. Proceed only with the user's OK on the Mediums.

## Checks performed

| # | Check | Result |
|---|---|---|
| 1 | Notion task DoD | Not evaluated — no Notion task ID given for this branch (see F-009) |
| 2 | Tester wiki summary `wiki/tech/testing/per-feature/mo-type-preshop.md` exists, dated 2026-10-09 | ✅ |
| 3 | Every decision row maps to a real test (spec opened, test names confirmed) | ✅ 16/17 rows have a unit test; "BOM-only marks max = remaining" is live-only (F-006) |
| 4 | Raw test report `docs/test-scripts/<feature>/` | ❌ none (F-008) |
| 5 | Coverage on changed files | Not measured (full suites run by another process; results pending) |
| 6 | CI on branch | N/A — work is uncommitted |
| 7 | Wiki diff for changed area | ✅ `data-model.md:563-566`, `backend/api.md:475-480`, `features/mo/4-implementation-delta.md`, `frontend/history-design.md`, `features/mo-part-import-plan.md` |
| 8 | Manual test evidence | ✅ user (Tao) ran pre-shop E2E + Full shop with simulated BOM rev 1/2 on local dev: "แจ่มตามที่คุยกันไว้เลย ok มาก" (chat only, no screenshots) |
| 9 | Smoke / E2E | N/A |
| 10 | Security BLOCK | Not known at time of writing (parallel run) |

### Decision row → test verification (spot-checked by opening the specs)

| Decision | Test confirmed |
|---|---|
| Type → code `MO-P`/`MO-F`, locked | `mo-code.generator.spec.ts` "prefixes F … P"; MO spec "asks for a code of its type", "refuses a type change" |
| Pre-shop refused in a zone with a BOM | MO spec "PRE_SHOP is refused in a zone that already has a real BOM"; `zoneHasBom` suite |
| Routing required; 1 zone = 1 live MO | "no MO without a routing, pre-shop included"; "one MO per zone" suite (409, zone from lines, cross-zone reject) |
| Uploads DN / PDF / DN+PDF | `preshop-pdf-parser.spec.ts`, `preshop.service.spec.ts` (createDispatch, fromDispatchNote, mergeFiles), `dispatch-note-parser.spec.ts`, `src/lib/preshop.test.ts` |
| DN+PDF combine, conflicts, file removal | `src/lib/preshopCombine.test.ts` (6 cases) |
| Every value compared exactly | `asm-fields.spec.ts`, `sizeChanges` "no tolerance" + strict BOM, mergePreshop "name / W / H / area", bomCompare "differing only in name / W / H / area", "links … only when every value is the BOM's", WO "newer BOM row differing only in name" |
| Clicked card stays selected | `preshopMerge.test.ts` "the card the user clicked stays selected…" |
| Real BOM compare / new version / withdrawn part blocks / Complete waits | "compare with the real BOM" (5), "Full shop MO vs a new BOM version" (4), "confirmed as matching the new version", changeStatus "Complete waits for the BOM compare" |
| Renamed marks pairing | "marks renamed in the real BOM" (3); `pairParts`/`pairScore` in `preshop.service.spec.ts` |
| MO Rev + print + print log + QR rev | "MO revision" (2, `updatePreshopParts` only — F-004); `mo-print-format.spec.ts` (3); `mo-print.service.spec.ts` "logs the Rev … QR link" |
| Confirm/Start without reason | changeStatus "without a reason" (2) |
| Complete gated on QC | "Complete waits for QC on every operation" (4) |
| History MO + WO | `moHistory.test.ts` (7), `woHistory.test.ts` (4), `WoDetail.page.test.tsx` History tab, WO "edits are logged as EDIT events" (4), auto-create "logs CREATED" |

### Migrations (`backend/prisma/migrations/2026100*` new on this branch)

| Migration | Verdict on a populated DB |
|---|---|
| `20261007100000_mo_shop_type` | Safe: new enum, `NOT NULL DEFAULT 'FULL_SHOP'`, `DROP NOT NULL` on `primary_mark_prefix_code`, idempotent seed of SYS-PRESHOP template + op. String values fit column widths (`state` VARCHAR(20), `time_mode` VARCHAR(10) = 'activities'). Fails on an **empty** DB — F-001 |
| `20261007110000_preshop_op_icon` | Safe: idempotent insert (`status` 'system' fits VARCHAR(10), `time_mode` 'by_activities' fits VARCHAR(20)) + targeted UPDATE of SYS-PRESHOP op only |
| `20261008100000_wo_event_created_edit` | Safe: `ADD VALUE IF NOT EXISTS` ×2 (same pattern as `20261005000000`, already deployed) |
| `20261009100000_mo_revision` | Safe: `INT NOT NULL DEFAULT 0`, `IF NOT EXISTS` |
| `20261009110000_mo_print_log` | Safe: new table + index + FK CASCADE |

No drops, no renames, no NOT NULL without default → IS8 destructive check in `migrate-deploy.yml` will pass. `schema.prisma` diff matches the SQL.

## Findings

### F-001 — SYS-PRESHOP seed fails on an empty database
- **where:** `backend/prisma/migrations/20261007100000_mo_shop_type/migration.sql:15` and `:20`
- **what:** `create_uid`/`write_uid` = `(SELECT MIN(id) FROM res_users)` and `workcenter_id` = `COALESCE(WC-HBEAM, MIN active WC)`; all three columns are NOT NULL. No earlier migration seeds `res_users` or `mrp_workcenter`, so on a fresh DB (Prisma shadow DB for `migrate dev`, a new test DB) the INSERT violates NOT NULL and the migration aborts. Staging/Supabase has users + workcenters, so the deploy itself is fine.
- **severity:** Medium
- **evidence:** tester summary: "Applied on local `bdt_dev` via `db execute` + `migrate resolve`" — `migrate dev` path not exercised. (Fresh-DB reproducibility is already caveated by the 2026-06-10 force-push ghost migrations, so this adds to an existing gap rather than creating one.)
- **fix_route:** data — guard the inserts with `WHERE EXISTS (SELECT 1 FROM res_users)` / workcenter present, or accept and document.

### F-002 — QC gate reads the live routing template, not the MO's op snapshot
- **where:** `backend/src/modules/manufacturing-orders/manufacturing-orders.service.ts:1405` (`qcShortfalls`)
- **what:** Ops required for Complete = current `mrp_routing_workcenter` rows of `mo.routing_template_id`, matched to WOs by `source_routing_op_id`. If the routing template is edited after WOs exist (an op added, or an op deleted+re-added — `routing.service.ts:370` deletes ops missing from the canvas), every MO on that template gains an operation × mark shortfall that its WOs can never satisfy → Complete blocked. Same if a DRAFT MO's routing is changed after WOs were issued (WOs on DRAFT MOs are allowed — known gap).
- **severity:** Medium
- **evidence:** schema comment "Operations snapshotted at create (ADR-0012)" vs `findMany({ where: { template_id: mo.routing_template_id } })`. No test covers a routing edited after WOs.
- **fix_route:** be (decide: ops from WOs' snapshots / MO snapshot, or block template edits in use) + tester.

### F-003 — Complete gate applies to existing in-progress MOs on staging
- **where:** `manufacturing-orders.service.ts:1440-1445` (`changeStatus` → `bomCompare` + `qcShortfalls`)
- **what:** Both new Complete gates apply to all ASSEMBLY MOs, including MOs already IN_PROGRESS on the shared Supabase DB whose WOs predate this rule (QC-passed may be partial, op coverage incomplete, older BOM versions pending compare). They may become un-completable without data clean-up. Not tested against real data; manual test was on simulated local data only.
- **severity:** Medium
- **evidence:** gate has no legacy/date exemption; tester summary lists no staging-data check.
- **fix_route:** data — before dev→staging, SELECT IN_PROGRESS MOs and run `GET /mo/:id/qc-check` / `bom-compare` on them; user confirms expected behaviour.

### F-004 — Rev bump only unit-tested on the part-edit path
- **where:** `manufacturing-orders.service.ts:737` (`mergePreshop`), `:1141` (`linkBom`), test `manufacturing-orders.service.spec.ts:1383-1417`
- **what:** `bumpRevision` has 3 callers; only `updatePreshopParts` asserts `revision: { increment: 1 }`. Upload-merge and BOM-compare/rename paths are untested for bump / no-bump. `linkBom` decides with a regex on Thai log text (`/ เก็บค่าเดิม/`) — a wording change in a log string silently changes whether the paper Rev moves.
- **severity:** Medium
- **evidence:** only one `increment: 1` assertion in the spec; grep of `bumpRevision` shows lines 737, 1141, 1169.
- **fix_route:** tester (add bump / no-bump cases for mergePreshop + linkBom "keep all" vs "apply"); be (optional: decide on a flag rather than log text).

### F-005 — Full shop create does not refuse pre-shop assemblies server-side
- **where:** `manufacturing-orders.service.ts:1185-1230` (`create`, FULL_SHOP branch)
- **what:** FULL_SHOP `assembly_lines` are not checked for `dispatch.source = 'BOM_UPLOAD'`; the exclusion of PRE_SHOP dispatches is UI-only (picker). Mostly masked by "1 zone = 1 live MO", but a cancelled pre-shop MO frees the zone.
- **severity:** Low
- **evidence:** only check is `pre.length` / `assembly_lines.length`; `resolveZone` checks zone only.
- **fix_route:** be.

### F-006 — BOM-only add cap is live-only
- **where:** `manufacturing-orders.service.ts:1088`; spec mocks `assertQtyWithinRemaining` in every new suite (`spec:726,763,880,1171,1288,1456`)
- **what:** "add with max = remaining" for BOM-only marks has no unit test exercising the real check (tester summary marks it "✅ live").
- **severity:** Low
- **fix_route:** tester.

### F-007 — WO header shows an empty prefix chip for new MOs
- **where:** `src/pages/WoDetail.tsx:225`; type `src/api/wo.ts:216` still declares `primary_mark_prefix_code: string` / `primary_mark_prefix: MarkPrefix` (non-null)
- **what:** New MOs have no prefix → empty red chip rendered on WO detail; type now lies about nullability. MoDetail guards with `mo.mark_prefix &&`.
- **severity:** Low
- **fix_route:** fe.

### F-008 — No raw test report / coverage for this feature
- **where:** `docs/test-scripts/` (nothing for mo-type-preshop)
- **what:** Checklist item 4/5: no dated raw report, no coverage on the changed service (`manufacturing-orders.service.ts` +927 lines). Full-suite results are pending from the parallel run.
- **severity:** Low (wiki summary is complete; suite results to be appended)
- **fix_route:** tester (append suite + coverage numbers to the wiki summary).

### F-009 — Notion DoD not verifiable in this run
- **where:** Notion task for `dev-t-mo-preshop` (no ID supplied)
- **what:** Checklist item 1 not evaluated. Known pattern: same-day follow-ups skip Notion.
- **severity:** Low (INFO) — raise to High if the DoD exists and has unchecked items
- **fix_route:** caller / wrap-up.

### F-010 — pdfjs-dist 3.11.174 + large in-memory uploads (note for security)
- **where:** `backend/package.json:52`; `manufacturing-orders.controller.ts:110`
- **what:** pdfjs-dist 3.11.174 is in the CVE-2024-4367 range (fixed 4.2.67); mitigated here by `isEvalSupported: false` (`preshop-pdf-parser.ts:71`). PDF import accepts up to 100 × 10 MB into `memoryStorage` (≈1 GB per request) on Cloud Run.
- **severity:** Low (INFO — security has final say)
- **fix_route:** security / be.

## Untested-but-accepted (from tester's Known gaps)
WO creatable on DRAFT MO (pre-existing) · WO Overview "Edit qty" history still old table · Complete hint tooltip-only · simulated BOM dispatches 35/37 local only.
