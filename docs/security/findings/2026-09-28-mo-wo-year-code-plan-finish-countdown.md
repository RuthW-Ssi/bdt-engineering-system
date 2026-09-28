# Security Review — MO/WO Year-Prefix Code Format + Plan-Finish Countdown Badge

- **Scope:** pre-commit review of an uncommitted working tree, reviewing
  ONLY the 2 explicitly in-scope groups per the review request — 5 files
  (Group 1: MO/WO code format change + atomic-upsert code generators + data-
  renumbering migration), 7 files (Group 2: new frontend "days remaining"
  countdown, display-only). Everything else in the working tree (a large
  amount of unrelated stray/WIP noise — `backend/*_tmp.*`, `document/
  backup_knowledge/*`, seed scripts, `storage/`, etc.) is explicitly out of
  scope per the task's own framing and was not reviewed.
- **Reviewer:** `security` role subagent (review-only, OWASP API Top 10 2023
  baseline per `wiki/tech/roles/security.md`).
- **Date:** 2026-09-28
- **Nothing is committed** — read-only review; no files staged, modified, or
  committed by this review.
- **Verdict: PASS** — no Critical/High/Medium findings. Two Low/Info notes
  below, neither blocking.

---

## Scope reviewed

```
git diff -- backend/prisma/schema.prisma
            backend/src/modules/manufacturing-orders/mo-code.generator.ts
            backend/src/modules/work-orders/wo-auto-create.service.ts
            backend/src/modules/work-orders/wo-auto-create.service.spec.ts
            src/components/mo/AssemblyPicker.tsx
            src/pages/MoDetail.tsx
            src/pages/WoDetail.tsx
            src/pages/WoList.tsx
            src/pages/MoList.tsx
Read the 3 new untracked files directly (git diff shows nothing for these):
  backend/prisma/migrations/20260928110000_mo_wo_code_year_prefix/migration.sql
  src/lib/dateMath.ts
  src/components/DaysRemainingBadge.tsx
```

Net shape: `mo_code`/`wo_code` format changes from a flat global counter
(`MO-NNNNN`, `WO-NNNNNNNN`) to a year-prefixed per-year counter
(`MO-YYNNNNNN`, `WO-YYNNNNNN`); `mo_code_seq`/`work_order_code_seq` PK
changes from a single row (`id=1`) to one row per year (PK `year`); the
generator's allocation pattern changes from `SELECT ... FOR UPDATE` +
`UPDATE` to a single atomic `INSERT ... ON CONFLICT ... RETURNING` upsert; a
one-time data migration renumbers every existing `manufacturing_order`/
`work_order` row into the new format. Group 2 adds a shared `daysUntil()`/
`daysRemainingLabel()` date-math module and a `DaysRemainingBadge` component,
wired into 4 existing pages purely as additional JSX render output.

---

## Part 1 — Migration SQL: injection-surface check

Read `migration.sql` in full (59 lines). This is a **static Prisma migration
file** — executed verbatim by `prisma migrate deploy`, never built at
runtime from any request/user input, so the injection question is really
"does any value inside it come from somewhere other than a literal or the
SQL engine's own computation."

Checked every value in the file:

- `ranked.yr` / `ranked.rn` — both computed entirely inside the SQL itself
  (`EXTRACT(YEAR FROM create_date)`, `ROW_NUMBER() OVER (...)`), not
  app-level string interpolation. No external input reaches these.
- `LPAD(...)`, `'MO-' || ...`, `'WO-' || ...` — plain SQL string
  concatenation of the above computed values, still 100% internal to the
  query. This is *not* the anti-pattern the role card warns about (that's
  about app-code building a SQL statement from untrusted input) — it's
  ordinary intra-query string building with no external data source.
- Column renames (`RENAME COLUMN "id" TO "year"`), constraint drop/re-add,
  `DELETE FROM`/`INSERT INTO ... SELECT ... GROUP BY` — all literal
  identifiers and literal SQL, nothing parameterized or interpolated at all.

**No dynamic/interpolated value from outside the SQL engine anywhere in this
file.** No injection risk — this file is exactly as safe as it looks: pure,
author-written, one-shot literal SQL.

Confirmed by grep that no other code in the repo builds a query against
`mo_code_seq`/`work_order_code_seq` via string concatenation or
`$queryRawUnsafe`/`$executeRawUnsafe` — the only two touch points are the
generator files reviewed in Part 2.

---

## Part 2 — Atomic-upsert generators: parameterization check

Both `mo-code.generator.ts`'s `next()` and `wo-auto-create.service.ts`'s
`createOrAddMarks()` now use the same pattern:

```ts
const year = new Date().getFullYear() % 100
const rows = await tx.$queryRaw<{ allocated: number }[]>`
  INSERT INTO mo_code_seq (year, next_val) VALUES (${year}, 2)
  ON CONFLICT (year) DO UPDATE SET next_val = mo_code_seq.next_val + 1
  RETURNING next_val - 1 AS allocated
`
```

- **Parameterized, not concatenated.** This is Prisma's `$queryRaw` **tagged
  template literal** form (`` tx.$queryRaw`...` ``) — the `${year}`
  placeholder is bound as a real query parameter by Prisma's driver
  adapter, not string-substituted into the SQL text before it's sent to
  Postgres. This is exactly the safe pattern the role card's anti-pattern
  #2 calls out (`$queryRawUnsafe` is the risk; the tagged template is not).
  Confirmed no `$queryRawUnsafe`/`$executeRawUnsafe` anywhere in either
  file or elsewhere in the two touched modules.
- **`year` isn't even attacker-reachable regardless.** It's derived purely
  from the server's wall clock (`new Date().getFullYear() % 100`) inside
  the service — never taken from request body/query/params. So even if the
  parameterization weren't in play, there's no path for a caller to
  influence this value at all.
- **Race-safety claim holds up.** The old pattern was `SELECT ... FOR
  UPDATE` (locks an existing row) followed by a separate `UPDATE` — safe
  only because a row already existed for the single global counter. The
  new one-row-per-year design needed something that's race-safe even when
  *no row yet exists for the current year* (first MO/WO of a new year) —
  `INSERT ... ON CONFLICT (year) DO UPDATE ... RETURNING` is the correct
  Postgres idiom for exactly that: a single atomic statement that either
  inserts the year's first row or increments the existing one, with no
  window between a lock and a subsequent write where two concurrent
  first-of-the-year requests could both read `next_val=1`. This is a
  genuine improvement over a naive "SELECT then INSERT-if-missing" approach,
  which would have reintroduced a TOCTOU race for exactly the new-year edge
  case this migration creates.
- **Test coverage matches the new shape.** `wo-auto-create.service.spec.ts`'s
  mock (`$queryRaw` → `[{ allocated: 900 }]`) and assertions were updated to
  match the single-statement upsert (no more separate `$executeRaw`
  expectation), and the expected `wo_code` is computed the same way the
  service computes it (real wall-clock year) rather than hardcoded — avoids
  a test that silently goes stale/wrong after this year ends. No test gaps
  introduced.

**No parameterization/injection issue in either generator.**

---

## Part 3 — Code guessability / information-disclosure check

Per the task's specific ask: does the new `MO-YYNNNNNN`/`WO-YYNNNNNN` format
make guessability meaningfully worse than the prior flat sequential format?

- **No — same shape, same predictability class.** Both old and new formats
  are fully sequential, zero-padded, base-10 counters with no randomness in
  either version; the new format only adds a 2-digit year prefix (itself
  derivable from `create_date`, information already present on every
  MO/WO's own detail view). An attacker who could already enumerate
  `MO-00001, MO-00002, ...` can equally enumerate `MO-26000001,
  MO-26000002, ...` — no new entropy is removed, none was hardened either.
  Guessing a valid-looking code is exactly as easy/hard as before.
- **No auth-bypass path via a guessed code, in either version.** Traced both
  controllers' route guards (unchanged by this diff):
  `ManufacturingOrderController`/`WorkOrdersController` both carry
  class-level `@UseGuards(JwtAuthGuard, PermissionGuard)` plus
  `@RequiresPermission(...)` on every route. `mo_code`/`wo_code` are used
  only as a `search`/display field (`ApiOperation` summaries confirm "search
  mo_code"/"search wo_code" on the list endpoints) — never as a bearer
  token, never as the sole means of authorizing access to a resource.
  Knowing or guessing a valid code still requires a valid JWT + the
  `orders:view`/equivalent permission to retrieve anything. Codes are
  identifiers, not credentials, exactly as the task's framing anticipated —
  this diff doesn't change that fact in either direction.
- **Info, not a finding:** the existing, already-tracked `R-001` (API1:2023
  BOLA — no object-level authorization; any authenticated user can read any
  MO/WO regardless of project/zone) is unaffected by this diff — it was true
  before this change and remains true after it, scoped to numeric `id`
  lookups (`GET /mo/:id`, `GET /wo/:id`), not the human-readable `mo_code`/
  `wo_code` string touched here. Not re-raised as a new finding (same
  reasoning as the 2026-09-24/2026-09-28 prior reviews' handling of R-001
  reconfirmations) — noted here only because the task explicitly asked this
  question to be checked.

---

## Part 4 — Group 2 (frontend countdown badge): auth/data-access boundary check

Specifically verified the task's assertion that Group 2 "shouldn't touch
auth/data-access at all."

- **`src/lib/dateMath.ts` (new):** two pure functions
  (`daysUntil`/`daysRemainingLabel`), no imports beyond the language
  built-ins (`Date`, `Math`), no network/API/storage access whatsoever.
- **`src/components/DaysRemainingBadge.tsx` (new):** pure presentational
  component — takes a `planFinish: string | null` prop already owned by the
  caller, renders a `<span>`, no hooks, no context, no data fetching.
- **`src/components/mo/AssemblyPicker.tsx`:** diff is exactly a dedup —
  the file's local `daysUntil()` (byte-identical logic) is deleted and
  replaced by the import from the new shared `lib/dateMath.ts`; its
  existing `ItemDateBadge` local component now calls the imported function
  instead of its own copy. No other line in the file changed. Confirmed via
  full diff and a targeted grep — no touch to `useAssembliesByPrefix`, no
  change to any filter/permission logic in this file.
- **`src/pages/MoDetail.tsx` / `MoList.tsx` / `WoDetail.tsx` / `WoList.tsx`:**
  every hunk in all 4 files is one of: (a) one new `import
  DaysRemainingBadge from '../components/DaysRemainingBadge'` line, or (b)
  wrapping an already-rendered `fmtDate(...)`/`fmtDateTime(...)` value in a
  fragment alongside `<DaysRemainingBadge planFinish={...} />`, or (c) a
  pure CSS grid-column-width bump (`MoDetail.tsx`'s WO row,
  `'150px 1fr 130px 120px 110px 110px 70px'` →
  `'... 150px 70px'`) to make room for the new column. Confirmed by reading
  every hunk: no hook changed, no query/fetch call added or altered, no
  `usePermission(...)` call touched, no route/guard/`ProtectedRoute` prop
  changed, no new prop threaded through from a wider scope than the
  component already had. `plan_finish` (the only field the new code reads)
  was already present on the same `mo`/`wo`/`w` objects each page already
  fetches and already displays via the pre-existing `fmtDate`/`fmtDateTime`
  call right next to it — no new field is fetched or exposed that wasn't
  already there.

**Confirmed: Group 2 introduces zero new API surface and touches no
permission check, guard, or data-fetching scope.** It is exactly what the
task described it as — client-side date math plus display.

---

## Part 5 — Standard checks (role-card DoD, scoped to this diff)

- **Auth guards:** unchanged in this diff; both controllers still carry
  `@UseGuards(JwtAuthGuard, PermissionGuard)` (confirmed by reading both
  controller headers). No new route added by this diff at all — the
  generators are internal, called from existing guarded endpoints.
- **DTO validation:** N/A — no new/changed `@Body()`/`@Query()` input in
  this diff's files. The only new "input" is `year`, server-clock-derived,
  not client-supplied.
- **Hardcoded secrets/credentials:** grepped all 12 in-scope files
  (5 Group 1 + 7 Group 2, including the new migration `.sql` and the 2 new
  frontend files) for
  `password|secret|api[_-]?key|token|credential|DATABASE_URL|Bearer |AKIA|-----BEGIN`
  — zero matches.
- **`$queryRaw`/`$executeRaw`:** both usages in scope (Part 2) are Prisma
  tagged-template calls, parameterized. No `$queryRawUnsafe` anywhere in
  scope.
- **File upload:** N/A — no upload endpoint touched by this diff.
- **Logging:** no new `console.log`/`logger.*` call anywhere in the diff
  (Group 1's generators log nothing; Group 2 is pure render code).
- **CORS:** N/A — `main.ts`/`app.module.ts` not touched by this diff.
- **Audit trail:** N/A — `mo_code`/`wo_code` are not audited fields per se;
  no `*_history` table involved in this change, and the migration doesn't
  touch any audit table.
- **Schema note (out of my lane — flagging for `data` role only, not a
  security finding):** the migration renumbers `mo_code`/`wo_code` for
  every existing row. Confirmed via `grep` that no other table has an FK
  relation keyed on `mo_code`/`wo_code` strings (all internal relations use
  the surrogate `id`), so this renumbering carries no referential-integrity
  risk inside the DB. Whether any *external* consumer (printed travelers
  already issued, a customer-facing reference, etc.) depends on the old
  code string is a data/business continuity question, not a security one —
  routed here only as an FYI, not a finding.

---

## Findings

No Critical/High/Medium findings.

### Info-1 · Info — code-format change is guessability-neutral, not a new
BOLA surface

- **Where:** `backend/src/modules/manufacturing-orders/mo-code.generator.ts`,
  `backend/src/modules/work-orders/wo-auto-create.service.ts`.
- **What:** `mo_code`/`wo_code` remain fully sequential/predictable
  identifiers under the new format, same as the old one.
- **Why:** Per Part 3 above — no meaningful change in guessability, and no
  auth relies on code secrecy in either version (JWT + `PermissionGuard`
  gate all access regardless). Recorded here only because the task
  explicitly asked this to be checked; not a new entry in
  `docs/security/risk-register.md` (no new risk class — `R-001` already
  covers the underlying BOLA-shaped gap, and it's `id`-based, not
  `mo_code`/`wo_code`-based).
- **Fix:** none needed.

### Info-2 · Info — schema/data-integrity note for the `data` role (not
security's lane)

- **Where:**
  `backend/prisma/migrations/20260928110000_mo_wo_code_year_prefix/migration.sql`.
- **What:** every existing `manufacturing_order.mo_code`/`work_order.wo_code`
  value changes as part of this migration.
- **Why:** No internal FK depends on these strings (verified, Part 5), so no
  DB-level integrity risk. Flagging only in case any external system/printed
  document keys off the old code format — outside security review scope
  (`Owns`/`Must NOT touch: Schema` boundary in `wiki/tech/roles/security.md`).
- **Fix:** route to `data` role if relevant; no action needed from security.

---

## OWASP API Security Top 10 (2023) — delta for this diff

No row in the role card's tracking table changes state as a result of this
diff:

| # | OWASP API | Effect of this diff |
|---|---|---|
| API1 BOLA | No change — `R-001` pre-exists, scoped to `id` not `mo_code`/`wo_code` (Part 3) |
| API2 Broken Auth | No change — no auth code touched |
| API3 BOPLA | No change — no new field returned by any endpoint |
| API4 Resource Consumption | No change — no new endpoint, no new heavy query shape |
| API8 Security Misconfiguration | No change — no config/env touched |
| API9 Inventory Mgmt | No change — no new/changed route (Swagger unaffected) |

No update needed to `wiki/tech/security/*` or the OWASP table in the role
card for this cycle — out of scope for this pass regardless (Wiki Write Gate
requires a separate propose→approve→write step not requested here).

---

## Definition-of-Done checklist (role card, scoped to this diff)

- [x] All `POST`/`PATCH`/`DELETE` endpoints reviewed for `JwtAuthGuard` —
  N/A, no route changed in this diff; existing guards on the two controllers
  confirmed unchanged.
- [x] DTO validation present on every input — N/A, no new `@Body()`/
  `@Query()` input in scope.
- [x] Grep clean: `password|secret|key|credential|DATABASE_URL` — 0 matches
  across all 12 in-scope files.
- [x] File upload 3-checks — N/A, no upload endpoint in scope.
- [x] Findings written to `docs/security/findings/` (this file).
- [ ] Risk register updated — not needed, no new risk class emerged (Info-1/
  Info-2 above are not new risk-register entries).
- [ ] Wiki update — not performed this pass; not requested by the task and
  would require the separate Wiki Write Gate (propose → approve → write).

**Status: DONE.**
