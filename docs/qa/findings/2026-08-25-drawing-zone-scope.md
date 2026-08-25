# QA Findings — Drawing Zone-Scope Rescope

- **feature:** Drawing (re-scoped Project → Zone required + Sub-zone optional)
- **branch:** `dev-t-drawing-zone-scope` (4 commits on `origin/main`: `0911033`, `a29f512`, `088d755`, `26c24da`)
- **date:** 2026-08-25
- **reviewer:** qa (this run — self-spec mode, no Notion task; DoD substituted from `wiki/features/drawing-zone-scope-plan.md`'s "Confirmed decisions" + "Architecture" sections)
- **scope of this review:** QA lens only (release-readiness / DoD-coverage / doc-alignment). Does not repeat the 4 task-level + 1 whole-branch code-quality reviews already performed and approved (0 Critical/Important, 3 Minor non-blocking). Security review is a separate parallel track not covered here.

## QA-01 — Manual test evidence is implementer-reported, not user-confirmed

- **where:** `wiki/tech/testing/per-feature/drawing.md` § "Smoke test (E2E · conditional)"
- **what:** The cited manual test evidence ("full flow project→zone→sub-zone→upload→download→delete, independent per-zone version counters, sub-zone bucketing, 0 console errors, network responses 201/200/200") comes from Task 4's implementer subagent's own report of an in-session Playwright MCP run, not from a human user watching/confirming the flow (no chat evidence, no screenshot, no Notion completion note from the user). `qa.md`'s anti-pattern #1 is explicit: "'Trust me' not acceptable — require screenshot or scenario list from user."
- **severity:** Medium
- **evidence:** Quote from wiki summary: *"Last run: 2026-08-25, by Task 4's implementer against local dev (frontend :5173, backend :3000) — full flow ... 0 console errors during the test session, network responses confirmed (201/200/200), test data cleaned up afterward."* This is a genuine scenario list with checkable specifics (not vague), and several of the surrounding claims in the same document were independently re-verified accurate during this QA pass (see QA sign-off `checks_performed` #3) — which raises credibility but does not substitute for user-side confirmation. No independent artifact (screenshot, HAR file, recorded trace) exists to check.
- **fix_route:** user — either confirm in chat/Notion that this flow was personally reviewed/re-run before merge, or do a quick manual click-through (project → zone → sub-zone → upload → download → delete) and report back. Alternatively route to `tester` to re-run with screenshots attached for the audit trail.

## QA-02 — No Notion task existed for this SDD run (self-spec mode)

- **where:** This feature's entire lifecycle (spec → implementation → docs) — no Notion Task/Feature page filed before or during execution.
- **what:** Work was executed directly from an approved wiki spec (`drawing-zone-scope-plan.md`) via `superpowers:subagent-driven-development`, bypassing the normal Notion-task-first flow this project otherwise follows. `qa.md` Step 1 ("Notion DoD check") could not be performed as written; substituted with the spec's "Confirmed decisions"/"Architecture" sections per this run's explicit instructions.
- **severity:** Low (informational — per explicit instruction, not auto-BLOCKed; content quality judged on its own merits below and found accurate)
- **evidence:** No Notion page reference anywhere in `drawing-zone-scope-plan.md`, the wiki test summary, or the 4 commit messages. Contrast with the prior `2026-08-24-drawing-gcs-dxf.md` sign-off, which explicitly notes a retroactive Notion task was created for that release.
- **fix_route:** pm/notion-mirror — file a Notion Feature + Task retroactively (matching the `2026-08-24-drawing-gcs-dxf.md` precedent) so this shipped work is discoverable from the sprint board, not just the wiki.

## QA-03 — Wiki test summary self-authored by controller, not a dedicated `tester` subagent

- **where:** `wiki/tech/testing/per-feature/drawing.md` (frontmatter: *"self-spec mode ... controller wrote it directly since no tester subagent ran this cycle"*)
- **what:** `qa.md`'s model assumes `tester` produces this artifact and `qa` independently audits it — a separation of duties. Here the same agent that ran the implementation also wrote its own test summary, removing that separation for this cycle.
- **severity:** Low — content quality was independently checked in this QA pass and found accurate (not just internally consistent): the claimed 12/12 `drawings.service.spec.ts` tests were re-run and passed identically; the DoD coverage map's migration-SQL claim was byte-matched against the actual `20260825152234_add_zone_scope_to_drawing/migration.sql`; the "606/623 passing, 17 pre-existing failures in `template-binding`/`bom-matching`/`cycle-time`/`project-progress`" regression claim was reproduced exactly, including re-running those same 4 suites against a fresh `origin/main` worktree (identical 17 failures, confirming pre-existing and not a regression from this branch).
- **evidence:** Wiki summary frontmatter self-discloses the deviation; independent re-verification (this session) found zero discrepancies against the claims.
- **fix_route:** none required to ship. Process note for future cycles — use the `tester` subagent when available, per standing convention.

## QA-04 — Controller and simple query-DTO unit coverage is 0%, below `qa.md`'s 80%/100% targets

- **where:** `backend/src/modules/drawings/drawings.controller.ts`, `dto/query-drawing.dto.ts`, `dto/query-latest-drawing-version.dto.ts`
- **what:** `npx jest drawings.service.spec.ts --coverage --collectCoverageFrom='modules/drawings/**/*.ts'` shows `drawings.service.ts` at 100% (exceeds the 90% service target) and `create-drawing.dto.ts` at 100% (meets the 100% DTO target, this is the one with actual regex logic), but `drawings.controller.ts` and the two simple decorator-only query DTOs show 0% — below the 80%/100% targets on paper.
- **severity:** Low — this is a pre-existing, codebase-wide convention, not something newly introduced by this branch: `find src/modules -name "*.controller.spec.ts"` returns **zero** results across all 38 controllers in the backend. The two 0% query DTOs contain no custom logic beyond `class-validator` decorators (unlike `create-drawing.dto.ts`'s custom `file_key` regex, which *is* tested); they're exercised at runtime via `ValidationPipe`, not unit-tested in isolation, matching the pattern for every other simple query DTO in this codebase.
- **evidence:** Coverage run output (`drawings.controller.ts | 0 | 0 | 0 | 0 | 1-39`); `find src/modules -name "*.controller.spec.ts" | wc -l` → `0` out of 38 `*.controller.ts` files.
- **fix_route:** none required to ship (matches established codebase convention). If the team wants to raise the bar, route to `backend` as a separate cross-cutting initiative — not specific to this feature.

## QA-05 — Task 5 (staging GCS cleanup) correctly deferred, not a blocker

- **where:** `drawing-zone-scope-plan.md` Task 5; wiki summary "Known gaps / TBD"
- **what:** ~675 now-orphaned GCS objects under the old `drawings/<project_code>/v<version>/<filename>` key shape remain in `bdt-file-storage-staging` until this migration deploys to staging and a human-confirmed cleanup step runs.
- **severity:** Info — correctly sequenced (cleanup cannot run before the migration that empties the `drawing` table actually deploys) and consistently flagged everywhere it's referenced (plan status line, migration comment, wiki decision entry, test summary). Not a release blocker for merging this branch.
- **evidence:** Plan file top-of-doc status line: *"Task 5 (staging GCS cleanup) is still pending — it needs this branch's migration to actually deploy to staging first."*
- **fix_route:** devops — track as an immediate post-merge follow-up once this branch reaches staging.

## QA-06 — CI status could not be checked (branch not yet pushed)

- **where:** `dev-t-drawing-zone-scope` (local only)
- **what:** `git ls-remote --heads origin dev-t-drawing-zone-scope` returns empty — the branch has never been pushed to `origin`, so `gh run list --branch dev-t-drawing-zone-scope --limit 5` correctly returns no runs. There is no CI signal to read, red or green.
- **severity:** Info — not treated as a red-CI BLOCK per this run's explicit instructions. `gh` itself is available and authenticated (`gh auth status` confirmed), so this is a "not yet run" state, not a tooling failure.
- **evidence:** `git remote -v` → `origin  https://github.com/RuthW-Ssi/bdt-engineering-system.git`; `git ls-remote --heads origin dev-t-drawing-zone-scope` → empty; `gh run list --branch dev-t-drawing-zone-scope --limit 5` → empty.
- **fix_route:** devops — push the branch as part of the normal `/release-gate` commit/push step; CI will run at that point and should be checked again before promotion past `dev`.

## Independent verification performed in this pass (not findings — confirms DoD coverage map accuracy)

- Re-ran `cd backend && npx jest drawings.service.spec.ts` → 12/12 passing, matches wiki claim exactly.
- Re-ran `cd backend && npx jest` (full suite) → 606 passed / 17 failed / 623 total, matches wiki claim exactly; failing suites are exactly `template-binding.service.spec.ts`, `bom-matching.service.spec.ts`, `cycle-time.service.spec.ts`, `project-progress.service.spec.ts`.
- Reproduced the same 4 suites in an isolated `git worktree` of `origin/main` (no branch changes applied) — identical 17/72 failures, confirming these are pre-existing and not a regression introduced by this branch.
- `npx tsc --noEmit` (backend) and `npx tsc -p tsconfig.app.json --noEmit` (frontend) both clean.
- Diffed `backend/prisma/schema.prisma`, the migration SQL, all 3 DTOs, `drawings.service.ts`, `drawings.controller.ts`, `src/api/drawings.ts`, `src/components/drawings/DrawingUploadModal.tsx` against the plan's "Architecture" section and Task 1-4 code blocks — byte-for-byte match on every checked claim (FK referential actions `RESTRICT`/`SET NULL`, `DELETE FROM "drawing"` not `TRUNCATE`, GCS key format, `zone_id` required/`sub_zone_id` optional shape throughout).
- Confirmed `wiki/features/drawing.md`, `wiki/tech/backend/api.md`, `wiki/tech/data-model.md`, `wiki/tech/backend/decisions.md` were all substantively and accurately updated in knowledge-base commit `496366a`, consistent with the actual code diff.
