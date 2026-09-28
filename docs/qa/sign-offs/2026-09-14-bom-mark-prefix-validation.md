# QA Sign-off — BOM Upload: Reject Unknown Mark Prefixes

- **feature:** BOM upload — reject unknown mark prefixes (no Notion page — see QA-02)
- **task:** none tracked in Notion
- **sprint:** untracked
- **branch:** `dev-t-bom-mark-prefix-validation`
- **date:** 2026-09-14
- **decision:** **PASS** (after fix) — qa initially BLOCK (QA-01, High), fixed same session, not accepted-as-is. Security PASS (no findings) on a separate parallel pass.
- **approved_for_ship:** true
- **user_overrode:** false — no override needed, QA-01 was fixed rather than waived

## Post-review fix (same session)

- **QA-01 fixed** — `findMissingMarkPrefixes` now mirrors `enforceStandardIntegrity`'s
  post-commit demotion decision pre-transaction: an assembly that matches a
  standard product by name is only exempted from the prefix check if none of
  its parts in this same upload (via `assemblyParts` junction rows, standard
  part match via the same name-lookup pattern `matchParts` uses) fail to be
  standard-matched — reproducing the exact INNER JOIN semantics of
  `enforceStandardIntegrity`'s own SQL (zero listed parts ⇒ never demoted).
  `BomUploadService.upload()` now threads this upload's own Part List +
  Assembly Part List rows through to `findMissingMarkPrefixes` instead of
  calling it with just the assembly list. 4 new regression tests added (3
  unit-level demotion-path cases in `bom-matching.service.spec.ts`, 1
  integration-level "rows actually threaded through" case in
  `bom-upload.service.spec.ts`) — all TDD, RED confirmed before GREEN.
- Wiki (`wiki/features/bom.md` §Unregistered mark-prefix rejection,
  `wiki/tech/testing/per-feature/bom-mark-prefix-validation.md`) updated to
  document the fix and correct the previously-unqualified "guaranteed already
  registered" claim QA-01 flagged as false.
- **QA-02, QA-03** — accepted as-is (no Notion tracking for this
  fast-tracked-to-release-gate work per explicit user request; wiki test
  summary substitutes for a raw report file per this project's precedented
  pattern).
- **QA-04, QA-05** — informational only, no action needed (CI hadn't run
  because the branch wasn't pushed yet at review time; the query-duplication
  note is a maintainability pointer, not a defect).
- Full suite re-confirmed after fix: 679 passed / 17 pre-existing-unrelated
  failures (unchanged), `pnpm run build` clean.

## checks_performed

See full table + evidence in `docs/qa/findings/2026-09-14-bom-mark-prefix-validation.md`. Summary:

| # | check | performed | result |
|---|---|---|---|
| 1 | Notion task DoD | yes (searched workspace) | fail — no task exists (QA-02, Medium) |
| 2 | Wiki test summary exists | yes | pass — `wiki/tech/testing/per-feature/bom-mark-prefix-validation.md`, dated 2026-09-14 |
| 3 | Wiki summary DoD coverage map | yes | pass — 8/8 rows ✅ |
| 4 | Raw test report, current date | yes | fail → QA-03, Medium |
| 5 | Backend coverage on changed files | not independently re-measured | out of this review's targeted re-run scope |
| 6 | CI on branch green | checked | N/A — not pushed yet, expected pre-commit stage (QA-04, Low/INFO) |
| 7 | Wiki diff present for changed area | yes | pass — `wiki/features/bom.md` + wiki test summary both updated 2026-09-14 |
| 8 | Manual test evidence | yes | pass — live curl + real project data + DB verification, documented in wiki summary |
| 9 | Smoke test (if playwright exists) | checked | N/A — no Playwright suite anywhere in this repo |
| 10 | No active security BLOCK | not evaluated | out of qa's scope this pass — security runs as a separate parallel subagent per `/release-gate` |

## Independent re-verification (not trusted from claims alone)

- `npx jest src/modules/bom-upload/bom-matching.service.spec.ts src/modules/bom-upload/bom-upload.service.spec.ts` → **9 failed, 70 passed, 79 total** — matches expected exactly (all 5 new `findMissingMarkPrefixes` tests pass, `bom-upload.service.spec.ts` suite fully PASS, the 9 failures are the old-API-shape tests)
- Confirmed the 9 failures pre-date this branch: `git show dev:backend/src/modules/bom-upload/bom-matching.service.spec.ts` contains all 9 failing test names verbatim; this diff's only change to that spec file is a pure appended block (`@@ -173,3 +173,70 @@`), lines 1–173 untouched
- `pnpm run build` (`nest build`) → **clean**, exit 0
- `grep -rn "autoCreateCustomProducts" src/ | grep -v .spec.ts` → exactly one caller (`bom-upload.service.ts:412`)
- `grep -rn "mark_prefix_master" src/ | grep -v .spec.ts` → other consumers depend on `product-library.service.ts`'s own curated creation path, not on the removed blind upsert
- Read `findMissingMarkPrefixes`'s `$queryRaw` — Prisma tagged-template parameterization (`${uniqueNames}::text[]`), same safe pattern as pre-existing `matchAssemblies`/`matchParts`/`enforceStandardIntegrity`; no SQL injection risk, no missing `await`, no N+1 (2 queries total regardless of assembly count)
- Read `upload()` in full — validation placement confirmed correct: after `mergeSeparateDocTypes` (necessary — needs the merged assembly list), after the "Missing NC files" check, before file storage I/O and the `$transaction`; genuinely fail-fast
- Read `src/components/bom/UpdateBomModal.tsx` `handleUploadError` — confirmed it surfaces `err.response.data.message` via `toast.error()` with no frontend change needed
- Traced the full post-commit pipeline (`matchAssemblies` → `matchParts` → `enforceStandardIntegrity` → `autoCreateCustomProducts`) in `upload()` — **found QA-01, a real gap not disclosed in the session's own summary or the wiki writeup**
- `gh pr list` / `gh run list --branch dev-t-bom-mark-prefix-validation` → both empty, confirms branch not yet pushed (QA-04)
- `notion-search` for this feature → no matching task/feature page (QA-02)

## findings

- `docs/qa/findings/2026-09-14-bom-mark-prefix-validation.md`
  - QA-01 (**High**) — **fixed same session** — `findMissingMarkPrefixes` now covers assemblies demoted from MATCHED_STANDARD by `enforceStandardIntegrity` (mirrors the demotion decision pre-transaction via this upload's own part/junction rows)
  - QA-02 (Medium) — accepted as-is — no Notion task/feature tracks this work (fast-tracked to release-gate per explicit user request)
  - QA-03 (Medium) — accepted as-is — no raw test-report file for this increment (wiki summary substitutes reasonably, precedented pattern)
  - QA-04 (Low/INFO) — no action needed — CI now runs once pushed (was N/A pre-push, expected at this stage)
  - QA-05 (Low/INFO) — no action needed — minor query duplication between `findMissingMarkPrefixes` and `matchAssemblies` (maintainability only, not a defect)

## summary

The core fix was solid from the first pass: fail-fast placement correct, SQL
safely parameterized, tests independently re-run and matching claims exactly,
the removed upsert has no other dependent caller, and the frontend needs no
change. Tracing the full post-commit matching pipeline (not just the new
pre-transaction gate in isolation) surfaced one real, undisclosed completeness
gap (QA-01): assemblies that match a standard product by name and then get
demoted by `enforceStandardIntegrity` because their parts aren't all
standard-matched were bypassing the new prefix check entirely — the exact
defect class this feature was built to close, for a narrower but realistic
sub-case. Fixed same session by mirroring that demotion decision
pre-transaction, with 4 new regression tests (RED→GREEN) and the wiki's
previously-unqualified "guaranteed already registered" claim corrected to
describe the real mechanism. Full suite re-confirmed clean after the fix
(679 passed, same 17 pre-existing-unrelated failures, `pnpm run build`
clean). Security's parallel pass returned PASS with no findings — and
separately confirmed the removed blind upsert had been closing a real,
pre-existing Broken-Function-Level-Authorization gap (BOM-upload permission
silently writing to a governance table gated behind Product Library's own
permission), making its removal a net security improvement, not just a
correctness one.

**Final decision: PASS.** QA-01 fixed same session (see "Post-review fix"
above) rather than accepted-as-is. No blocking or warning items remain —
ready to ship.
