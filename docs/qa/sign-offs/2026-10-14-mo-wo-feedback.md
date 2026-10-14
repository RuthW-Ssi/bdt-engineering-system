# Release gate sign-off · mo-wo-feedback (2026-10-14)

Branch `dev-t-mo-wo-feedback` → `dev`. Reviewers: qa + security as separate general-purpose agents loaded with the role cards (named subagent types unavailable in this environment).

| Reviewer | Verdict | Findings |
|---|---|---|
| qa | WARN | 2 Medium · 5 Low — `docs/qa/findings/2026-10-14-mo-wo-feedback.md` |
| security | PASS | 2 Low — `docs/security/findings/2026-10-14-mo-wo-feedback.md` |

## Fixed before merge (each with a test that failed first)
- **QA F-1 (M)** — On Plan fills the plan dates into EMPTY fields only; typed dates and stored dates (edit after DONE) are never overwritten.
- **QA F-2 (M)** — accept new BOM version clears a mark's `actual_finish` (audited) when QC Passed no longer equals the new Quantity; WO Complete (no-marks path) requires every mark's finish date (400 `Every mark needs a Finish Date before completing: …`); the Complete button needs it too (`allMarksQcPassed`).
- **Security L2** — `actual_finish` validated with `@IsISO8601({ strict: true })` (no calendar roll-over).
- **Found while live-verifying the fixes** — `GET /wo/:id` did not return `marks[].actual_finish` (explicit field map in `findOne`), so the WO page never showed the saved date and the Complete button stayed hidden. Fixed; verified by API + browser (no unit test covers `findOne`).

## Accepted as Low / follow-up
- QA F-3 negative Not Started display after Quantity lowered (save still works) · F-4 legacy done(marks) keeps `≤` · F-5 / Security L1 stale check doesn't cover `actual_finish` (both edits still in history) · F-6 progress chips match the MO line's assembly id (pre-existing rule shared with `qcShortfalls`) · F-7 CI must be green before the staging merge (process).

## Evidence
- Frontend vitest 381/381 · `pnpm run build` OK · backend work-orders + manufacturing-orders 632 pass · full backend 17 failures = baseline (4 suites) · `nest build` OK.
- Live (local): WO-IN-26000018 Finished column 14/10/2026 16:02, Complete visible; On Plan keeps typed start 13:00, fills empty finish from plan.
- Supabase read-only before staging: `work_order_mark.actual_finish` absent, no failed migrations; 4 DONE WOs with timeliness disagreeing with dates (left as is).

Verdict after fixes: **PASS** — ship.
