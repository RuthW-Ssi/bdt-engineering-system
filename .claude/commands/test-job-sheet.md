# /test-job-sheet — Per-piece Job Sheet (ใบงานต่อชิ้น) end-to-end test

Runs the checks in `docs/test-scripts/job-sheet/job-sheet-test-report-template.md` and fills a dated report.
Not yet run end-to-end — treat the first run as part of the test.

## 1. Env verification
- Backend on :3000 (`cd backend && pnpm start:dev`), frontend on :5173 (`pnpm dev`).
- `backend/assets/fonts/sarabun/Sarabun-Regular.ttf` and `Sarabun-Bold.ttf` exist.
- Login works and the user has `orders:view`. Export `BDT_API`, `BDT_USER`, `BDT_PASS` (never write the password into a file).
- Pick: MO-A (assembly MO with WOs), MO-B (assembly MO without WOs), MO-C (MO Part imported from NC), WO-1 (a WO of MO-A), the zone id of MO-A.

## 2. Test steps
1. `cd backend && pnpm jest job-sheet` — three specs (`job-sheet-format`, `job-sheet.service`, `job-sheet-pdf-builder`).
2. `pnpm vitest run src/components/mo/JobSheetModal.test.tsx` (repo root).
3. `python3 docs/test-scripts/job-sheet/job_sheet_api_check.py --mo <MO-A> --wo <WO-1> --zone <zone>` — checks A1–A12 (A12 = zone batch over every CONFIRMED / IN_PROGRESS MO of that zone; MO-A must be CONFIRMED or IN_PROGRESS for it to appear).
4. Repeat step 3 with `--mo <MO-B>` and `--mo <MO-C>` (no `--wo`).
5. Manual UI checks U1–U8 and paper checks P1–P10 from the template (print one real A4 sheet).

## 3. Python assertion script
`docs/test-scripts/job-sheet/job_sheet_api_check.py` — exits non-zero when any check fails; paste its output into the report.

## 4. Report generation
Copy `docs/test-scripts/job-sheet/job-sheet-test-report-template.md` to
`docs/test-scripts/job-sheet/job-sheet-test-report-YYYY-MM-DD.md`, fill every Result cell, list findings with severity, collect the sign-offs.

## 5. Expected values reference
- Piece mode: sheets per part = MO line qty × `bom_assembly_part.qty`; `pieceNo` = 1..`pieceTotal`.
- Part mode: one sheet per (assembly mark, part mark); `pieceNo` is null; sum of `pieceTotal` = piece-mode sheet count.
- Cap: more than 500 sheets in one batch → 409 `JOB_SHEET_TOO_MANY`; nothing matching → 409 `JOB_SHEET_EMPTY`; unknown MO → 404.
- Due date = MO `plan_finish`, printed dd/mm/yyyy in Asia/Bangkok.
- `heatNo` / `plateId` are null (blank hand-fill boxes) until plate heat traceability provides them.
- Hole summary: from `bom_part.attributes.holes`, else the MO Part line of the same part mark; no source → "no hole data" (never a printed zero).
- PDF: A4 portrait, one page per sheet, Title `JOBSHEET-<MO code>-<yyyymmdd>-<hhmmss>` (Bangkok time).

## 6. Re-run notes
- The script is read-only (GET requests only) — safe to re-run on any environment.
- A 503 `PRINT_BUSY` means the shared print render slots are full (MO print packets use the same slots) — wait and retry.
- The form is draft wording pending production / QA review: layout findings from production / QA go into the report's Findings table, not straight into code.
