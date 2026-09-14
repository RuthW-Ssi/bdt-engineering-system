# QA Findings — BOM: Library Linked by mark_prefix, Not Name

- **task:** none tracked in Notion (fast-tracked to `/release-gate` per explicit user request, same pattern as `2026-09-14-bom-mark-prefix-validation.md`)
- **feature:** follow-up fix to F-BOM Unregistered Mark-Prefix Rejection (Sprint 35)
- **branch:** `dev-t-bom-library-link-by-prefix`
- **diff base:** `dev` (already contains PR #176, the same-day rejection feature)
- **reviewer:** qa (release-readiness, review-only)
- **date:** 2026-09-14

## Scope reviewed

`git diff dev -- backend/src/modules/bom-upload/bom-matching.service.ts backend/src/modules/bom-upload/bom-matching.service.spec.ts`:
- `autoCreateCustomProducts()` — library batch-lookup switched from
  `product_library.findMany({ where: { name: { in: assemblyNames, mode:
  'insensitive' } } })` / `libraryByName` to `findMany({ where: { mark_prefix:
  { in: uniquePrefixes } } })` / `libraryByPrefix`; per-assembly lookup
  switched from `libraryByName.get(nameKey)` to `libraryByPrefix.get(prefix)`
- New test file section: `describe('autoCreateCustomProducts — library
  linked by prefix', ...)` — 3 tests, direct `BomMatchingService`
  instantiation (no NestJS TestingModule)

## Findings

### QA-B01 — File-level test coverage below 90% target (pre-existing, not a regression)
- **where:** `backend/src/modules/bom-upload/bom-matching.service.ts` (whole file)
- **what:** 65% stmts / 50% branch / 58.62% funcs / 72.54% lines — below this
  project's 90%+ service coverage target. Uncovered ranges are `24-81`
  (`matchAssemblies`/`matchParts`) and `275-286` (`enforceStandardIntegrity`)
  — entirely untouched by this diff. Confirmed via a baseline (`git stash`)
  comparison against `dev`: identical 9 pre-existing test failures before and
  after this diff, same root cause (NestJS TestingModule DI resolution issue
  affecting tests written for a removed inline-custom-product-creation API
  shape — already documented in this same wiki page from the prior PR). This
  diff's own touched code (the prefix-lookup block inside
  `autoCreateCustomProducts`) is 100% line-covered by the 3 new tests.
- **severity:** Medium (per role card: coverage below target) — but
  confirmed pre-existing/unrelated to this diff, not a new regression
- **evidence:** `cd backend && npx jest src/modules/bom-upload/bom-matching.service.spec.ts --coverage`
  vs. same command against `git stash`-baselined `dev` — identical failure set
- **fix_route:** tester (repair or retire the 9 dead tests as separate,
  already-tracked tech debt — not this diff's responsibility)

### QA-B02 — No Notion task tracks this work (expected, precedented)
- **where:** Notion workspace
- **what:** Same-day fast-track to `/release-gate` per explicit user
  request, matching this session's established pattern (PR #176 earlier
  today, and prior Sprints 22/29-31/33)
- **severity:** Low/INFO
- **fix_route:** pm (backfill after ship, same as the prior PR)

## Checks performed (role-card checklist)

| # | check | result | note |
|---|---|---|---|
| 1 | Diff matches description, no scope creep | pass | confirmed line-by-line — only the library lookup key changed |
| 2 | No other caller depends on the removed name-based path | pass | `grep -rn "libraryByName"` → zero hits anywhere; only caller of `autoCreateCustomProducts` is `bom-upload.service.ts`, untouched |
| 3 | Independent test + build re-run | pass | 11/11 new-suite tests pass (9 pre-existing failures identical to baseline `dev`); `cd backend && pnpm run build` clean |
| 4 | Wiki test summary + coverage map | pass | `wiki/tech/testing/per-feature/bom-mark-prefix-validation.md` has a full section (checks 13-15) + `wiki/features/bom.md` anchor, both dated 2026-09-14 |
| 5 | `products.create` fields otherwise untouched | pass | only `library_id`'s source changed; `mark_prefix`, `mark_number`, `attributes`, etc. all unchanged context lines |
| 6 | No dead code / leftover references | pass | `libraryByName`/`assemblyNames` — zero remaining references anywhere |
| 7 | CI on branch green | N/A | branch not pushed yet at review time (pre-commit review, per task instructions) |
| 8 | No active security BLOCK | pass | security's parallel pass returned PASS, no findings |

## Overall assessment

Scoped, well-contained fix — swaps the library-lookup key (name → mark_prefix)
inside one method, with zero collateral changes and zero leftover dead code.
3 new TDD tests directly reproduce and guard the exact production bug (RB
tagged correctly but linked to the "ROD" library by name-match). The one
Medium finding (QA-B01, file coverage below target) is confirmed via
baseline comparison to be pre-existing and entirely outside this diff's
touched lines — same known debt already documented from the prior same-day
PR (#176), not a new issue introduced here.

**Decision: WARN, accepted as-is** (per user direction to proceed —
"จัดการเลย"). QA-B01 is pre-existing tech debt unrelated to this diff's
correctness; QA-B02 (no Notion tracking) will be backfilled post-ship, same
as the prior PR. No Critical/High findings, no regression. Security: PASS,
no findings.
