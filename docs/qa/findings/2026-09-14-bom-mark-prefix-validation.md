# QA Findings — BOM Upload: Reject Unknown Mark Prefixes

> **QA-01 (the blocking finding) fixed same session** — `findMissingMarkPrefixes`
> now mirrors `enforceStandardIntegrity`'s post-commit demotion decision
> pre-transaction, with 4 new regression tests. QA-02/03/04/05 accepted as-is.
> See `docs/qa/sign-offs/2026-09-14-bom-mark-prefix-validation.md` for the
> final PASS decision.

- **task:** none found in Notion (searched workspace: "mark prefix validation",
  "reject unknown mark prefix BOM upload", "Sprint 35" — no matching task/feature
  page exists). Feature was fast-tracked directly to `/release-gate` without a
  prior Notion task, per this session's explicit user request.
- **feature:** BOM upload — reject unknown mark prefixes (no Notion page)
- **sprint:** unclear — not tracked in Notion; commits reference no sprint tag yet
- **branch:** `dev-t-bom-mark-prefix-validation` (uncommitted working tree at review time — 4 files modified, not yet committed)
- **diff base:** `dev`
- **reviewer:** qa (release-readiness, review-only)
- **date:** 2026-09-14

## Scope reviewed

`git diff dev -- backend/src/modules/bom-upload/` (242 lines, 4 files), read in full:
- `bom-matching.service.ts` — new `findMissingMarkPrefixes(tx, assemblies)`;
  removed the blind `mark_prefix_master.upsert()` from `autoCreateCustomProducts()`;
  exported `parseAssemblyMark`
- `bom-upload.service.ts` — `upload()` calls `findMissingMarkPrefixes()` as
  step "4b", right after the existing "Missing NC files" check, before file
  storage I/O and the DB transaction; throws `BadRequestException` listing
  every missing prefix
- `bom-matching.service.spec.ts` — 5 new unit tests for `findMissingMarkPrefixes`
- `bom-upload.service.spec.ts` — 3 new unit tests for the reject/proceed paths

## Findings

### QA-01 — `findMissingMarkPrefixes` does not cover assemblies demoted from MATCHED_STANDARD after the transaction commits, letting an unchecked `mark_prefix` through the very gate this feature adds

- **where:** `backend/src/modules/bom-upload/bom-matching.service.ts` —
  `findMissingMarkPrefixes` (lines ~94–128, specifically the `standardNames`
  exclusion at line ~109–113) vs. `enforceStandardIntegrity` (lines ~228–244)
  vs. `autoCreateCustomProducts` (lines ~134–224, specifically the unconditional
  `parseAssemblyMark(asm.assembly_mark)` at line ~178 with no product_library check)
- **what:** `findMissingMarkPrefixes` excludes any assembly whose `name`
  matches an existing **standard** product from prefix validation entirely —
  correct in isolation, since a genuinely-standard-matched assembly never gets
  a custom `mark_prefix` assigned. But `matchAssemblies` (run post-commit, same
  pipeline) can mark an assembly `MATCHED_STANDARD` by name alone, and
  `enforceStandardIntegrity` (run immediately after, still post-commit) then
  **demotes** that same assembly back to `match_status = NULL` if even one of
  its linked parts isn't itself `MATCHED_STANDARD`. A demoted assembly then
  flows into `autoCreateCustomProducts()`, which unconditionally computes its
  `mark_prefix` via `parseAssemblyMark(asm.assembly_mark)` and writes a new
  `products` row with that prefix — **with no check against `product_library`
  at all**, because `findMissingMarkPrefixes` never evaluated this assembly's
  prefix (it was excluded up front by the name-match short-circuit).
  This reproduces, for this specific sub-case, the exact defect class the
  feature exists to close: a custom product created with a `mark_prefix` that
  has no curated Product Library entry, and whose `library_id` (from the
  separate name-match lookup in `autoCreateCustomProducts`) can diverge from
  that unchecked prefix — the same "two independent lookups, nothing ties them
  together" root cause described for the original bug.
  Both the code comment above `findMissingMarkPrefixes` ("this replaces it")
  and the new wiki section both assert an unqualified guarantee — "now
  unreachable/redundant, since every prefix that reaches that method is
  guaranteed already registered" (`bom-matching.service.ts` comment,
  `wiki/features/bom.md` line 431) — that this trace shows is **not actually
  true** for the demoted-standard-match path. This isn't flagged or disclosed
  anywhere as an accepted residual risk (unlike the explicitly-disclosed,
  separate "~700 legacy rows untouched" gap in the same wiki section).
  Note: a **naive** fix of dropping the standard-name-match exclusion and
  checking every assembly's prefix unconditionally would be **wrong** — it
  would false-positive-reject uploads for assemblies that genuinely stay
  `MATCHED_STANDARD` (their prefix is irrelevant to that path and commonly
  won't be in `product_library` at all, since matched-standard assemblies
  reference `product_id` directly, never `mark_prefix`). A correct fix needs
  to anticipate which name-matched assemblies will get demoted — i.e. mirror
  `enforceStandardIntegrity`'s "not all linked parts are standard-matched"
  condition using the pre-transaction parsed Assembly Part List / Part List,
  not just the assembly's own name.
- **severity:** High
- **evidence:**
  ```ts
  // bom-matching.service.ts — enforceStandardIntegrity demotes on commit:
  WHERE ba.dispatch_id = ${dispatchId}
    AND ba.match_status = 'MATCHED_STANDARD'
    AND bp.match_status != 'MATCHED_STANDARD'
  ...
  UPDATE bom_assembly SET match_status = NULL, product_id = NULL ...

  // autoCreateCustomProducts picks up ALL match_status:null rows, unchecked:
  const unmatched = await this.prisma.bom_assembly.findMany({
    where: { dispatch_id: dispatchId, match_status: null }, ...
  })
  ...
  const { prefix, number } = parseAssemblyMark(asm.assembly_mark)  // no product_library check
  ```
  Call order confirmed in `bom-upload.service.ts` `upload()`:
  `matchAssemblies` → `matchParts` → `enforceStandardIntegrity` →
  `autoCreateCustomProducts`, all post-`$transaction`-commit.
- **fix_route:** be — either (a) extend `findMissingMarkPrefixes` to also
  simulate `enforceStandardIntegrity`'s demotion using the pre-transaction
  parsed part/junction data, so demoted-to-custom assemblies get their prefix
  checked too, or (b) explicitly accept this as a documented residual risk
  (narrower than the original bug, bounded to "name matches a standard
  product AND at least one part doesn't") and update both the code comment and
  the wiki section to state the real, qualified guarantee instead of an
  absolute one. Either resolves the finding; leaving the false guarantee
  undocumented does not.

### QA-02 — No Notion task/feature tracks this work

- **where:** Notion workspace (searched: "mark prefix validation", "reject
  unknown mark prefix BOM upload", "Sprint 35" — no hit for this feature)
- **what:** No task exists to check DoD against (role-card checklist item 1).
  Feature was implemented and fast-tracked straight to `/release-gate` in one
  session per explicit user request, matching this project's known,
  precedented "Notion tracking gap pattern" (same-day conversational
  follow-ups skipping Notion tracking — already backfilled 3x: Sprint 22,
  29–31, 33).
- **severity:** Medium
- **evidence:** `notion-search` for the terms above returned no matching
  task/feature page; closest hits were unrelated older Mark-Prefix-Master
  infrastructure work (Sprint 12, T-MO.03, etc.) and an unrelated Sprint 35
  ("BIM-First Progress Entry (Pre-BOM Gap)").
- **fix_route:** pm — backfill a Notion task/feature page for this work
  (either before or shortly after shipping, consistent with the established
  backfill precedent); not required to block this specific release.

### QA-03 — No raw test-report file for this increment (checklist item 4)

- **where:** `docs/test-scripts/` — no `bom-mark-prefix-validation` (or
  similar) entry exists; only `bom_upload`, `wo-visual-tab`,
  `drop-sprint4-routing`, `wo-bom-hold` directories present.
- **what:** Per checklist item 4, a raw test-report file with current date is
  expected at `docs/test-scripts/<feature>/*-test-report-*.md`. None exists.
  The wiki test summary (`wiki/tech/testing/per-feature/bom-mark-prefix-validation.md`)
  substitutes reasonably — it contains an equivalent DoD-style pass/fail table
  (8/8 new unit tests) plus a 4-scenario live manual-verification table against
  real project data (curl POST, real JWT, real DB checks) — but this is still a
  literal gap against the checklist as written, matching the same precedented
  pattern QA has flagged before (`wo-visual-tab`, `project-progress-phase-tracking`).
- **severity:** Medium (per role card: "Medium (if wiki summary OK)" — wiki
  summary here is present and good, so the conditional applies, not High)
- **evidence:** `wiki/tech/testing/per-feature/bom-mark-prefix-validation.md`,
  full file (unit-test table + live-verification table).
- **fix_route:** tester — either generate the raw report file, or (as noted
  for `wo-visual-tab`) formally adopt "wiki page = re-run artifact" as a
  documented project convention so this stops recurring as a per-release finding.

### QA-04 — CI has not run on this branch yet

- **where:** repo-wide — `git status` shows 4 files modified, uncommitted;
  `gh pr list --head dev-t-bom-mark-prefix-validation` and
  `gh run list --branch dev-t-bom-mark-prefix-validation` both return empty.
- **what:** Checklist item 6 ("CI on branch is green") cannot be evaluated —
  no CI has run because the branch hasn't been committed or pushed yet. This
  is expected at this pipeline stage: `/release-gate` runs **before** devops
  commit/push per this project's own documented flow (`CLAUDE.md` §5.2), so
  "no CI yet" is not a red-CI failure. As a direct substitute, `pnpm run
  build` (clean) and the targeted jest run (see "Independent re-verification"
  in the sign-off file) were independently re-executed this review and match
  the claimed results exactly.
- **severity:** Low / INFO — not a fail against item 6 (condition not met
  yet, not applicable); recorded for completeness.
- **evidence:** command outputs, see sign-off file.
- **fix_route:** devops — proceed with normal commit/push; full CI (lint,
  Prisma migrate-diff, deploy checks) will run at that point as usual.

### QA-05 — Minor query duplication (maintainability only, not a bug)

- **where:** `backend/src/modules/bom-upload/bom-matching.service.ts` —
  the "does this assembly's name match an active standard product" `$queryRaw`
  block in `findMissingMarkPrefixes` (lines ~102–108) is near-identical to the
  same block in `matchAssemblies` (lines ~28–34).
- **what:** Same SQL/logic duplicated verbatim in two methods on the same
  class. Not a correctness issue — both call sites are internally consistent
  with each other — purely a future-maintenance note (a future change to the
  standard-match definition would need to be applied in both places).
- **severity:** Low / INFO
- **evidence:** side-by-side diff of the two `$queryRaw` blocks, identical
  column list, WHERE clause, and normalize() logic.
- **fix_route:** be (optional, deferred) — extract a small private helper
  (e.g. `findStandardNameMatches(tx, names)`) shared by both call sites.

## Checks performed (role-card checklist)

| # | check | result | note |
|---|---|---|---|
| 1 | Notion task DoD all checked | fail | see QA-02 (Medium) — no task exists to check against |
| 2 | Wiki test summary exists at `wiki/tech/testing/per-feature/bom-mark-prefix-validation.md` | pass | present, dated 2026-09-14 |
| 3 | Wiki summary DoD coverage map = 100% PASS | pass | all 8 rows ✅ in the "2026-09-14 increment" table |
| 4 | Raw test report exists, current date | fail | see QA-03 (Medium) |
| 5 | Backend coverage on changed files | not independently re-measured | out of scope for this review's targeted re-run instruction (jest on the 2 spec files + build only); wiki summary reports 8/8 new tests, no numeric % |
| 6 | CI on branch green | N/A | see QA-04 — not pushed yet, expected at this stage |
| 7 | Wiki diff present for changed area | pass | `wiki/features/bom.md` new dated section (`#unregistered-mark-prefix-rejection-20260914`) + `wiki/tech/testing/per-feature/bom-mark-prefix-validation.md`, both 2026-09-14 |
| 8 | Manual test evidence | pass | wiki summary's live-verification table: real curl POST against local dev, real project data, real JWT, DB checked for zero side effects, real Product Library UI entries created, MO New tile behavior confirmed |
| 9 | Smoke test (if playwright exists) | N/A | no `playwright.config.*` anywhere in the repo |
| 10 | No active BLOCK from security subagent | not evaluated by qa | security runs as a separate parallel subagent per `/release-gate`; out of this review's scope |

### Independently re-verified claims (not trusted alone)

| Claim | Verified via | Result |
|---|---|---|
| 5 new unit tests in `bom-matching.service.spec.ts`, all passing | `npx jest src/modules/bom-upload/bom-matching.service.spec.ts` | confirmed — all 5 `findMissingMarkPrefixes` tests pass |
| 3 new unit tests in `bom-upload.service.spec.ts`, all passing | same jest run | confirmed — `bom-upload.service.spec.ts` suite fully PASS |
| 9 pre-existing, unrelated failures in `bom-matching.service.spec.ts` | same jest run + `git show dev:...bom-matching.service.spec.ts` diffed against current | confirmed — exactly 9 failed, 70 passed, 79 total; all 9 failing test names exist verbatim in the `dev` baseline (this diff only appends new tests, lines 1–173 untouched) |
| `pnpm run build` clean | re-ran `pnpm run build` (`nest build`) | confirmed — exit 0, no output/errors |
| `$queryRaw` uses safe parameterization, not string concatenation | read `findMissingMarkPrefixes` source | confirmed — Prisma tagged-template literal with `${uniqueNames}::text[]`, same pattern as pre-existing `matchAssemblies`/`matchParts`/`enforceStandardIntegrity` |
| Exactly one caller of `autoCreateCustomProducts` | `grep -rn "autoCreateCustomProducts" src/ \| grep -v .spec.ts` | confirmed — only `bom-upload.service.ts:412` |
| No other code relies on the removed `mark_prefix_master.upsert()` side effect | `grep -rn "mark_prefix_master" src/ \| grep -v .spec.ts` | confirmed — other consumers (`manufacturing-orders.service.ts`, `custom-product.validator.ts`) read rows created by `product-library.service.ts`'s own curated creation flow, unrelated to the removed blind upsert |
| Validation runs after `mergeSeparateDocTypes`, before file storage I/O and the DB transaction | read `upload()` in full | confirmed — step order is 1 validate → 2 parse → 3 merge (separate mode) → 4 NC check → **4b prefix check** → 5 dedupe parts → file storage → `$transaction`; matches the existing "Missing NC files" check's fail-fast placement and philosophy |
| No frontend change needed — generic error handler surfaces the message | read `src/components/bom/UpdateBomModal.tsx` `handleUploadError` | confirmed — extracts `err.response.data.message`, `toast.error`s it directly (non-array case) |
| **QA-01 gap (matched-then-demoted assemblies bypass the new check)** | traced `matchAssemblies` → `enforceStandardIntegrity` → `autoCreateCustomProducts` call chain in `upload()` | **confirmed as a real, reproducible gap** — see finding above |

## Overall assessment

The implementation is well-tested and correctly closes the primary attack
surface described in the task: any assembly that never matches a standard
product by name now has its prefix validated pre-transaction, and the
rejection is genuinely fail-fast (zero DB writes, zero file I/O), matching
this codebase's existing "Missing NC files" placement and philosophy. SQL is
safely parameterized, the removed `mark_prefix_master.upsert()` has no other
caller depending on it, and the "no frontend change" claim checks out. Test
counts (5 + 3 new, 9 pre-existing unrelated failures, 70 passing) and the
clean build were independently reproduced exactly as claimed. However, tracing
the full post-commit matching pipeline (`matchAssemblies` →
`enforceStandardIntegrity` → `autoCreateCustomProducts`) surfaced a real,
undisclosed gap (QA-01, High): assemblies that match a standard product by
name but get demoted back to unmatched because their parts aren't all
standard still reach `autoCreateCustomProducts` with a completely unchecked
`mark_prefix`, reproducing the exact defect class this feature exists to
prevent, for a narrower but realistic subset of cases — and both the code
comment and the new wiki section assert an unqualified "guaranteed already
registered" claim that this trace shows is false for that path.
