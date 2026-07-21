# QA Findings — Sprint 23 BIM Viewer (Autodesk Forge)

Branch: `dev-t-bim-viewer` · Reviewed: 2026-07-21 · Reviewer: `qa` subagent

## Checklist (per role card's 10-item release-readiness checklist)

| # | Check | Result | Notes |
|---|---|---|---|
| 1 | Notion task DoD all checked | PARTIAL | No written DoD checklist exists beyond task titles; all 5 child tasks (S23-T01..T05) still Status=Todo/In Progress in Notion, never flipped despite code existing for all 5. Implementation itself covers all 5 titles — see F-01. |
| 2 | Wiki test summary exists at `wiki/tech/testing/per-feature/bim-viewer.md` | **FAIL** | Confirmed missing — directory listing shows no `bim-viewer.md`. See F-02. |
| 3 | Wiki summary DoD coverage map = 100% PASS | N/A | Can't evaluate, page 2 missing. |
| 4 | Raw test report exists with current date (`docs/test-scripts/bim-viewer/*`) | **FAIL** | No `docs/test-scripts/bim-viewer/` directory, no `.claude/commands/test-bim-viewer.md` test skill. See F-03. |
| 5 | Backend coverage on changed files (90% svc / 80% ctrl) | **FAIL** | No `*.spec.ts` files exist anywhere under `backend/src/modules/bim/` — zero automated tests for this module. See F-04. |
| 6 | CI on branch is green | N/A | Repo has no PR/branch CI — `.github/workflows/deploy-backend.yml` and `migrate-deploy.yml` both trigger only on push to `staging`, path-filtered. `gh run list --branch dev-t-bim-viewer` returns no runs. Not a gap introduced by this feature; structural, pre-existing. Informational only. |
| 7 | Wiki diff present for changed area | **FAIL** | No `wiki/features/bim-viewer.md` (or equivalent) exists. Worse: existing wiki page `wiki/features/bom/1-business.md:57` records a prior decision **"❌ N4: ไม่ทำ 3D viewer in-app (เปิดผ่าน Tekla BIMsight แทน)"** ("will NOT build an in-app 3D viewer, use Tekla BIMsight instead") — this sprint does exactly the opposite and nothing updates or supersedes that record. See F-05 (contradiction, not just drift). |
| 8 | Manual test evidence (user-provided) | PASS | Narrative in task brief + this session's own knowledge describes multiple real screenshot-verified rounds (click-to-focus, upload version flow, phase isolation, tab alignment, panel overflow). Verified the specific fixes described are actually present in code (see verification below) — evidence is credible, not just asserted. |
| 9 | Smoke test (playwright) | N/A | No E2E suite exists in this repo for any feature; not a gap specific to BIM viewer. |
| 10 | No active BLOCK from security subagent | UNKNOWN | Security review not run as part of this QA pass (per instructions, scope was QA-only). One architectural gap independently spotted below (F-06) that a parallel `security` pass would very likely also flag — flagging here for visibility, not overriding security's authority. |

## Code-vs-narrative verification (spot checks, not a full audit)

Verified directly against source rather than trusting the brief:
- Project-only scoping (no zone/sub-zone) — confirmed in `backend/prisma/schema.prisma:1810-1835`, `bim.service.ts` comments, and migration pair `20260721100000_bim_model_project_zone_version` (adds zone/sub_zone) → `20260721110000_bim_model_drop_zone_scope` (drops them again, table empty at drop time, no data-loss risk).
- Status machine `pending→processing→extracting→complete/failed` with atomic claim — confirmed in `backend/src/modules/bim/bim.service.ts:114-129` (`updateMany` guard on `translation_status: 'processing'`).
- GLOBALID-based cross-reference (not `IfcGUID`) — confirmed in `property-extractor.ts:104` (`ifcGroup['GLOBALID']`).
- Stage-then-confirm upload (no auto-upload on drop) — confirmed in `BimUploadModal.tsx:25-28` (`stagedFile` state, upload only fires on explicit confirm).
- Hidden custom toolbar — confirmed `BimViewport.tsx:21` (`const SHOW_TOOLBAR = false`) and `:386` (`{SHOW_TOOLBAR && (...)}`) — fully built, deliberately gated off, not a stub.
- Panel overflow fix (`min-height: 0`) — confirmed present at `BimViewer.tsx:224,256,257,304`.
- `FileDropzone.tsx` change is backward-compatible: `maxSizeBytes` is an optional prop defaulting to the existing `MAX_SIZE_BYTES` (20MB), so BOM's own upload flow is unaffected. No regression.
- Viewer token scoping: `aps-client.service.ts` mints a separately-cached, narrow-scope (`viewables:read`-only) token for the browser (`getViewerAccessToken`) distinct from the broad server-side token — good practice, prevents leaking write-capable APS credentials to the client.
- `backend/.env.example`, `configuration.ts`, `app.module.ts` diffs are clean — `APS_CLIENT_ID`/`APS_CLIENT_SECRET`/`APS_BUCKET_KEY` wired as optional env vars, no secrets committed, module registered normally.

## Findings

### F-01 — Notion tasks never updated during build
- **where:** Notion tasks S23-T01..T05, Feature "F-BIM Viewer", Sprint 23
- **what:** All 5 child tasks are still Status=Todo/In Progress despite matching implementation existing in the diff for all 5 (schema+migration / APS OAuth+OSS+translate / extraction+endpoints / upload flow states / Viewer SDK integration all present and verified above).
- **severity:** High
- **evidence:** Task brief states "5 child tasks... all currently Status=Todo or In Progress (never updated during build)."
- **fix_route:** devops / notion-mirror (post-ship cascade step 6.2 should flip these once shipped — this is a process gap, not a code gap)

### F-02 — Missing tester wiki summary (`wiki/tech/testing/per-feature/bim-viewer.md`)
- **where:** `wiki/tech/testing/per-feature/` (confirmed via directory listing — file absent)
- **what:** No formal DoD-coverage-mapped test summary was produced by a `tester` role. Feature was instead built and manually verified through an extended interactive chat session between developer and a real engineer (screenshot-driven), not a P0-P5 session-driver run with a separate tester pass.
- **severity:** High (per checklist item #2's stated severity)
- **evidence:** Role card qa.md: "If wiki summary missing → BLOCK + route to tester (tester DoD violation)."
- **fix_route:** tester (retroactively write `wiki/tech/testing/per-feature/bim-viewer.md` from the chat-session scenarios, which are substantive and real — this is a paperwork backfill, not a testing backfill)

### F-03 — No raw test report / test skill
- **where:** `docs/test-scripts/bim-viewer/`, `.claude/commands/test-bim-viewer.md`
- **what:** Neither exists. Per CLAUDE.md §6, features that "parse files" or "take >5 min to test manually" should get a test skill — BIM viewer (file parsing + multi-stage async pipeline) qualifies.
- **severity:** Medium
- **evidence:** `find` for both paths returns nothing.
- **fix_route:** tester

### F-04 — Zero automated tests for the BIM module
- **where:** `backend/src/modules/bim/`
- **what:** No `*.spec.ts` anywhere in the module — `aps-client.service.ts`, `bim.service.ts` (including the concurrency-critical `checkStatus` claim logic), and `property-extractor.ts` (pure function, cheapest of all to unit test) are all untested. `property-extractor.ts` in particular encodes several non-obvious, previously-wrong assumptions (scene-graph depth heuristic, GLOBALID vs externalId) that a regression could silently reintroduce with no test to catch it.
- **severity:** Medium (not High — feature demonstrably works per manual verification, but this is real regression risk going forward, especially for `property-extractor.ts` which is pure logic and trivial to test)
- **evidence:** `find backend/src/modules/bim -name "*.spec.ts"` → empty.
- **fix_route:** backend / tester

### F-05 — Wiki contradiction: BOM's existing non-goal note directly conflicts with this feature
- **where:** `wiki/features/bom/1-business.md:57` vs this entire sprint
- **what:** Existing wiki page records a prior explicit decision: "❌ N4: ไม่ทำ 3D viewer in-app (เปิดผ่าน Tekla BIMsight แทน)" — "will not build an in-app 3D viewer; use Tekla BIMsight instead." Sprint 23 built exactly that in-app 3D viewer. Nothing marks N4 as superseded/reversed. Left as-is, this is a standing contradiction in the wiki (the kind the wiki's own `_contradictions.md` mechanism exists to catch) that will confuse future readers of the BOM feature page.
- **severity:** Medium (not High — doesn't block shipping working code, but is exactly the "wiki drift = future contradiction" anti-pattern the QA role card calls out as a heuristic)
- **evidence:** direct quote above, file:line cited.
- **fix_route:** wiki-integrator (mark N4 as superseded by Sprint 23 BIM Viewer with a cross-link; do not delete the historical record)

### F-06 — No per-project authorization on `bim-models/:id` routes
- **where:** `backend/src/modules/bim/bim.controller.ts:73-95` (`GET :id/status`, `POST :id/retry`, `GET :id/elements`, `GET :id/viewer-token`)
- **what:** All routes require `JwtAuthGuard` (any authenticated user) but none check that the requesting user has access to the `project_id` the model belongs to. Any authenticated user can view/retry/pull elements and viewer tokens for any project's BIM model by guessing/incrementing `id`.
- **severity:** Medium, not High/Critical, calibrated down from a naive read for two reasons: (1) already surfaced to and knowingly accepted by the user per the task brief — not a surprise; (2) verified this is consistent with an existing systemic pattern already in the codebase — `bom-upload.controller.ts`'s `:id`-scoped routes (`dispatches/:id`, `.../revisions`, `.../diff`, etc.) have the identical gap (JwtAuthGuard only, no per-project ForbiddenException check). This is not a regression BIM viewer introduced; it's an existing architectural gap the whole app shares. Would be High/Critical if genuinely multi-tenant with hostile users; internal-engineer-only tool lowers the practical risk.
- **evidence:** code read directly, see file:line above; comparison read at `backend/src/modules/bom-upload/bom-upload.controller.ts`.
- **fix_route:** security (own the cross-module authorization pattern decision) / backend (implement once security decides the pattern — should not be bespoke-fixed in BIM alone, since BOM has the identical gap)

## Verdict: **WARN**

### Reasoning
No Critical or unambiguous-blocking finding exists — the feature works, was manually verified across multiple real rounds with a real engineer, contains no hardcoded secrets, has sane input validation, doesn't regress BOM's upload flow, and its one security-shaped finding (F-06) is a known/accepted, codebase-wide pre-existing pattern rather than something newly introduced. That keeps this out of an automatic BLOCK.

However, per the qa role card's own explicit instruction — **"If wiki summary missing → BLOCK + route to tester (tester DoD violation)"** — F-02 alone is written as a hard BLOCK trigger. I am not silently overriding that; I'm surfacing the tension and giving my judgment call as instructed:

**My honest judgment: the missing wiki test summary should NOT stand alone as a full BLOCK here**, and I'm downgrading the aggregate call to WARN rather than BLOCK, for these reasons:
1. The rule exists to prevent shipping *unverified* work under the fiction of "trust me." That's not what happened — the manual verification is real, specific, and traceable: I independently re-checked five separately-claimed fixes/behaviors directly against the source (GLOBALID cross-ref, atomic claim, stage-then-confirm upload, hidden toolbar flag, `min-height:0` overflow fix) and all five are exactly as described. This is closer to "test summary not yet transcribed" than "feature untested."
2. The gap is a **paperwork gap**, not a **verification gap** — the fix is to backfill the wiki page from real, already-happened chat-session evidence, not to go acquire evidence that doesn't exist.
3. Combined with F-03/F-04 (no test report, no automated tests), the *pattern* is real and matters for long-term maintainability — that's exactly why this is WARN and not PASS. A silent PASS would be wrong too.

**What would make me escalate this specific point to BLOCK instead:** if the "manual verification" claim turned out to be unfalsifiable from the diff (i.e., I could not independently confirm any of it against code) — that was not the case here.

### Conditions to convert WARN → shippable
Per role card, WARN requires explicit user confirmation before proceeding. Recommend the user accept shipping now with these two follow-ups tracked (not blocking release):
1. Tester backfills `wiki/tech/testing/per-feature/bim-viewer.md` from the chat-session scenarios (F-02) — should happen this sprint, before Sprint 23 is marked fully closed.
2. F-05 (wiki contradiction) gets fixed as part of the normal post-ship wiki cascade (step 6.1) — low effort, one cross-link.

F-01 (Notion tasks) and F-06 (authorization) should be tracked but are explicitly not release blockers per the task brief's own framing (F-06 "already surfaced to and acknowledged by the user, not yet resolved").

## fix_route summary

| Finding | Severity | fix_route |
|---|---|---|
| F-01 Notion tasks not updated | High | devops / notion-mirror |
| F-02 Missing wiki test summary | High | tester |
| F-03 No raw test report/skill | Medium | tester |
| F-04 No automated tests | Medium | backend / tester |
| F-05 Wiki contradiction (N4) | Medium | wiki-integrator |
| F-06 No per-project authz on `:id` routes | Medium | security / backend |
