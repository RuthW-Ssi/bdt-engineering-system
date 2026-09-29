# QA Findings — Operator nationality LA accepted (staging ← dev-t-operator-nationality-la)

- **Scope:** exactly `git diff origin/staging origin/dev-t-operator-nationality-la` (after `git fetch`)
  — 1 commit `a81285b`, 3 files:
  - `backend/src/modules/machines/dto/create-operator.dto.ts` — new exported `OPERATOR_NATIONALITIES = ['TH','MM','LA']`, used by `@IsIn`
  - `backend/src/modules/machines/dto/update-operator.dto.ts` — imports the same constant
  - `backend/src/modules/machines/dto/operator-nationality.spec.ts` — new DTO spec
- **Reviewer:** `qa` role (run as general-purpose agent; named type unavailable).
- **Date:** 2026-09-29. Read-only — no source modified, nothing committed.

## Verification performed

| check | result |
|---|---|
| `backend: npx jest src/modules/machines` (temp worktree at `origin/dev-t-operator-nationality-la`, removed after) | ✅ 2 suites / 18 tests pass |
| `backend: npx tsc --noEmit -p tsconfig.json` | ✅ 0 real errors. The worktree's symlinked `node_modules` produced only TS2742 "not portable" declaration-emit noise; with `--declaration false` the count is 0. |
| Frontend dropdown vs constant | ✅ `src/pages/ResourceList.tsx:729-731` offers exactly TH / MM / LA, the same as `OPERATOR_NATIONALITIES` |
| Validation still rejects other values | ✅ spec case `XX` rejected on create + update; `@IsIn` keeps an allowlist |

### Consumers of `operator.nationality` (grep across `backend/src`, `backend/prisma`, `src/`)

| where | handles LA? |
|---|---|
| `backend/prisma/schema.prisma:1364` — `VarChar(10)`, nullable, no CHECK/enum | ✅ |
| `machines.service.ts:130/139/161` — select / create / update pass-through | ✅ |
| `src/api/laborSkills.ts:23/49/59` — typed `string` | ✅ |
| `src/pages/ResourceList.tsx:445-448` — list badge | ✅ shows "LA" (styled blue, the same as MM; see QA-F-001) |
| `src/pages/ResourceList.tsx:656/700/703` — form default + submit | ✅ |
| Seeds: migration `20260622040000_add_operator_tables` seeds TH/MM only | ✅ n/a |
| Filters, exports, reports, print packet | none read nationality |

## Checklist (qa.md release-readiness table)

| # | check | result |
|---|---|---|
| 1 | Notion task DoD | n/a — same-day production fix, no Notion task seen |
| 2 | Wiki test summary | ✅ `testing/per-feature/production-fixes-20260929.md` § Fix 3 (dated 2026-09-29) |
| 3 | Summary all PASS | ✅ 4/4 |
| 4 | Raw test report | n/a — summary + fresh re-run above |
| 5 | Coverage on changed files | DTO allowlist covered directly by the new spec (every value + a rejection) |
| 6 | CI green | n/a — no test workflow (standing QA-F-004 from `2026-09-29-print-lang-and-production-fixes.md`) |
| 7 | Wiki diff | ✅ n/a — the wiki does not list the nationality values anywhere, so nothing drifted |
| 8 | Manual test evidence | ✅ summary row 4: `DEMO-OP-LA` created with LA through the UI → POST 201, list shows LA |
| 9 | Smoke test | n/a |
| 10 | Security BLOCK | none (see `docs/security/findings/2026-09-29-operator-nationality-la.md`) |

## Findings

### QA-F-001 — LA badge uses the same colour as MM
- **where:** `src/pages/ResourceList.tsx:445-447`
- **what:** the badge colour is `TH ? green : blue`, so LA and MM both render blue. The text label ("LA") is still correct.
- **severity:** Low (INFO, cosmetic)
- **fix_route:** fe (optional)

### QA-F-002 — Frontend options are not derived from the backend constant
- **where:** `src/pages/ResourceList.tsx:729-731` vs `create-operator.dto.ts:6`
- **what:** the lists match today, but they are kept in sync only by a code comment. The same drift caused this bug.
- **severity:** Low (INFO)
- **fix_route:** fe/be (optional — a shared constant or an options endpoint)

### QA-F-003 — Live-test record `DEMO-OP-LA` left in the local dev DB
- **where:** local dev DB, `operator` table
- **what:** test data from the manual check. Local only; it does not ship.
- **severity:** Low (INFO)
- **fix_route:** none (clean up whenever convenient)

## Verdict

**PASS** — there are no Critical, High or Medium findings, only 3 Low/INFO items.
