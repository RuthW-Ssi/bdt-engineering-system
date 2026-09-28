# Security Review — S36 Leftovers + Operation Icon + MO Print Packet Round 4

- **Scope:** pre-commit review of an uncommitted working tree (176 changed
  paths total in `git status`), reviewing ONLY the 3 explicitly in-scope
  groups per the review request — 30 files (Group 1: S36 schema/backend/
  frontend leftovers), 8 files (Group 2: new Operation Icon feature, 4 new),
  4 files (Group 3: MO print packet round 4). Everything else in the working
  tree is explicitly out of scope (unrelated stray/WIP noise, per task
  framing) and was not reviewed.
- **Reviewer:** `security` role subagent (review-only, OWASP API Top 10 2023
  baseline per `wiki/tech/roles/security.md`).
- **Date:** 2026-09-28
- **Nothing is committed** — read-only review, no files staged/modified/
  committed by this review.
- **Verdict: ~~BLOCK~~ → RESOLVED** — 1 High finding (F-001), fixed same day
  and re-verified (build clean both sides, full test suite re-run with no
  new failures, live HTTP verification of the fix — see
  `docs/qa/sign-offs/2026-09-28-s36-leftovers-op-icon-print-r4.md`'s
  "Revision" section for the exact fix and verification steps). Everything
  else checked out clean or Low/Info.

---

## Scope reviewed

```
git diff -- <41 explicitly listed paths>          # unstaged
Read the 6 new untracked files directly (git diff shows nothing for these):
  backend/src/modules/manufacturing-orders/mo-print/fab-icons-data.json
  backend/src/modules/manufacturing-orders/mo-print/mo-print-icons.ts
  src/lib/fabIcons.tsx
  src/components/operations/IconPickerField.tsx
```

Net shape: new `operation_template.icon` / `team.team_type` /
`work_order.team_headcount` columns (4 new, all additive migrations — no
`DROP COLUMN`/`DROP TABLE` in this diff, unlike the 2026-09-24 review's
primary finding); an Activity↔Operation-Type link; Team CRUD gains a
`DELETE` route; MO print packet gains a per-operation icon on the QR center
+ watermark, a page-count footer, and column relabels.

---

## Part 1 — Migration safety (all 4 new migrations)

Read all 4 migration files in full.

| # | Migration | Operation | Assessment |
|---|---|---|---|
| 1 | `20260924070000_add_activity_operation_type` | `ADD COLUMN activity.operation_type_id` (nullable FK, `ON DELETE SET NULL`) | Safe — additive, nullable |
| 2 | `20260925080000_add_team_type` | `ADD COLUMN team.team_type VARCHAR(20) NOT NULL DEFAULT 'external'` then `DROP DEFAULT` | Safe — additive with an explicit, documented backfill default; comment correctly explains why `'external'` (all pre-existing rows are the old subcontractor concept) |
| 3 | `20260925090000_add_wo_team_headcount` | `ADD COLUMN work_order.team_headcount INTEGER NOT NULL DEFAULT 1` then `DROP DEFAULT` | Safe — additive, same pattern, comment honestly flags the backfill value as a "placeholder, no real historical headcount to derive" rather than overclaiming accuracy |
| 4 | `20260929100000_add_operation_template_icon` | `ADD COLUMN operation_template.icon VARCHAR(40)` (nullable) | Safe — additive, nullable |

**No `DROP COLUMN`/`DROP TABLE`/destructive operation anywhere in this
diff's migrations** — the data-loss risk class that dominated the
2026-09-24 review (F-001/F-002, tracked as `R-013`) does not recur here.
Clean pass, no new `R-013`-shaped finding.

No dynamic/interpolated SQL in any of the 4 files — plain static DDL only.
No SQL-injection risk (N/A: nothing here is a raw-SQL query, just
`ALTER TABLE`).

---

## Part 2 — DTO validation audit (the review's explicit focus)

### F-001 — `operation_template.icon` (and every other field on this
endpoint) has **zero** runtime validation — see Findings below. This was
the specific thing the task asked to verify, and it doesn't hold up:
`CreateOperationTemplateDto`/`UpdateOperationTemplateDto`
(`backend/src/modules/routings/services/operation-template.service.ts:32-55`)
are **plain TypeScript interfaces**, not `class-validator`-decorated
classes. Confirmed definitively (not inferred) by reading the actual
installed NestJS internals — see F-001 for the full trace.

### Every other DTO touched in this diff: validated correctly

- **`backend/src/modules/activities/dto/create-activity.dto.ts`** — new
  `operation_type_id` field: `@IsOptional() @IsInt() @Min(1)`. Correct.
- **`backend/src/modules/activities/dto/query-activity.dto.ts`** — new
  `operation_type_id` query param: `@IsOptional() @Type(() => Number)
  @IsInt() @Min(1)`. Correct — uses `@Type()` for query-string coercion,
  the right pattern (contrast with F-002 below, which doesn't).
- **`backend/src/modules/machines/dto/create-team.dto.ts` /
  `update-team.dto.ts`** — new `team_type`: `@IsIn(TEAM_TYPES)` against a
  real `['internal', 'external'] as const` tuple. Correct, tight
  allowlist — can't be an arbitrary string.
- **`backend/src/modules/manufacturing-orders/dto/create-wo.dto.ts`** — new
  `team_headcount: number` (now required, was previously not present):
  `@IsInt() @Min(1)`. Correct. `team_id`/`plan_start`/`plan_finish` also
  flipped from optional to required in this same diff, still
  `@IsInt()`/`@IsPositive()`/`@IsISO8601()` as before — no validation
  regression from the optional→required change.
- **`manufacturing-orders.service.ts`'s `createWorkOrder()`** — re-checks
  `team_headcount` against the team's actual active-operator count
  **server-side**, not just trusting the frontend's own clamp
  (`if (team?.team_type === 'internal') { ... if (dto.team_headcount >
  activeCount) throw new BadRequestException(...) }`). Correct defense-in-
  depth per role-card heuristic #1 — the frontend clamp in `MoDetail.tsx`
  is UX only, not the enforcement boundary.
- **`machines.service.ts`'s new `deleteTeam()`** — checks for referencing
  `operator`/`work_order` rows before deleting and throws
  `ConflictException` (409) instead of letting a raw FK-violation 500
  leak a DB error to the client. Correct, and the new
  `DELETE /machines/teams/:id` route carries
  `@RequiresPermission('machines', 'delete')` — guarded.

### F-002 — Low — `operation_id` query param cast via bare `Number(...)`

Same shape as `F-007` in the prior review
(`docs/security/findings/2026-09-24-wo-multimark-team-qc.md`), now also
present in this diff's new code:
`backend/src/modules/manufacturing-orders/manufacturing-orders.controller.ts`
`getAssemblies()` — `@Query('operation_id') operation_id?: string` cast via
`operation_id ? Number(operation_id) : undefined` instead of
`ParseIntPipe`/a validated DTO. Malformed input (`operation_id=abc`) becomes
`NaN`, which Prisma will reject as an invalid `Int` at the query boundary
(not silently accepted) — worst case is an unhandled-exception 500, not an
injection or data-exposure risk (Prisma parameterizes regardless of the
value). Genuinely Low, not blocking — flagged only because the task's own
DTO-validation focus makes it worth naming, and the fix is cheap (same
`ParseIntPipe`/`Number.isInteger()` pattern already used correctly
elsewhere in this same file's `printPacket()`).

---

## Part 3 — Icon field: injection/XSS exposure check

Specifically traced how `icon` (DB `VarChar(40)`, no application-level
format constraint per F-001) is *used*, since an unconstrained string with a
render pipeline behind it is the classic stored-XSS/injection shape:

- **Frontend** (`src/lib/fabIcons.tsx`, `src/components/operations/
  IconPickerField.tsx`, `src/pages/OperationLibraryList.tsx`): `icon` is
  only ever used as a lookup key into a fixed, hardcoded
  `FAB_ICON_COMPONENTS: Record<string, FabIconComponent>` object (63
  curated lucide-react components). Every call site truthy-checks the
  lookup result before rendering (`t.icon && FAB_ICON_COMPONENTS[t.icon]`,
  `SelectedIcon ? <SelectedIcon .../> : null`) — an unknown/malicious key
  just renders nothing. No string is ever interpolated into `dangerouslySetInnerHTML`,
  a URL, or any other sink.
- **Backend** (`backend/src/modules/manufacturing-orders/mo-print/
  mo-print-icons.ts`): identical pattern — `FAB_ICONS: Record<string,
  IconEntry>` (from the new `fab-icons-data.json`, read in full: 63 valid
  entries, `viewBox`/`strokeWidth`/`nodes` shape, no anomalies), looked up
  by `icon` key; `drawFabIcon()` returns `false` (draws nothing, caller
  falls back to a generic vector icon) on a miss. The icon's actual SVG
  path/circle/rect/line data drawn into the PDF always comes from this
  fixed, developer-authored dataset — **never from the user-controlled
  `icon` string itself**, which is only ever a dictionary key, never
  rendered/parsed as content.

**Conclusion: no XSS/injection risk from `icon` regardless of the DTO
validation gap in F-001.** The worst realistic outcome of an unconstrained
`icon` value is (a) a value ≤40 chars that doesn't match any curated key —
harmless no-op fallback everywhere, or (b) a value >40 chars — rejected by
Postgres's own `VARCHAR(40)` constraint at insert time (Postgres enforces
this as a hard error, it does not silently truncate), surfacing as an
unhandled 500 via the existing global `LoggingExceptionFilter`. This keeps
F-001 at High (absent DTO validation is a real boundary-validation gap
regardless of what a *specific* field is used for downstream) rather than
Critical (no data leak / auth bypass / RCE / hardcoded creds).

---

## Part 4 — QR code URL (IDOR/enumerability check)

`backend/src/modules/manufacturing-orders/mo-print/mo-print.service.ts` now
encodes `${FRONTEND_BASE_URL}/order/wo/${wo.id}` into every WO traveler's QR
code (`wo.id` = sequential Postgres auto-increment integer — trivially
guessable/enumerable).

Traced the full access path the QR leads to:

- Frontend route: `src/App.tsx:149` —
  `<Route path="/order/wo/:id" element={<ProtectedRoute
  viewModules={['orders']}><WoDetail /></ProtectedRoute>} />` — gated
  behind auth + the `orders` view module.
- Backend: `WorkOrdersController` class-level
  `@UseGuards(JwtAuthGuard, PermissionGuard)` (unchanged by this diff) +
  `GET /wo/:id` requires a valid JWT and `orders:view` permission.

**Not a new/net-new finding.** Both layers require authentication — an
anonymous or unauthenticated scan of the QR does not reach any data (it
redirects to login). What *is* true, and already known: any authenticated
user, regardless of which project/zone they actually work on, can read any
WO by guessing/incrementing its id — this is exactly the existing, already-
tracked, **Open** risk `R-001` (API1:2023 BOLA — no object-level
authorization) in `docs/security/risk-register.md`. The QR code is simply a
new (printed/physical) access path into that same already-accepted gap, not
a new exposure. Consistent with this project's own precedent
(2026-09-24 review's handling of `R-011` as "same-shape reconfirmation, not
a new finding"). No new risk-register entry for this; flagged here as
Info per the task's explicit request to check it.

---

## Part 5 — Standard checks (role-card DoD, scoped to this diff)

- **Auth guards:** every new/changed route in scope carries its
  controller's class-level `@UseGuards(JwtAuthGuard, PermissionGuard)` plus
  an explicit `@RequiresPermission(...)` — confirmed for the new
  `DELETE /machines/teams/:id`, unchanged-but-touched `GET /mo/:id/
  assemblies` (now takes `operation_id`), `GET /mo/:id/print-packet`
  (unchanged route, new `icon` data flowing through it),
  `POST/PATCH /operation-templates` (unchanged routes/guards; F-001 is a
  DTO-validation gap, not a missing-guard gap — the endpoint is properly
  authenticated and permission-gated, just not input-validated).
- **Hardcoded secrets/credentials:** grepped every one of the 41 in-scope
  files (including the 4 new migration `.sql` files and the 6 new/untracked
  files) for
  `password|secret|api[_-]?key|token|credential|DATABASE_URL|Bearer |AKIA|-----BEGIN`
  — **zero matches**. `FRONTEND_BASE_URL` is read from `process.env` (not
  hardcoded); the new comment above it in `mo-print.service.ts` just
  documents that local dev's own `.env` now points it at a real deploy URL
  — no literal secret/URL committed to source.
- **`$queryRaw`/`$executeRaw`:** all pre-existing usages in touched modules
  (`wo-auto-create.service.ts`, `activities.service.ts`, and the two
  `*-code.generator.ts` files, none of which this diff's own hunks modify)
  are Prisma tagged-template calls — parameterized, not string
  concatenation. No `$queryRawUnsafe` anywhere in scope.
- **File upload:** N/A — no upload endpoint touched by this diff.
- **Logging:** no new `console.log`/`logger.*` calls of sensitive data
  found in the diff.
- **CORS:** N/A — `main.ts`/`app.module.ts` not touched by this diff.
- **Data exposure via `operation_template.icon`:** now returned by
  `GET /operation-templates` (list + detail) and folded into the print-
  packet PDF. This is a non-sensitive, developer-curated icon-key string
  (not PII, not an internal ID, not a secret) — same "endpoint returns the
  raw Prisma object" shape already tracked at Low/Medium as `R-002`
  (BOPLA). Adding one more low-sensitivity field to an already-accepted
  instance of that pattern doesn't change its severity; not raised as a
  separate finding.

---

## Findings

### F-001 · High · API3:2023-adjacent / A03:2021 — `operation-templates`
create/update endpoints have **zero** DTO validation (not just `icon`)

- **Where:**
  `backend/src/modules/routings/services/operation-template.service.ts:32-55`
  (`CreateOperationTemplateDto`/`UpdateOperationTemplateDto` declared as
  plain TypeScript `interface`s, `icon?: string | null` added to both at
  lines 41 and 53 in this diff) consumed at
  `backend/src/modules/routings/operation-templates.controller.ts:65`
  (`create(@Body() dto: CreateOperationTemplateDto, ...)`) and `:74`
  (`update(..., @Body() dto: UpdateOperationTemplateDto, ...)`).
- **What:** These two `@Body()` parameter types are plain interfaces, not
  classes decorated with `class-validator` decorators. TypeScript
  interfaces are erased at compile time — the emitted `design:paramtypes`
  metadata Nest's `ValidationPipe` sees for these parameters is `Object`,
  not a class with validation metadata. Confirmed **definitively**, not
  inferred, by reading the actual installed
  `backend/node_modules/@nestjs/common/pipes/validation.pipe.js:104-109`:
  `toValidate(metadata) { ... const types = [String, Boolean, Number,
  Array, Object, Buffer, Date]; return !types.includes(metatype) }` — `Object`
  is explicitly in the skip-list, so validation for this parameter is
  skipped entirely, silently, regardless of the global pipe's
  `whitelist: true` / `forbidNonWhitelisted: false` / `transform: true`
  config (`backend/src/main.ts:17`). **This means not just the new `icon`
  field but every field on these two endpoints — `op_code`, `name`,
  `op_type_id`, `workcenter_id`, `method`, `time_mode`, `duration_min`,
  `formula_expr`, and the nested `activities[]` array — has zero runtime
  format/type/length enforcement at the API boundary.** This is a
  pre-existing architectural pattern (the interface predates this branch
  with 6+ fields already in it), not a regression introduced here — but
  this diff extends that same unvalidated surface to a new field, which is
  exactly the scenario the review was asked to check.
- **Why:** Per role-card Top-5 anti-pattern #1 ("Trust client input — skip
  DTO validation") and heuristic #1 ("validate at every boundary — DTO at
  controller + business rule in service + FK at DB"), this endpoint has
  none of the first layer. Concretely for `icon`: a value >40 chars isn't
  rejected with a clean 400 at the boundary — it's only caught when
  Postgres's own `VARCHAR(40)` constraint throws at insert time, surfacing
  as a generic 500 instead of a meaningful validation error. Checked
  whether this opens an injection/XSS path (Part 3 above) — it does not,
  `icon` is only ever used as a safe dictionary-lookup key on both
  frontend and backend, never interpolated into rendered content. That
  containment is what keeps this at **High** rather than **Critical**: the
  gap is real and matches "absent DTO validation" in the task's own
  severity table, but there is no confirmed data-leak/auth-bypass/RCE
  path riding on it today. A malformed `op_type_id`/`workcenter_id`
  (wrong type, out of range) would similarly reach Prisma unvalidated —
  Prisma's own type-checking is the only remaining backstop, which is
  weaker and less informative than a proper DTO 400.
- **OWASP:** API3:2023 (Broken Object Property Level Authorization) is the
  closest catalog fit for "unvalidated request body reaching the data
  layer," cross-referenced with A03:2021 Injection's input-validation
  principle (though, per Part 3, no actual injection sink exists here).
- **Fix (route → backend):** Convert `CreateOperationTemplateDto`/
  `UpdateOperationTemplateDto` from plain interfaces into real
  `class-validator`-decorated classes (the pattern every other DTO in this
  same diff correctly uses — see Part 2), at minimum:
  `@IsString() @MaxLength(40) @IsOptional() icon?: string | null` (matching
  the `@db.VarChar(40)` column), plus equivalent decorators for the other
  currently-unvalidated fields (`@IsString() @MaxLength(...)` on `op_code`/
  `name`/`method`/`time_mode`, `@IsInt()` on `op_type_id`/`workcenter_id`,
  `@IsNumber() @Min(0)` on `duration_min`, `@IsString()` on `formula_expr`,
  `@ValidateNested({ each: true }) @Type(() => ...)` on `activities[]`).
  This is a larger, pre-existing-debt fix than just `icon` — flagging the
  full scope here so it isn't re-discovered piecemeal on the next endpoint
  touch.
- **Severity:** High → **BLOCK**.

### F-002 · Low · API3:2023-adjacent — unvalidated `operation_id` query param

- **Where:**
  `backend/src/modules/manufacturing-orders/manufacturing-orders.controller.ts`
  `getAssemblies()` (new `operation_id` query param added in this diff).
- **What:** `@Query('operation_id') operation_id?: string` cast via
  `operation_id ? Number(operation_id) : undefined` rather than
  `ParseIntPipe`/a validated DTO.
- **Why:** Same shape, same low severity, as `F-007` in
  `docs/security/findings/2026-09-24-wo-multimark-team-qc.md` — malformed
  input becomes `NaN`; Prisma rejects a `NaN` where an `Int` is expected
  rather than executing anything unsafe (no injection risk, parameterized
  regardless), so worst case is an unhandled-exception 500. This same
  file's `printPacket()` handles the identical situation correctly
  (`.split(',').map(...).filter(n => Number.isInteger(n))`) — the safe
  pattern already exists in this codebase, just not applied here.
- **OWASP:** API3:2023-adjacent (input validation completeness).
- **Fix (route → backend):** `ParseIntPipe({ optional: true })` or the
  same `Number.isInteger()` guard used in `printPacket()`.
- **Severity:** Low.

### F-003 · Info · QR-code WO URL — confirmed not a new exposure

See Part 4 above in full. `${FRONTEND_BASE_URL}/order/wo/${wo.id}` is
guarded end-to-end (frontend `ProtectedRoute` + backend
`JwtAuthGuard`/`PermissionGuard`) — sequential/guessable ids are a
reconfirmation of the already-tracked, Open `R-001` (API1:2023 BOLA), not a
new risk. Not a numbered severity finding; included per the task's explicit
request to assess this.

### F-004 · Info · migration safety — clean pass

See Part 1. All 4 new migrations are additive (`ADD COLUMN`, one new FK),
none destructive. No `R-013`-shaped (destructive-migration) finding this
cycle.

---

## Risk register update

**New entry appended: `R-015`** (see `docs/security/risk-register.md`) —
"Interface-typed (not class-validator-decorated) request-body DTOs silently
bypass NestJS's global ValidationPipe." This is a genuinely new risk shape,
distinct from `R-002` (BOPLA — output-side over-exposure) and `R-013`
(destructive migrations) — this one is input-side, and specifically about a
type-system false sense of safety (`...Dto`-named types that provide zero
runtime enforcement). Confirmed exactly 2 occurrences repo-wide
(`operation-template.service.ts`, in scope here, and
`project-progress.service.ts`, out of scope / untouched by this diff — named
for completeness, not reviewed). F-001 routes to this new entry.

No other risk-register changes. `R-001` reconfirmed relevant to the new QR
access path (Part 4/F-003) and left as-is (Open, unchanged) — not
duplicated.

---

## OWASP checklist (per role-card Definition-of-Done)

- [x] All `POST`/`PATCH`/`DELETE` endpoints in scope reviewed for
  `JwtAuthGuard` + `PermissionGuard`/`@RequiresPermission` — present on
  every one, including the new `DELETE /machines/teams/:id`.
- [ ] **DTO validation present on every new input — FAILED for
  `operation-templates` create/update (F-001).** Every other new field in
  scope (`team_type`, `team_headcount`, `activity.operation_type_id`,
  `mo/:id/assemblies?operation_id`) is validated correctly or Low-only
  (F-002).
- [x] Grep clean: `password|secret|api-key|token|credential|DATABASE_URL` —
  zero matches across all 41 in-scope files, including the 4 new migration
  files and 6 new/untracked files.
- [x] File upload — N/A, no upload endpoint touched by this diff.
- [x] No `$queryRawUnsafe` usage anywhere in scope; all `$queryRaw`/
  `$executeRaw` in touched modules are pre-existing, unmodified-by-this-diff
  tagged-template calls.
- [x] Migration data-safety — clean, all 4 new migrations additive
  (Part 1/F-004).
- [x] Risk register cross-checked (`R-001` reconfirmed relevant to Part 4,
  not duplicated; new `R-015` appended for the genuinely new DTO-validation
  gap shape).
- [x] Findings file written (this file).

---

## Verdict

**BLOCK.** One High finding (F-001): the `operation-templates` create/
update endpoints — including the new `icon` field this review was
specifically asked to check — have zero request-body validation, confirmed
definitively via NestJS's own installed `ValidationPipe` source, not
inferred. Per `CLAUDE.md` §5.2 and the task's own severity table,
High → BLOCK.

**This is not a Critical.** Traced the actual downstream use of the
unvalidated `icon` value in full (Part 3) and confirmed no injection/XSS/
data-leak path exists — it's used exclusively as a safe dictionary-lookup
key on both frontend and backend, never rendered/interpolated as content.
The gap is a real missing input-validation boundary (worst case: a
malformed value either no-ops harmlessly or throws an unhandled 500 at the
DB layer instead of a clean 400 at the API layer), not an exploitable
vulnerability today — but "not exploitable *yet*, via this one field" is
exactly the kind of gap the role card's heuristic #1 says not to wave
through, especially since the same unvalidated surface covers 7 other
fields on the same two endpoints, some of which (`op_type_id`,
`workcenter_id`) feed FK lookups where a malformed value's behavior is less
well-understood than `icon`'s contained blast radius.

**Everything else in this review** — auth guards (all present, all
correctly permission-gated), the 4 new migrations (all additive, no
data-loss risk), secrets (grep-clean across all 41 files), raw SQL (no
unsafe usage), the QR-code URL (confirmed authenticated end-to-end, a
reconfirmation of already-tracked `R-001`, not new), and every other new
DTO field in this diff (`team_type`, `team_headcount`,
`activity.operation_type_id`) — checked out clean or Low-only and does not
block on its own.

**Unblock condition:** convert `CreateOperationTemplateDto`/
`UpdateOperationTemplateDto` to real `class-validator` classes per F-001's
fix path (at minimum covering `icon` with `@IsString() @MaxLength(40)
@IsOptional()`, matching the DB column this review was asked to check
against). F-002 (Low) does not need to block merge but is cheap to fix in
the same pass since the correct pattern already exists elsewhere in this
same file.
