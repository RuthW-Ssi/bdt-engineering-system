# QA Findings — Drawing per-mark revision + A3 normalise

- **feature:** Drawing — per-mark revision, A3 normalise, staging upload key (Sprint 39)
- **branch under review:** `dev-t-drawing-revision`, range `58ad7e3..HEAD` (~22 commits after trailer rewrite), diffed against `origin/dev` base `58ad7e3`. **Not pushed to `origin`** (confirmed: `git branch -r` has no `origin/dev-t-drawing-revision`).
- **date:** 2026-10-20
- **reviewer:** qa (this run)
- **scope of this review:** QA lens only (release-readiness / DoD-coverage / doc-alignment / regression evidence). No Notion task exists yet for this feature (will be created post-gate per the task framing) — judged against the wiki spec (`drawing-revision-plan.md`) and impl plan (`drawing-revision-impl-plan.md`) in place of Notion DoD. No security subagent output found at `docs/security/findings/2026-10-20-drawing-revision.md` at review time — security's parallel pass is out of this review's scope; several security-relevant fixes (IDOR via client-supplied `file_key`, path traversal in `mark`/`file_name`, staff-name leak to customers) were already made **during** the SDD build per the execution ledger and are spot-checked below as implementation evidence, not as a substitute for the security subagent's own sign-off.

## QA-01 — Three of Task 8's required live-check DoD items were not live-verified (WO Visual tab, MO print stamp, customer login)

- **where:** impl plan `drawing-revision-impl-plan.md` → Task 8 bullet list ("Live check (local, Playwright)" — 4 bullets); tester summary `wiki/tech/testing/per-feature/drawing-revision.md`, last row ("Not live-checked")
- **what:** The plan's Task 8 explicitly calls for 4 live-check scenarios. Only 1 of 4 was actually run in a browser (Drawings page upload/review/rev-dropdown/delete-fallback/re-upload, done via Playwright per the ledger). The other 3 — WO Visual tab showing `Rev n`, MO print packet stamping `Rev n` in a real print, and a customer login seeing only the current rev with no ▾ — are disclosed by the tester's own summary as "⚠ gap", covered only by unit tests (`markDrawingRevs.test.ts`, `WoVisualTab.test.tsx`, `mark-drawing-match.spec.ts`, `mo-print-*.spec.ts`, `drawings.controller.spec.ts`) and code review. The customer-view item is the one with the highest blast radius if a live rendering bug exists (customer-facing data exposure surface), though the service-layer logic for it was spot-checked independently in this review (see "Independent verification" below) and matches the DTO/service code.
- **severity:** Medium
- **evidence:** tester summary row 13: `"Not live-checked | WO Visual Rev n in a browser; MO print stamp in a real print; customer login (no local customer owns a project with drawings). These are covered by unit tests and code review only. | ⚠ gap"`. Ledger: `"Task 8 live check ... Customer current-rev view NOT live-checked (no local customer user owns a project with drawings) — covered by service + controller code review only."`
- **fix_route:** tester — run the 3 remaining live checks (a local customer-role user can be created for this; WO Visual + MO print just need a mark with >1 rev in a WO). Can be done on staging after merge if a local customer fixture isn't convenient, but should happen before main promotion given the customer-facing surface.

## QA-02 — No raw per-feature test-script report; feature qualifies for one per CLAUDE.md §6 and none exists

- **where:** `docs/test-scripts/` (no `drawing-revision/` folder); `bdt-app/CLAUDE.md` §6 ("Test skills: ... Create one whenever a feature returns computed/diffed data, parses files, or takes >5 min to test manually.")
- **what:** This feature parses filenames (`parseDrawingFileName`), computes a diffed/derived "current" set (`currentRevRows`), and transforms uploaded files (A3 normalise) — squarely the CLAUDE.md criteria for a dedicated `.claude/commands/test-<feature>.md` + `docs/test-scripts/<feature>/*-test-report-*.md`. The tester's wiki summary (`wiki/tech/testing/per-feature/drawing-revision.md`) is thorough and is the primary QA artifact per the role card, but it is not a substitute for the raw dated test-report file the checklist (item 4) also asks for, and none was produced for this feature.
- **severity:** Medium (per role card checklist: "Medium if wiki summary OK" — wiki summary is OK here)
- **evidence:** `find docs/test-scripts -iname "*drawing*"` → no match.
- **fix_route:** tester — either generate the dated test-report file from the same evidence already in the wiki summary, or, if the team has decided the wiki summary now supersedes the raw-report convention for subagent-driven features, say so explicitly in the wiki summary (currently silent on this).

## QA-03 — Backend coverage artifact is stale (2026-09-15), not regenerated for this branch's changed files

- **where:** `backend/coverage/coverage-summary.json` (mtime 2026-09-15)
- **what:** Role-card checklist item 5 asks for backend coverage on changed files (90% services / 80% controllers). The only coverage artifact on disk predates this entire branch by five weeks, so it says nothing about `drawings.service.ts`, `drawings.controller.ts`, `create-drawing.dto.ts`, `a3-normalize.ts`, `current-rev.ts`, or `file-key.ts`. The tester summary reports pass/fail test *counts* (frontend 436/436, backend 84/88 with 4 pre-existing-failure suites) but no coverage percentage for the new code. This review did not re-run `jest --coverage` itself (anti-pattern #2 — re-running tests is tester's/CI's job), so the gap is in the available artifact, not a claim that coverage is actually low.
- **severity:** Medium
- **evidence:** `ls -la backend/coverage/coverage-summary.json` → `Sep 15 11:33`. No coverage percentages appear anywhere in the tester summary or the ledger.
- **fix_route:** tester — regenerate `coverage-summary.json` from this branch's `jest` run and report lines/branches % for the 6 changed/created drawings files in the wiki summary.

## QA-04 — Impl plan's explicit pre-PR Supabase read-only re-check not evidenced as repeated

- **where:** `drawing-revision-impl-plan.md` Task 8 ("Before the PR: re-run the Task 2 Step 5 read-only check on Supabase. A staging merge auto-migrates the shared DB."); `drawing-revision-plan.md` "Backfill of existing rows" section (same instruction)
- **what:** The execution ledger logs exactly one live Supabase read-only check, during Task 2 ("Task 2 step 5 (controller, Supabase read-only 2026-10-20): 278 rows, 46 pdf; 0 null mark / 0 null rev..."). Both the spec and the plan separately call for this check to be re-run immediately before the PR is opened, specifically to catch any filenames uploaded to the live (shared) Supabase between the original check and ship — the ledger's later entries (fix waves, Task 10, Task 11, trailer normalisation, final suites) don't show a second Supabase query. The migration itself is additive/non-destructive (nullable columns + an `UPDATE`, no `DROP`), so this is not a data-loss risk, but it is a real, named gate in this project's own "check data before destructive/shared-DB migration" convention that appears not to have been re-run.
- **severity:** Medium
- **evidence:** Ledger has one `execute_sql`-style Supabase read line (Task 2), none after. Both wiki docs independently name this as a required pre-PR step, not a one-time Task-2-only step.
- **fix_route:** data — re-run the read-only regex check from Task 2 Step 5 against current live Supabase `drawing` rows (0 null mark / 0 null rev expected on `.pdf` rows) right before the PR is opened, per both the spec and the plan.

## QA-05 — No CI run exists for this branch (expected — branch not yet pushed)

- **where:** `dev-t-drawing-revision` (local only)
- **what:** Per this project's own `/release-gate` flow (`CLAUDE.md` §5.2: user asks to commit/push → gate runs → devops pushes only after qa+security clear), the branch is pushed *after* this review, not before — so "no CI run" is the expected state at this point in the pipeline, not a red CI. Confirmed no `origin/dev-t-drawing-revision` exists and `gh run list --branch dev-t-drawing-revision` returns nothing. Same pattern as `docs/qa/sign-offs/2026-10-16-schema-cleanup.md` F4 and `docs/qa/findings/2026-09-14-drawing.md` QA-04.
- **severity:** Low/Info — expected at this stage, not a defect.
- **evidence:** `git branch -r` — no match. `gh run list --limit 5 --branch dev-t-drawing-revision` — empty.
- **fix_route:** devops — once qa/security clear and the user approves, push so CI runs before merge into `dev`.

## QA-06 — Manual test evidence from the product owner is a brief overall approval, not an itemized scenario list

- **where:** Task framing: "Tao personally tested on local dev and said 'ok เรียบร้อยดี' (2026-10-20)."
- **what:** Role-card anti-pattern #1 asks for a screenshot or scenario list from the user, not "trust me." Tao's own evidence here is a short overall approval rather than a per-scenario checklist. In this case it is substantially backstopped by the controller's own detailed Playwright live-check log in the ledger (upload → review-table classification → rev dropdown → delete-fallback → re-upload-replace → A3 output), which covers most of the same ground a user scenario list would. Same handling precedent as `docs/qa/sign-offs/2026-10-16-schema-cleanup.md` (QA F4, accepted as Low on a similarly brief "merge ขึ้นได้เลย").
- **severity:** Low/Info
- **evidence:** Task input text; ledger's Task 8 live-check entry (see QA-01 evidence).
- **fix_route:** none required — noted for the audit trail.

## QA-07 — Pre-existing/deferred items, correctly disclosed and out of scope for this PR

- **where:** `drawing-revision-plan.md` "Known open items"; ledger "Task 11: OPEN (pre-existing, Important, out of scope)"
- **what:** (a) `POST /file-storage/presigned-upload` signs any key for any JWT user — pre-existing, predates this branch, not worsened by it (this branch's own upload path now uses a disposable staging key + server-side rebuild specifically to avoid depending on that endpoint's safety). (b) `_incoming` staging objects are orphaned on an early 400 (no sweep/lifecycle rule yet). (c) The post-main re-backfill migration (Task 9 remainder) is correctly gated on main's deploy and cannot run yet. None of these were introduced by this branch, and all three are already named in the spec/ledger rather than silently left out — consistent with this project's "don't mix unrelated fixes" convention.
- **severity:** Low/Info
- **evidence:** spec "Known open items" list; ledger Task 11 final lines.
- **fix_route:** (a)/(b) devops — track as a GCS lifecycle rule / presigned-upload hardening follow-up; (c) data — execute per plan Task 9 once main is confirmed live on the phase-1 backend.

## Independent verification performed in this pass (not findings — confirms claims accurate)

- `git log --oneline 58ad7e3..HEAD` — 22 commits, all `[S39] ...`, matches the ledger's task-by-task commit trail (trailer-rewritten HEAD `c548594`, ledger's `f3a1db7` is pre-the-last-3-UI-polish-commits).
- `backend/prisma/migrations/20261020100000_drawing_mark_rev/migration.sql` read in full: additive only (`ADD COLUMN mark/rev`, `ALTER COLUMN version DROP NOT NULL`, one `CREATE INDEX`, a backfill `UPDATE` using the regex twin of `src/lib/drawingFileName.ts`) — no `DROP`, no new `NOT NULL`. Matches the spec's "additive migration" claim; safe for the shared Supabase given an old backend is still running.
- `backend/src/modules/drawings/dto/create-drawing.dto.ts` read in full: `mark`/`rev`/`version` (back per Task 10, `@IsInt() @Min(1)`) all present; `upload_key` matches the staging-key pattern `drawings/_incoming/<project_code>/<uuid>/<file>` (Task 11's fix-round redesign), not a client-supplied final key; `mark` and `file_name` both reject `.`/`..` and `/`/`\` segments — matches Ruling 12/13 in the ledger (security findings folded into Task 11).
- `backend/src/modules/drawings/drawings.service.ts` read in full: `create()` validates upload-key ownership (project/zone/sub-zone cross-check) and a server-rebuilt `finalKey` with its own traversal/prefix check *before* touching storage; a bad PDF deletes only the staging object and throws 400, never touching an existing drawing — matches the ledger's "bad PDF never touches an existing drawing" claim. `findByZone(..., { currentOnly })` omits the `uploaded_by` include entirely for customers (not just hides it client-side) — matches Ruling 9's fix. `isCustomerUser()` reads `res_users.user_type`, not the JWT role claim — matches the spec's stated gate.
- `git diff 58ad7e3..HEAD --stat` for `backend/src/modules/drawings` and `src/{api,hooks,lib,components,pages}` — file list matches the plan's Task 1–7/10/11 "Files" sections (new `a3-normalize.ts`, `current-rev.ts`, `file-key.ts`, `drawingFileName.ts`, `drawingMarkRows.ts`, `drawingUploadReview.ts`, `markDrawingRevs.ts`; `markDrawingVersions.ts` removed as planned).
- Wiki diff (`~/Documents/bdt/knowledge-base`, separate git repo): `git status --short` shows `wiki/features/drawing.md`, `wiki/index.md`, `wiki/tech/backend/api.md`, `wiki/tech/data-model.md` modified, plus new `wiki/features/drawing-revision-plan.md`, `wiki/features/drawing-revision-impl-plan.md`, `wiki/tech/testing/per-feature/drawing-revision.md` — non-empty diff for every area this feature touches (role-card checklist item 7 clear, no finding).
- `gh run list --limit 5 --branch dev-t-drawing-revision` → empty (see QA-05). No `docs/security/findings/2026-10-20-drawing-revision.md` on disk yet. No Playwright/E2E suite configured in this repo (`find . -iname "*playwright*"` → nothing outside `node_modules`), so checklist item 9 (smoke test) is N/A, consistent with prior sign-offs in this repo.

## Verdict

**WARN** — 4 Medium findings (QA-01..QA-04), 3 Low/Info (QA-05..QA-07), zero Critical/High. All Medium findings are evidence/process gaps (an unfinished live-check pass, a missing dated test-report artifact, a stale coverage file, an unrepeated pre-PR Supabase check) — none is a known implementation defect, and this review's own spot-check of the actual DTO/service code found the security-relevant behavior (staging-key upload flow, traversal guards, customer data gating) correctly implemented and consistent with the ledger's fix history. Per role card, WARN requires explicit user confirmation before this ships.
