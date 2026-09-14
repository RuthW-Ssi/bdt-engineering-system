# QA + Security Sign-off — BOM: Library Linked by mark_prefix, Not Name

- **feature:** follow-up fix to F-BOM Unregistered Mark-Prefix Rejection (Sprint 35)
- **branch:** `dev-t-bom-library-link-by-prefix`
- **date:** 2026-09-14
- **decision:** **WARN, accepted as-is** — qa WARN (1 Medium, pre-existing/unrelated), security PASS (no findings)
- **approved_for_ship:** true
- **user_overrode:** true — user explicitly directed to proceed ("จัดการเลย") after both review results were reported

## Why WARN, and why accepted rather than fixed

QA-B01 (Medium): `bom-matching.service.ts` file-level coverage sits below
this project's 90% target (65% stmts / 50% branch). Independently confirmed
via a `git stash`-baselined comparison against `dev` that this is **not a
regression** — the exact same 9 tests fail identically on baseline `dev`,
targeting a removed inline-custom-product-creation API shape (`matchAssemblies`/
`matchParts`/`enforceStandardIntegrity`, all entirely untouched by this diff).
This diff's own touched code (the prefix-lookup block) is 100% line-covered
by its 3 new tests. Same known debt already flagged in the prior same-day PR
(#176)'s own QA pass — not new information, just re-surfaced because it's
the same file. Accepted rather than fixed here: repairing 9 dead tests
written against a since-refactored API is separate, larger tech debt (routed
to `tester`), out of scope for a narrow bug-fix diff.

QA-B02 (Low/INFO): no Notion task — expected, same fast-track pattern as
PR #176 earlier today. Will be backfilled post-ship.

## checks_performed

See full table + evidence in `docs/qa/findings/2026-09-14-bom-library-link-by-prefix.md`. Summary:

| # | check | result |
|---|---|---|
| 1 | Diff matches description, no scope creep | pass |
| 2 | No other caller depends on removed name-based path | pass — zero remaining references |
| 3 | Independent test + build re-run | pass — 11/11 new-suite tests, same 9 pre-existing failures as baseline `dev`, clean `pnpm run build` |
| 4 | Wiki test summary + coverage map | pass — updated same day, both `wiki/features/bom.md` and the per-feature testing page |
| 5 | `products.create` fields otherwise untouched | pass |
| 6 | No dead code / leftover references | pass |
| 7 | CI on branch green | N/A — not pushed yet at review time |
| 8 | No active security BLOCK | pass — security PASS, no findings |

## Independent re-verification (not trusted from claims alone)

- `cd backend && npx jest src/modules/bom-upload/bom-matching.service.spec.ts` → 11/11 new-relevant tests pass, 9 pre-existing failures — confirmed byte-identical against a `git stash`-baselined `dev` run
- `grep -rn "libraryByName\|assemblyNames\b" backend/src/` → zero hits anywhere — no dead code left behind
- `grep -rn "autoCreateCustomProducts" backend/src/ | grep -v .spec.ts` → exactly one caller (`bom-upload.service.ts`), signature/call site untouched
- `cd backend && pnpm run build` (`nest build`) → clean
- Read the full `autoCreateCustomProducts` method body — confirmed only the library-lookup source changed, every other field on the created product is an unchanged context line

## Security findings

None. Full PASS — confirmed the diff is a pure Prisma query-builder key swap
(name → mark_prefix), no new SQL shape, no touched guards/permissions, no
widened privilege (both before and after, `library_id` is only ever set to
an existing active `product_library` row's id). One non-security business-logic
observation routed to `be`/`qa`: the new `mark_prefix` match is case-sensitive
(relies on `parseAssemblyMark()` always uppercasing); confirmed low-risk since
`AddLibraryEntryModal.tsx` already forces the Mark Prefix Code input to
uppercase, so `product_library.mark_prefix` should always be stored uppercase
by construction — not acted on as a fix in this PR, noted for awareness.

## Live production verification (Supabase + real app UI, same session)

- SQL audit across all 13 zones of project 6 ("Smash golf driving range
  Bangna") confirmed the exact bug pattern live: `RB`-marked assemblies
  (`DBN-A5-RB1`) all carry raw `name="ROD"`, exact-matching the unrelated
  "ROD" library by name pre-fix
- Registered the 2 missing Product Library prefixes on production/staging
  via the real Engineer Products UI: `BRACE`/BR (LIB-037), `SUBTRUSS`/STR
  (LIB-038) — `CTR MAST COLUMN`/CTR (LIB-036) was already registered earlier
  the same day
- Each required deleting a pre-existing orphan `mark_prefix_master` row
  first (same pattern as CTR earlier) — confirmed zero `product_library`
  owner before each delete
- Bound Mark Prefix "CTR" on routing template RT-0008 (production/staging),
  previously blocked by the missing library entry — now resolved

## summary

Narrow, correct fix for a real production data-integrity bug confirmed via
live SQL audit (64 RB-marked assemblies mislinked to the "ROD" library
instead of "Round Bar"). Both review passes independently re-verified all
claims (test counts, build, caller graph, field-level diff scope) rather
than trusting the task description. The one Medium finding is pre-existing
tech debt confirmed unrelated to this diff via baseline comparison, and is
already transparently documented — accepted per explicit user direction to
proceed rather than silently waived.

**Final decision: WARN, accepted as-is — ready to ship.** No Critical/High
findings on either pass. QA-B02 (Notion tracking) and QA-B01 (dead test
repair) tracked as separate follow-ups, not blockers.
