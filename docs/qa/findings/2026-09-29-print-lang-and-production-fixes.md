# QA Findings — Print Packet TH/EN Toggle + Production Fixes (dev → staging → main)

- **Scope:** exactly `git diff origin/staging origin/dev` (after `git fetch`,
  dev = `37c01d0`) — 3 commits, 12 files:
  - `78d2ab9` MO/WO print packet language toggle (TH/EN) + Thai tone-mark fix (PR #193)
  - `f626b69` OperationBuilder: publishing an op with a consuming library activity 500'd (PR #194)
  - `b4edbba` MO Complete now records Actual Finish (PR #195)
- **Reviewer:** `qa` role (run as general-purpose agent; named type unavailable).
- **Date:** 2026-09-29. Read-only — no source modified, nothing committed.

## Verification performed (fresh, not trusted from tester claims)

| check | result |
|---|---|
| `backend: npx jest src/modules/manufacturing-orders` | ✅ 9 suites / 151 tests pass |
| `npx vitest run src/pages/OperationBuilder.test.ts` | ✅ 2/2 pass |
| `npx tsc -b` (repo root) | ✅ exit 0 |
| `backend: npx tsc --noEmit -p tsconfig.json` | ✅ exit 0 |
| `pnpm run build` (real Vite build) | ✅ built (only the pre-existing >1000 kB chunk warning) |
| Local working tree = `origin/dev` (no tracked modifications) | ✅ tests ran against exactly the code being promoted |
| Rendered a Thai-data packet with `lang=th` and `lang=en` on dev, and the same plan on `origin/staging` (temp worktree, removed after), rasterized with `pdftoppm` | ✅ see below |

### Diff review — edge cases checked

**Subset font embedding (`mo-print-pdf-builder.ts:93`, `:628-629`).**
- Page count identical dev vs staging for the same plan (4 = manifest + part list + traveler + drawing); drawing pages are `copyPages`/`embedPage` of separate docs — unaffected by the font change.
- Watermark, QR center icon and WO watermark are vector/`drawText` with the same `fonts` object; render correctly in both languages.
- `pdffonts`: both Sarabun faces embedded, Identity-H with ToUnicode (text still extractable/searchable — `pdftotext` returns "วันที่", "เริ่มจริง", "วัสดุสิ้นเปลือง" intact).
- Tone-mark fix confirmed visually: staging renders "งานเชือม" (mark dropped onto vowel); dev renders "งานเชื่อม".
- Spec asserts every drawn glyph has a `/W` entry in its own font (en + th); tester confirmed RED on old config.

**`consumablesPayload` (`src/pages/OperationBuilder.tsx:50-56`).**
- Ad-hoc (non-library) activities: unchanged — still send `consumables` + `op_materials` (covered by test #2).
- Library activities loaded from DB (`mapActivities`, `:180`): their `op_materials` come from `op_act_material` rows; these are now dropped on re-save. `op_act_material` is read **only** by `operation-template.service.ts` (grep across `backend/src`) — MO/WO/routing/print read consumes from `source_activity.consumes` — and the "Update from library" path (`operation-template.service.ts:322`) already deletes `op_act_material` for library activities without recreating. So dropping them is consistent with existing semantics; no downstream data loss.

**DONE → `actual_finish` (`manufacturing-orders.service.ts:669`).**
- `manufacturing_order.update` exists at only two sites in `backend/src`: `update()` (DRAFT-only edit, `:614`) and `changeStatus()` (`:657`). DONE reachable only from IN_PROGRESS (`ALLOWED_TRANSITIONS`, `:30-36`); DONE is terminal, so no double-stamp. No bulk or WO-driven MO completion path exists. WO's own `actual_finish` (`work-orders.service.ts:643`) is an independent column — no interaction.
- Frontend reads MO `actual_finish` only in `MoDetail.tsx:407` (display) and the print manifest.

---

## Checklist (qa.md release-readiness table)

| # | check | result |
|---|---|---|
| 1 | Notion task DoD all checked | n/a — no Sprint 37 snapshot in `pm/_snapshots/`; not fabricated |
| 2 | Wiki test summary exists | ✅ `testing/per-feature/mo-print-lang.md`, `testing/per-feature/production-fixes-20260929.md` (both dated 2026-09-29) |
| 3 | Summary coverage = all PASS | ✅ all rows ✅ |
| 4 | Raw test report | n/a — summaries + fresh re-run above stand in |
| 5 | Coverage on changed files | not measured; every changed branch has a direct unit test |
| 6 | CI green | n/a — repo has only `deploy-backend.yml` / `migrate-deploy.yml`, no test workflow (QA-F-004); re-ran locally |
| 7 | Wiki diff for changed area | ✅ print: `features/mo-print-packet.md` (D15-D17, #language-toggle), `tech/backend/decisions.md`, `api.md:474`. Partial for actual_finish (QA-F-002) |
| 8 | Manual test evidence | ✅ user screenshot of dialog toggle (mo-print-lang #1); live endpoint runs on MO-26000001 / MO-26000003 / OP-DEMO-PAINT recorded in summaries |
| 9 | Smoke test | n/a — no Playwright suite |
| 10 | Security BLOCK | not visible to this pass (parallel) |

---

## Findings

### QA-F-001 — Thai values collide with the small grey label above them in form-grid cells (pre-existing)
- **where:** `backend/src/modules/manufacturing-orders/mo-print/mo-print-pdf-builder.ts:132-135` (`drawFormGrid`: label baseline `rowTop - 11` @9pt, value baseline `rowTop - 24` @≤13pt)
- **what:** a value with upper vowels/tone marks ("ทีมสมชาย", "โซน 1", "งานเชื่อม") touches or overlaps the label glyphs above it ("ทีม", "โซน", "Work Center").
- **scenario:** print any WO whose Team/Zone/Work Center is Thai → the traveler's "Work Order Details" labels are partially overprinted. Reproduced in both `lang=th` and `lang=en`.
- **evidence:** the same overlap appears on the `origin/staging` render, so this change did not introduce it. Tester already lists it as a known gap (Q21: "small form-grid labels sit close to values").
- **severity:** Low (cosmetic, pre-existing, tracked in Q21)
- **fix_route:** be (follow-up under Q21)

### QA-F-002 — Actual Finish-on-Complete isn't in the API/MO docs, and MOs already Done aren't backfilled
- **where:** `backend/src/modules/manufacturing-orders/manufacturing-orders.service.ts:669`; wiki `tech/backend/api.md:472` (`PATCH /mo/:id/status` — "Change status + reason → appends history", no mention of the `actual_start` / `actual_finish` stamps)
- **what:** the new behaviour is recorded only in the testing summary. Also, MOs completed before this release keep `actual_finish = null`.
- **scenario:** after promotion, any MO completed on staging/prod before the deploy still shows "Actual Finish —" on Overview and on the printed MO Info grid. Nothing is broken, but a user may report it as "the fix didn't work".
- **evidence:** production-fixes-20260929.md: "Existing Done MOs are not backfilled."
- **severity:** Low
- **fix_route:** wiki-integrator (api.md line). Backfill (e.g. from `mo_status_history` DONE row `create_date`) only if the user wants it — data role.

### QA-F-003 — Leftover `op_act_material` rows on library activities were not checked on staging/prod
- **where:** `src/pages/OperationBuilder.tsx:50-56`
- **what:** "0 rows" was verified on local dev only. On a DB where a library material id happened to equal a valid `equipment_resource.id`, the old code saved without an FK error and wrote a row pointing at the wrong resource. That row shows in Operation Builder as a phantom "op material", and the next Save/Publish now silently deletes it.
- **scenario:** the result is benign (no downstream reader uses `op_act_material`), but any such row is wrong data today.
- **evidence:** a grep shows `op_act_material` is read only in `operation-template.service.ts`.
- **severity:** Low (INFO)
- **fix_route:** data — optional check on staging: `SELECT count(*) FROM op_act_material m JOIN operation_template_activity a ON a.id = m.op_act_id WHERE a.source_activity_id IS NOT NULL;` (user runs it; the credentials are self-managed)

### QA-F-004 — No CI test workflow gates this promotion
- **where:** `.github/workflows/` (only `deploy-backend.yml`, `migrate-deploy.yml`)
- **what:** checklist #6 can't be evaluated. Tests and builds were re-run locally at `37c01d0` instead (all green above).
- **severity:** Low (INFO, standing condition, not specific to this release)
- **fix_route:** devops

### QA-F-005 — Taller section bands and headers also shrink English capacity per page
- **where:** `mo-print-pdf-builder.ts:80` (`SECTION_BAND_HEIGHT` 18→24), `:561` (`HEADER_ROW_HEIGHT` 14→20)
- **what:** the change is intentional (Thai marks need the room) and applies to both languages. The capacity-computed tables (MO Assembly List, Traveler Assembly List & QC, Activities) fit roughly one fewer row per page.
- **scenario:** an MO whose assembly list exactly filled the manifest page before may now spill onto an "(cont.)" page. The sample plan's page count is unchanged (4 = 4).
- **severity:** Low (INFO)
- **fix_route:** none (expected), noted for the user's manual regression

---

## Verdict

**PASS** from QA. There are no Critical, High or Medium findings, only 5 Low/INFO items. The final decision is still subject to the parallel security review.
