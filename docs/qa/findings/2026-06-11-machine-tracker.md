# QA Findings — F-Machine-Tracker
_Date: 2026-06-11 · Branch: dev · Feature: F-Machine-Tracker (T-MACH.01–10)_
_Reviewer: qa subagent · Dispatched by /release-gate · Review-only_

---

## Summary

| Severity | Count |
|---|---|
| High | 4 |
| Medium | 5 |
| Low | 2 |

**Decision: BLOCK** — High findings #1–4 must be resolved before ship.

---

## Findings

### F-01 · HIGH — Wiki test summary all "⏳ pending" (no test execution evidence)

- **where:** `~/Documents/bdt/knowledge-base/projects/bdt-engineering-system/wiki/tech/testing/per-feature/machine-tracker.md`
- **what:** The wiki test summary file EXISTS (created 2026-06-11) but every single row in the DoD coverage map still reads "⏳ pending T-MACH.01/02/03/…". No test has been executed and recorded. The file is the pre-spec draft only — it has never been updated by the tester with actual pass/fail results. Per QA role card checklist item #3: "Wiki summary DoD coverage map = 100% PASS → severity if fail: High."
- **evidence:** All 32 rows in the DoD coverage table have `⏳ pending T-MACH.XX` status. No row shows ✅.
- **severity:** High
- **fix_route:** tester — run test scenarios against the implementation, fill Status column (✅/❌) for every row, add test report URL

---

### F-02 · HIGH — No raw test report for machine-tracker

- **where:** `docs/test-scripts/` directory
- **what:** No test report file exists under `docs/test-scripts/machine-tracker/` (directory doesn't exist). Per QA role card checklist item #4: "Raw test report exists with current date → Medium (if wiki summary OK)." Since the wiki summary is also not PASS (F-01), this escalates to High in combination.
- **evidence:** `ls docs/test-scripts/` shows only `bom_upload/` and `drop-sprint4-routing/` — no `machine-tracker/` directory or any test report file.
- **severity:** High
- **fix_route:** tester — create `docs/test-scripts/machine-tracker/<date>-test-report.md` per project convention

---

### F-03 · HIGH — No unit/integration spec files for machines module (coverage 0%)

- **where:** `backend/src/modules/machines/` (all files)
- **what:** There are 0 `*.spec.ts` files in the machines module directory. The existing backend coverage report (`backend/coverage/coverage-final.json`) contains no entries for any file under `src/modules/machines/`. Per QA role card checklist item #5: service target 90%+ · controller target 80%+. Actual: 0% across all.
- **evidence:** `find backend/src/modules/machines -name "*.spec.ts"` returns nothing. Coverage JSON has no `machines` module keys.
- **severity:** High
- **fix_route:** tester — write unit tests for `machines.service.ts`, `repair-code.generator.ts`, and at least e2e/controller test for `machines.controller.ts`

---

### F-04 · HIGH — No manual test evidence provided

- **where:** This release-gate session
- **what:** QA role card anti-pattern #1: "Signing off without manual test evidence — 'Trust me' not acceptable — require screenshot or scenario list from user." No screenshots, no scenario walkthrough, no Notion completion notes have been provided for any T-MACH task.
- **evidence:** No attachments or scenario notes in this session. Notion task DoD checkboxes not verifiable without manual evidence.
- **severity:** High
- **fix_route:** user — provide manual test evidence (screenshots or scenario walkthrough) for at least the happy path (PM log, open repair ticket, close repair ticket, status change + suggest dialog)

---

### F-05 · MEDIUM — Tab 4 RepairTicketsTab missing inline "ปิด ticket" button

- **where:** `src/pages/MachineDetail.tsx` → `RepairTicketsTab` function (line ~219)
- **what:** The DoD specifies "Tab 4 Repair Tickets shows OPEN highlighted at top with 'ปิด ticket' button inline — Open ticket has light-red bg + border + '🟢 ปิด ticket · ซ่อมเสร็จ' button." The implementation renders OPEN ticket cards with orange `#fff7ed` background but NO inline close button within the card. The close action exists only in `ActionButtons` in the header (which appears when machine status is REPAIR and there is an open ticket), not inline in Tab 4.
- **evidence:** `RepairTicketsTab` renders ticket cards with severity/status pills and problem description but no CloseRepairTicketModal trigger or any inline close button. `grep "CloseRepairTicket\|ปิด.*ticket"` in `MachineDetail.tsx` returns no matches.
- **severity:** Medium
- **fix_route:** fe — add an inline "ปิด Ticket" button inside each open ticket card in `RepairTicketsTab`, triggering `CloseRepairTicketModal`

---

### F-06 · MEDIUM — `related_repair_id` never populated in status_history

- **where:** `backend/src/modules/machines/machines.service.ts` → `changeStatus()` · `backend/src/modules/machines/dto/change-status.dto.ts`
- **what:** The DoD specifies "BE: status_history auto-logged on every PATCH /status with related_id — After repair POST + confirm status change → status_history row has related_repair_id set." The `ChangeStatusDto` has no `related_repair_id` field. The `changeStatus` service method creates the history record with `related_repair_id` always NULL. The `machine_status_history` schema has the column but the code never populates it.
- **evidence:** `ChangeStatusDto` (line 1–17) has only `new_status`, `reason`, `changed_by`. Service `changeStatus()` (line 199–217) passes no `related_repair_id` to the history create.
- **severity:** Medium
- **fix_route:** be — add optional `related_repair_id?: number` and `related_maintenance_id?: number` to `ChangeStatusDto` + pass through in service; FE `ReportRepairModal` and `CloseRepairTicketModal` must pass the ticket ID when triggering the status change after suggestion

---

### F-07 · MEDIUM — MulterError LIMIT_FILE_SIZE unhandled (500 instead of 413)

- **where:** `backend/src/modules/machines/machines.controller.ts` → `uploadPhoto()` (line 102–129)
- **what:** When a file exceeds the 5MB limit (`MAX_SIZE`), multer throws a `MulterError` with `code: 'LIMIT_FILE_SIZE'`. Without a custom `ExceptionFilter` for `MulterError`, NestJS's default filter will return HTTP 500 instead of the expected 413 Payload Too Large. The wiki test spec negative case "Photo upload >5MB → 413 Payload Too Large" would fail.
- **evidence:** No `MulterError` import or `ExceptionFilter` found anywhere in `backend/src/`. The `bom-upload` controller has the same gap, confirming no shared filter exists.
- **severity:** Medium
- **fix_route:** be — add a NestJS `ExceptionFilter` (or inline catch in the upload method) that maps `MulterError.code === 'LIMIT_FILE_SIZE'` → `HttpStatus.PAYLOAD_TOO_LARGE (413)` and `LIMIT_UNEXPECTED_FILE` → `BadRequestException`

---

### F-08 · MEDIUM — CI branch status not verifiable

- **where:** `.github/workflows/deploy-backend.yml` · `.github/workflows/migrate-deploy.yml`
- **what:** CI run status on the `dev` branch cannot be verified in this offline review session (no `gh` CLI auth). Per QA checklist item #6: "CI on branch is green → severity if fail: High." This finding is marked Medium rather than High because the environment limitation is the blocker, not a known failure — but it must be confirmed green before ship.
- **evidence:** QA is operating offline; `gh run list` would require network + auth.
- **severity:** Medium
- **fix_route:** devops / user — confirm `gh run list --limit 1 --branch dev` shows ✅ before proceeding

---

### F-09 · LOW — MIME validation is client-declared only (no magic-bytes check)

- **where:** `backend/src/modules/machines/machines.controller.ts` → `fileFilter` callback (line 122–124)
- **what:** The multer `fileFilter` checks `file.mimetype` which is taken from the `Content-Type` header in the multipart part — client-controlled. A malicious upload could set `Content-Type: image/jpeg` while sending an executable payload and it would pass the filter. True MIME validation requires reading the first bytes (magic bytes) of the file. This is a low-severity pilot concern; not a blocker for internal production use.
- **evidence:** `if (ALLOWED_MIME.includes(file.mimetype)) cb(null, true)` — no `file-type` or similar library used.
- **severity:** Low
- **fix_route:** be / security — consider adding `file-type` package magic-bytes check in a follow-up task before external-facing use

---

### F-10 · LOW — Seed maintenance_log upsert uses hardcoded IDs 1 and 2

- **where:** `backend/prisma/seed-machine-tracker.ts` lines 119–146
- **what:** `prisma.maintenance_log.upsert({ where: { id: 1 }, ... })` and `where: { id: 2 }` are fragile — if any other seed or migration creates maintenance_log rows before this seed runs, those IDs may already exist with unrelated data. The `update: {}` no-op means it silently leaves wrong data if a collision occurs.
- **evidence:** Lines 119 and 133: hardcoded IDs 1 and 2 in `where` clause.
- **severity:** Low
- **fix_route:** data — use a natural-key upsert or findFirst-then-create pattern, e.g., `where: { machine_id_performed_at: { machine_id: ..., performed_at: ... } }` or a dedicated description-based unique constraint

---

## Implementation checks (PASS — not blocking)

| Check | Result |
|---|---|
| DTOs use `class-validator` (T-S.01) | PASS — all 5 DTOs use proper class + `class-validator` decorators |
| `@CurrentUser()` on all mutations (T-S.02) | PASS — decorator present on all 4 mutation endpoints |
| `JwtAuthGuard` on all endpoints | PASS — `@UseGuards(JwtAuthGuard)` at controller class level (applies to all routes) |
| Migration uses IF NOT EXISTS guards | PASS — enums use `DO $$ BEGIN / EXCEPTION WHEN duplicate_object` · tables use `CREATE TABLE IF NOT EXISTS` · ALTER uses `ADD COLUMN IF NOT EXISTS` |
| Seed uses upsert (idempotent machines) | PASS — `equipment_resource.upsert({ where: { code: ... } })` for all 8 machines |
| All 5 EquipmentStatus values in seed | PASS — OPERATIONAL (3), MAINTENANCE (1), REPAIR (1), UNAVAILABLE (1), RETIRED (1) |
| Photo upload has size validation | PASS — multer `limits: { fileSize: 5MB }` + FE pre-validation |
| Photo upload has MIME validation | PASS (client-side only — see F-09 for Low concern) |
| Route `/machines` and `/machines/:id` in App.tsx | PASS — lines 93–94 |
| Sidebar Machines entry in Production section, above QC | PASS — `Production` section order: Machines → QC → Reports (P13 compliant) |
| Sidebar uses Cog icon + "เครื่องจักร" TH label | PASS — `Cog` icon, `labelTh: 'เครื่องจักร'` |
| Suggest dialog after repair POST / close (Q-C P4) | PASS — `ReportRepairModal` and `CloseRepairTicketModal` both implement suggest dialog |
| `repair_ticket_seq` seeded with ON CONFLICT DO NOTHING | PASS — migration SQL line 83–85 |
| RPR-NNNNN code uses SELECT FOR UPDATE | PASS — `RepairCodeGenerator` uses raw `FOR UPDATE` in transaction |
| 8 machines seeded (≥8 per DoD) | PASS — 8 machines |
| `tsc` clean (stated as pre-verified) | PASS (per task statement — 0 errors on both BE+FE) |
| `MachinesModule` registered in `AppModule` | PASS — line 74 of `app.module.ts` |
| `PrismaModule` globally available | PASS — `@Global()` on `PrismaModule` |
