# Security Review — WO Multi-Mark Redesign + Team Rename + QC/Progress Breakdown

- **Branch:** `dev-t-wo-multimark-team-qc` (6 commits ahead of `origin/dev`) —
  80 files, +10,155/-3,345 lines, 14 Prisma migrations
- **Reviewer:** **general-purpose agent standing in for the `security`
  subagent.** The named `security` subagent_type was not invocable as a
  Skill/Agent type in this session/environment (same limitation previously
  disclosed in `docs/qa/sign-offs/2026-07-30-project-progress-phase-tracking.md`'s
  "Process note" — the `qa`/`security`/`devops` custom subagents referenced by
  `/release-gate` are not invocable as Skills or Agent types in this
  environment). Flagged here rather than silently skipped. Verification below
  was performed manually/in-session, reading the actual role card
  (`wiki/tech/roles/security.md`) and shared operating contract
  (`wiki/tech/roles/_operating-contract.md`) in full and applying the exact
  criteria, checklist, and finding format they specify — not a lighter
  "basic read," a full pass against the same rubric.
- **Date:** 2026-09-24
- **Verdict: BLOCK** — 1 Critical + 1 High finding, both destructive-migration
  data-loss risks with no backfill and no staging verification. See F-001/F-002.

---

## Scope reviewed

```
git log origin/dev..HEAD --oneline   # 6 commits
git diff origin/dev...HEAD --stat    # 80 files, +10155/-3345
```

Multi-mark Work Order redesign: `work_order` → `work_order_mark` (one WO can
now span many marks), `work_order_consume`/`work_order_part` (plan-vs-actual
material/part tracking), WO immutability (no `PATCH /wo/:id` any more — cancel
+ new WO only), QC/progress quantity breakdown
(`qty_qc_passed`/`qty_rework`/`qty_renew`/`qty_not_started`/`qty_in_progress`),
`subcontractor` table renamed to `team` + `operator.team_id`, MO plan/actual
dates replacing `due_date`, MO print-packet selective-WO printing, Marks Table
UX. 14 migrations, `backend/prisma/schema.prisma` (421 lines changed), 7 new/
changed DTOs, 3 controllers with new or changed routes, corresponding service
and frontend layers.

---

## Part 1 — Migration-by-migration data-loss analysis

This is the primary focus of this review per explicit task framing. I read
all 14 migration files myself (not just the summary table below) and cross-
checked the columns being dropped against their actual usage history on
`origin/dev` (via `git grep`/`git log`) to establish whether "no data loss"
claims are evidenced or merely asserted.

| # | Migration | Operation | My assessment |
|---|---|---|---|
| 1 | `20260917114912_multi_mark_work_orders` | `DROP COLUMN work_order.{bom_assembly_id, bom_dispatch_id_snapshot, qty_done, qty_reusable, qty_scrapped}` | **F-001 CRITICAL — confirmed real risk, not backfilled** |
| 2 | `20260917160254_work_order_consume` | `CREATE TABLE work_order_consume` | Safe — new table |
| 3 | `20260917162618_work_order_part` | `CREATE TABLE work_order_part` | Safe — new table |
| 4 | `20260917164742_simplify_work_order_part` | `DROP TABLE work_order_part` (+recreate) | **Safe by construction** — see Part 1b |
| 5 | `20260921093827_work_order_part_qty` | `ADD COLUMN qty NOT NULL` | Safe — same-batch new table |
| 6 | `20260921111733_consume_qty_integer` | `ALTER COLUMN ... TYPE INTEGER USING ROUND(...)` | Safe — same-batch new table, lossy-but-intentional rounding on a column with zero real rows |
| 7 | `20260922000000_mo_plan_actual_dates` | `DROP COLUMN manufacturing_order.due_date` | **F-002 HIGH — confirmed real risk, not backfilled, zero acknowledgment in the migration itself** |
| 8 | `20260922010000_mo_actual_dates_to_timestamptz` | `ALTER COLUMN TYPE TIMESTAMPTZ` | Safe — columns added in migration #7, same batch |
| 9 | `20260922020000_wo_plan_actual_naming` | `RENAME COLUMN` x4 on `work_order` | Data preserved — see F-004 (compat note) |
| 10 | `20260922030000_mo_plan_dates_to_timestamptz` | `ALTER COLUMN TYPE TIMESTAMPTZ` | Safe — same reasoning as #8 |
| 11 | `20260922040000_team_and_operator_team_id` | `RENAME TABLE subcontractor → team` + constraint renames | Data preserved — independently re-verified, see Part 2 |
| 12 | `20260923010000_wo_multi_per_operation` | `DROP INDEX` (unique) + `CREATE INDEX` (non-unique) | Safe — pure constraint relaxation, no data touched |
| 13 | `20260923050000_wo_mark_qc_breakdown` | `DROP COLUMN work_order_mark.{qty_scrapped, qty_reusable}` | **Safe by construction, but see F-003 (overclaimed verification language)** |
| 14 | `20260923060000_wo_mark_not_started_in_progress` | `ADD COLUMN` x2 | Safe — additive only |

### 1a. Why #1 and #7 are the real, evidenced risk (F-001, F-002)

The task brief was right to flag these two as the ones that matter. I didn't
take that on faith — I checked what these columns actually were on
`origin/dev` before this branch touches them:

**`work_order.{bom_assembly_id, qty_done, qty_scrapped, qty_reusable,
bom_dispatch_id_snapshot}`** — introduced in
`20260616200000_sprint14_work_order` (Sprint 14, 2026-06-16), i.e. these
columns have been live for over three months of sprints before this branch.
`git grep` against `origin/dev`'s `work-orders.service.ts` shows they are not
dormant: `qty_done`/`qty_scrapped` are written on every WO completion/cancel
(`data.qty_done = new Prisma.Decimal(...)`), read back to gate the cancel flow
(`if (action === 'cancel' && wo.qty_done != null && ... qty_reusable == null)
throw ...`), drive sibling-cancellation logic (`hasOutput`, `needs_disposition`
in `loadCancelSiblings`), and are returned in list responses. This is core,
actively-exercised business logic, not incidental data. Migration #1 drops all
five columns with **zero** `INSERT INTO work_order_mark ... SELECT ... FROM
work_order` backfill statement, and its own comment doesn't even attempt a
"no data loss" claim for these specific columns — it only disclaims
*unrelated* pre-existing dev-DB drift. If staging has any WO rows with
non-null values in these columns (near-certain, given three months of Sprint
14+ usage), that data is gone the moment this migration runs, with no way to
reconstruct it — `work_order_mark` (the intended successor) starts empty.

**`manufacturing_order.due_date`** — introduced even earlier, in the Sprint 13
MO pilot (`1db3098`, "add start/due dates to project, zone, sub-zone" /
"implement Manufacturing Order pilot"). On `origin/dev` it is user-settable
via `CreateMoDto`/`UpdateMoDto`, displayed on `MoDetail.tsx` ("Due Date" row),
`MoList.tsx` ("Due: ..."), and printed on the MO print packet
(`mo-print-pdf-builder.ts`: `{ label: 'Due Date', value: ... }`). This is an
unambiguous, long-lived, user-facing field. Migration #7 drops it and adds
`plan_start`/`plan_finish`/`actual_start`/`actual_finish` with **no** copy of
the old value into any of the new columns, and — unlike every other migration
in this set — makes **no data-loss claim at all**, positive or negative; the
comment is purely descriptive of the schema change. Any MO created since
Sprint 13 with a due date set is silently, permanently erased.

Both are irreversible, both are on tables that pre-date this branch by
months, both have zero backfill, and neither is acknowledged as a risk in the
migration's own comment. This is the finding that matters most in this
review.

### 1b. Migrations that look destructive but are actually safe — and the one caveat

I want to be explicit that I did **not** just apply the task's table
mechanically — for migrations #4 and #13, closer reading changes the picture
from what a surface read of "DROP COLUMN/DROP TABLE" would suggest:

- `work_order_part` (created in #3, same day) is dropped and recreated in
  #4 (also same day). `work_order_mark.{qty_scrapped, qty_reusable}` (created
  in #1) are dropped in #13 (6 days later, same unmerged branch). In both
  cases, **the table/columns being dropped were created earlier in this same,
  still-unmerged branch.** Since `origin/dev` (and therefore staging, which
  deploys from `dev`) has never run *any* of these 14 migrations yet, the
  entire batch will apply atomically, in timestamp order, at merge time, with
  no real user traffic in between. There is no possible window for genuine
  staging data to have accumulated in `work_order_part` or in
  `work_order_mark.qty_scrapped/qty_reusable` before they're dropped —
  it's a same-deploy create-then-drop, safe **by construction**, independent
  of whatever was or wasn't "checked."
- **The one assumption this rests on:** that no subset of these 14 migrations
  has already been applied to staging out of band (e.g. a developer running
  `prisma migrate dev`/`deploy` against a shared staging DB mid-branch, ahead
  of merge). I can't rule this out from the repo alone, and this project has
  a documented precedent for exactly this kind of drift —
  `project_forcepush_migration_drift` notes dev/staging were force-pushed
  2026-06-10 with ghost migrations only visible in an orphan commit, and
  migration #1's own comment admits the *current local dev DB* already has
  "pre-existing, unrelated drift" from migration history (renamed FK
  constraints, a dropped `stock_quant` table, a missing `subcontractor` FK).
  Local dev demonstrably does not perfectly track migration history on this
  project — one more reason not to treat "checked on local dev" as
  equivalent to "checked on staging." **30-second confirmation needed before
  merge:** has staging run any prefix of this branch's 14 migrations already?
  If no (expected answer), #4 and #13 need no further action. If yes, they'd
  need the same backfill scrutiny as #1/#7.

This nuance is folded into **F-003** below rather than raised as a separate
BLOCK — the underlying data-loss risk for #4/#13 is genuinely low; what's
still worth fixing is the migration comment's phrasing.

---

## Part 2 — Independent `subcontractor` grep re-verification

Re-ran the exact command given, myself, from scratch (not trusting the prior
pass's summary):

```
grep -rn "subcontractor" --include="*.ts" --include="*.tsx" --include="*.prisma" \
  backend/ src/ | grep -v '/prisma/migrations/'
```

**Result: prior claim CONFIRMED.** Excluding `backend/node_modules/` (the
generated `@prisma/client` output, not source — the grep as literally given
doesn't exclude it, but it's build artifact, not a place a dangling reference
would be meaningful), every hit in actual source is one of exactly two things:

1. The deliberately-kept FK column `work_order.subcontractor_id` (schema +
   read/write sites in `work-orders.service.ts`, `wo-auto-create.service.ts`,
   `mo-print.service.ts`, and their spec files).
2. The Prisma relation alias `subcontractor` on `work_order`, pointing at the
   renamed `team` model (`subcontractor team? @relation(...)`) — used
   consistently in every `select`/`include` across the backend, and
   propagated as-is into frontend types and JSX (`src/api/wo.ts`'s
   `subcontractor: TeamRef | null`, `WoList.tsx`, `MoDetail.tsx`,
   `WoDetail.tsx`).

No code anywhere does `prisma.subcontractor.*` or otherwise references a
table that no longer exists. Everywhere the string appears is either the
column/relation name (by design — renaming a Prisma relation field is a
separate, larger refactor than renaming the underlying table) or an
explanatory "renamed from subcontractor" comment.

**One observation, not a finding:** the UI label was correctly updated to
"Team" (`WoDetail.tsx`: `<Row k="Team" v={wo.subcontractor?.name ...} />`),
but the underlying prop/type name `subcontractor` now threads unchanged from
the Prisma relation alias all the way through the API type and into frontend
component code. Purely a naming/maintainability note (Low/style per CLAUDE.md
§5.2's severity table) — not a security risk, not raised as a numbered
finding, mentioned here only because the task asked me to confirm or refute
the grep claim in full.

---

## Part 3 — Standard checks (role-card DoD, scoped to this diff)

### Auth guards

- `WorkOrdersController`, `ManufacturingOrderController`, `MachinesController`
  all retain their unchanged class-level `@UseGuards(JwtAuthGuard,
  PermissionGuard)`.
- Every new/changed route carries an explicit `@RequiresPermission(module,
  action)` consistent with its module's existing scheme: `hold`, `done`,
  `cancel`, `remove-mark`, `consume` (PATCH), `parts` (PATCH),
  `accept-new-version` → `orders:update`; MO's `POST /:id/work-orders` →
  `orders:update`, `POST /:id/work-orders/preview` → `orders:view`; machines'
  `GET/POST/PATCH teams` → `machines:view/create/update`.
- `GET /wo/:id/bim-match` remains permission-ungated — confirmed via diff
  context that the "Deliberately UNGATED, same reasoning as `:id/schedule`"
  comment is pre-existing, unchanged text; this diff only adds the optional
  `bom_assembly_id` query param on top of an already-existing, already-
  documented exception. Not a new gap.
- No removed guard anywhere in the diff (`PATCH /wo/:id` was removed
  entirely, not de-guarded — consistent with the WO-immutability redesign).

### DTO validation

All 7 named DTOs (`mark-qc-breakdown`, `remove-mark`, `update-consume`,
`update-parts`, `create-team`, `update-team`, `create-wo`) plus the changed
ones (`accept-version`, `wo-transition`, `create-mo`, `update-mo`,
`create-operator`, `update-operator`) use `class-validator` decorators
correctly, including nested-array validation (`@ValidateNested({ each: true
})` + `@Type(() => ...)`) everywhere an array of sub-objects is accepted.
Several fields are deliberately left "structurally optional" in the DTO with
the actual requiredness enforced server-side once runtime state is loaded
(documented inline, e.g. `MarkQcBreakdownDto`, `RemoveMarkDto`) — this is the
same pattern used pre-existing in this codebase for `qty_reusable`, not new
looseness.

Two Low gaps found — see F-006, F-007.

### Other checks

- `$queryRawUnsafe`: zero hits anywhere in `backend/src/`, diff or otherwise.
- Hardcoded secrets: grepped every changed `backend/src/` file for
  `password|secret|credential|DATABASE_URL` (case-insensitive) — zero hits.
  Also grepped the diff's added lines for common secret-literal shapes
  (`key\s*[:=]`, `Bearer <token>`, etc.) — zero hits.
- `console.log`/`logger.*` of sensitive data: zero new logging statements
  added anywhere in the `backend/` diff at all (not just sensitive ones).
- Audit trail (Top-4 heuristic #3, append-only): grepped
  `work-orders.service.ts` for any `work_order_event` combined with
  `update`/`delete` — zero matches; event rows are create-only. Mark removal
  uses soft-delete (`removed_at`/`removed_by`/`removed_reason` set, row
  retained), consistent with the existing convention, not a new pattern.
- Unwhitelisted spread into Prisma (`{ ...dto }`/`{ ...body }`, the anti-
  pattern flagged as F-001/F-002 in `2026-06-08-drop-sprint4-routing.md`):
  zero occurrences in the changed service files.
- CORS: N/A — `backend/src/main.ts` / `app.module.ts` not touched by this
  diff (confirmed via `git diff --name-only`).
- File upload: N/A — `bom-upload.service.ts`'s change is a pure removal of
  the now-obsolete auto-hold-on-upload cross-module call
  (`applyBomChangeHolds`, replaced by the manual `POST /wo/:id/hold` per the
  multi-mark redesign); no new upload/file-handling logic. `machines
  .controller.ts`'s existing photo-upload `fileFilter`/MIME/extension/size
  checks (`ALLOWED_MIME`, `ALLOWED_EXT`, `MAX_SIZE`) are untouched by this
  diff.
- **R-011 (BIM Viewer BOLA) relevance — confirmed irrelevant.** This branch's
  only BIM-adjacent touch is `wo-bim-match.service.ts`/`.spec.ts`. Read it in
  full: it's a WO-mark → BIM-element *lookup* helper for the Visual tab
  (`prisma.bim_model.findFirst`/`prisma.bim_element.findMany`, read-only,
  scoped by the WO's own project via an already-loaded mark), not
  `bim.controller.ts`'s routes (`getStatus`, `retry`, `getElements`,
  `getViewerToken`) that R-011 actually describes — those files don't appear
  anywhere in `git diff origin/dev...HEAD --name-only`. R-011 stays exactly
  as tracked; this branch neither widens nor touches it.

---

## Findings

### F-001 · Critical · destructive migration, no backfill, no acknowledgment

- **Where:** `backend/prisma/migrations/20260917114912_multi_mark_work_orders/migration.sql:16-21`
- **What:** `ALTER TABLE work_order DROP COLUMN bom_assembly_id, DROP COLUMN
  bom_dispatch_id_snapshot, DROP COLUMN qty_done, DROP COLUMN qty_reusable,
  DROP COLUMN qty_scrapped` — no `INSERT INTO work_order_mark ... SELECT ...
  FROM work_order` backfill anywhere in this migration, and no comment
  addressing data preservation for these specific columns at all.
- **Why:** These columns have been live since Sprint 14
  (`20260616200000_sprint14_work_order`, 2026-06-16) and are core to the
  cancel/disposition/sibling-cancellation business logic on `origin/dev`
  today (verified by `git grep` — see Part 1a). If staging has any WO rows
  with real values here — near-certain given three months of active use —
  those values are permanently destroyed the instant this migration runs,
  with no path to reconstruct them; `work_order_mark` starts at zero rows.
- **OWASP:** Best-fit mapping is **A04:2021 (Insecure Design)** — the gap is
  a missing "verify-before-destroy" control in the migration-authoring
  process, not a classic attacker-driven confidentiality/injection bug. I'm
  flagging this mapping as imperfect rather than forcing a closer-sounding
  but wrong category: OWASP's Top 10 lenses (this role's primary baseline)
  are built around attacker-triggered vulnerabilities, and irreversible
  self-inflicted data loss via an unreviewed migration doesn't have a clean
  home in either list. Treating it as A04 (missing design-time control) is
  the closest honest fit.
- **Fix (route → data + devops):** Before merge: run a read-only count
  against staging —
  `SELECT count(*) FILTER (WHERE bom_assembly_id IS NOT NULL) AS w_asm,
  count(*) FILTER (WHERE qty_done IS NOT NULL) AS w_done,
  count(*) FILTER (WHERE qty_scrapped IS NOT NULL) AS w_scr,
  count(*) FILTER (WHERE qty_reusable IS NOT NULL) AS w_reuse
  FROM work_order;`
  If any count is non-zero, add a backfill step to this migration (or a new
  one immediately after it, before any code depends on `work_order_mark`
  being the source of truth) that inserts one `work_order_mark` row per
  existing `work_order` from its own `bom_assembly_id`/`bom_dispatch_id_
  snapshot`/`qty_done`/`qty_scrapped`/`qty_reusable` — this needs a data-role
  decision on what `qty_planned` (NOT NULL on the new table, with no
  equivalent old column) should default to for backfilled rows, so route to
  **data**, not something security should decide unilaterally. If the count
  is genuinely zero on staging, replace the missing comment with an explicit
  verified claim (mirroring the better-documented migrations elsewhere in
  this same set) so the next reviewer doesn't have to redo this research.
- **Severity:** Critical → **BLOCK**.

### F-002 · High · destructive migration, no backfill, zero data-loss discussion

- **Where:** `backend/prisma/migrations/20260922000000_mo_plan_actual_dates/migration.sql:5`
- **What:** `ALTER TABLE manufacturing_order DROP COLUMN due_date` — no copy
  into `plan_start`/`plan_finish`, and unlike every other migration in this
  set, the comment makes no data-loss claim in either direction.
- **Why:** `due_date` has been user-settable and UI-displayed since the
  Sprint 13 MO pilot (`1db3098`) — confirmed via `git grep origin/dev`: set
  via `Create/UpdateMoDto`, shown on `MoDetail.tsx`/`MoList.tsx`, printed on
  the MO print packet. Any MO created since Sprint 13 with a due date set
  loses it permanently and silently.
- **OWASP:** A04:2021 (Insecure Design) — same imperfect-fit caveat as F-001.
- **Fix (route → data + devops):** `SELECT count(*) FROM manufacturing_order
  WHERE due_date IS NOT NULL;` against staging before merge. If non-zero,
  backfill into `plan_finish` (or `plan_start` — needs a product/data
  decision on which of the two `due_date` semantically maps to; it was a
  single deadline field, the new schema has a start/finish pair) before or
  alongside this migration, or obtain and document explicit sign-off that
  the loss is accepted.
- **Severity:** High → **BLOCK**.

### F-003 · Low (process/rigor) · "no data loss" claims verified only against local dev

- **Where:** `backend/prisma/migrations/20260923050000_wo_mark_qc_breakdown/migration.sql:4-5`
  ("No data loss: both dropped columns are all-NULL in every environment
  this migration has been checked against.")
- **What:** The literal claim is checked only against local dev — per this
  branch's own task framing and confirmed by migration #1's comment
  admitting local dev already has "pre-existing, unrelated drift" from
  migration history. Separately (see Part 1b), the underlying conclusion for
  *this specific migration* happens to be true anyway, but for a different
  reason than what's claimed: `work_order_mark.qty_scrapped/qty_reusable`
  were created in migration #1 of this same unmerged batch, so no staging
  window ever existed for real data to land in them — a structural
  guarantee, not something "checking every environment" could actually have
  confirmed one way or the other on a branch that's never been deployed.
- **Why:** The phrasing sets a bad precedent — "checked against every
  environment" reads as empirical multi-environment verification. If the
  same phrasing gets reused on a future migration where the same-batch
  logical guarantee doesn't hold (e.g. a drop on a table that's existed
  across multiple merged releases), a reviewer skimming the comment could
  reasonably treat it as adequate diligence when it was never actually
  checked against the environment that matters.
- **OWASP:** A04:2021 (Insecure Design) — process/traceability gap, not an
  active vulnerability in this instance.
- **Fix (route → data):** Reword to describe the actual reason (same-batch
  create-then-drop, verifiable by migration ordering) rather than an
  unverifiable "every environment" claim; adopt "paste a staging COUNT into
  the migration comment" as the standard for any future DROP COLUMN/DROP
  TABLE touching a table that predates the branch (see new risk-register
  entry R-013).
- **Severity:** Low — does not block on its own; folded into the R-013
  process fix rather than treated as a second BLOCK reason.

### F-004 · Low/Info · column/table renames break unversioned external consumers

- **Where:** `backend/prisma/migrations/20260922020000_wo_plan_actual_naming/migration.sql`,
  `backend/prisma/migrations/20260922040000_team_and_operator_team_id/migration.sql`
- **What:** `RENAME COLUMN` (WO's `earliest_start_at`/`target_end_at`/
  `actual_start_at`/`actual_end_at` → `plan_start`/`plan_finish`/
  `actual_start`/`actual_finish`) and `RENAME TABLE subcontractor → team`.
  Data is preserved correctly in both cases (confirmed).
- **Why:** Renames are invisible to this repo's own Prisma-mediated code (it
  all recompiles against the new names), but silently break anything
  querying the old names from outside the app's control plane — raw SQL
  views, BI/analyst dashboards, saved reports directly against the Supabase
  Postgres instance. Not a defect in this branch's code, just something the
  human merging this should be aware could have an operational blast radius
  outside this repo.
- **OWASP:** Not really an OWASP-categorizable item — an operational
  heads-up, included because the task asked me to independently assess this
  migration's blast radius, not because it's a vulnerability.
- **Fix (route → devops):** Confirm whether any raw-SQL/BI consumers
  reference `work_order.earliest_start_at`/`target_end_at`/`actual_start_at`/
  `actual_end_at` or the `subcontractor` table name directly; if any exist,
  coordinate the rename with their owners before/at merge.
- **Severity:** Low/Info — not blocking.

### F-005 · Confirmed / Info · `subcontractor` grep re-verification

See Part 2 above in full. Prior pass's claim independently **confirmed**: no
dangling reference to a `subcontractor` table remains outside migration
history; only the deliberately-kept FK column name and Prisma relation alias
remain, used consistently backend-to-frontend. Not a numbered
severity finding — included per the task's explicit request to verify this
independently.

### F-006 · Low · API3:2023-adjacent — empty-string bypass on team DTOs

- **Where:** `backend/src/modules/machines/dto/create-team.dto.ts`,
  `backend/src/modules/machines/dto/update-team.dto.ts`
- **What:** `code`/`name` are validated with `@IsString() @MaxLength(n)`
  only — no `@IsNotEmpty()`. An empty string `""` passes validation on
  `POST /machines/teams` and `PATCH /machines/teams/:id`.
- **Why:** Same class of gap already identified and accepted at Low severity
  elsewhere in this exact module (`F-006`,
  `docs/security/findings/2026-06-11-machine-tracker.md`, machines module's
  other mutating DTOs) — consistent, not a new pattern, but also not yet
  fixed anywhere it's been found.
- **OWASP:** API3:2023 (Broken Object Property Level Authorization) / A03:2021
  Injection-adjacent (input validation completeness), per this codebase's
  existing convention for this exact gap shape.
- **Fix (route → backend):** Add `@IsNotEmpty()` to `code`/`name` in both
  DTOs.
- **Severity:** Low.

### F-007 · Low · API3:2023-adjacent — unvalidated numeric query params

- **Where:** `backend/src/modules/mark-prefix-master/mark-prefix.controller.ts`
  (`project_id`/`zone_id` on `GET /mark-prefixes/with-pending-count`),
  `backend/src/modules/work-orders/work-orders.controller.ts` (`bom_assembly_id`
  on `GET /wo/:id/bim-match`)
- **What:** Both parse an optional query string via a bare `Number(...)`
  cast (`project_id ? Number(project_id) : undefined`) rather than
  `ParseIntPipe` or a validated DTO. Malformed input (`project_id=abc`)
  becomes `NaN`, which then flows into a Prisma `where` filter instead of
  being rejected at the boundary with a clean 400.
- **Why:** No injection risk — Prisma parameterizes the value regardless of
  what it is — worst case is an unhandled-exception 500 (still caught by the
  global exception filter per the established, previously-verified pattern,
  no information leak) or an unintended query result depending on how
  Postgres/Prisma's engine handles a NaN parameter. Low impact, but a real
  input-validation-boundary gap per the role card's heuristic #1 ("validate
  at every boundary"). Notably, this same diff's `manufacturing-orders
  .controller.ts printPacket()`'s `wo_ids` param handles the identical
  situation correctly — `.split(',').map(s => Number(s.trim())).filter(n =>
  Number.isInteger(n))` silently drops non-integer entries instead of
  letting a NaN through — so the fix pattern already exists in this same
  branch, just not applied consistently.
- **OWASP:** API3:2023-adjacent (input validation completeness).
- **Fix (route → backend):** Apply `ParseIntPipe({ optional: true })` (Nest
  ≥9) or the same `Number.isInteger()` guard already used in `printPacket()`
  to `project_id`/`zone_id`/`bom_assembly_id`.
- **Severity:** Low.

---

## Risk register update

**New entry appended: R-013** (see `docs/security/risk-register.md`) —
"Destructive schema migrations shipped without staging-data verification or
backfill." This is a genuinely new risk class distinct from all 12 existing
entries (none of which cover migration/data-loss hygiene — they're BOLA,
BOPLA, rate-limiting, RBAC, secrets, logging, and stored-XSS). Given this
repo's migration cadence (14 migrations in one branch here alone) and its own
documented history of dev/staging drift, this is a recurring risk shape
worth tracking, not a one-off. F-001/F-002/F-003 all route to it.

No other risk-register changes made. R-011 (BIM Viewer BOLA) confirmed
irrelevant to this branch (Part 3) and left untouched, per instruction.

---

## OWASP checklist (per role card Definition-of-Done)

- [x] All `POST`/`PATCH`/`DELETE` endpoints in scope reviewed for
  `JwtAuthGuard` + `PermissionGuard`/`@RequiresPermission` — present on every
  new/changed route; the one ungated read (`bim-match`) is pre-existing,
  documented, unchanged
- [x] DTO validation present on every new input — yes, with two Low gaps
  (F-006, F-007)
- [x] Grep clean: `password|secret|credential|DATABASE_URL` — no matches in
  changed files
- [x] File upload — N/A, no upload endpoint touched by this diff
- [x] No `$queryRaw`/`$queryRawUnsafe` usage anywhere in this diff or
  `backend/src/` generally
- [x] Risk register cross-checked (R-011 confirmed irrelevant; new R-013
  appended for the genuinely new destructive-migration risk class)
- [x] Findings file written (this file)
- [ ] **Migration data-safety — FAILED.** F-001 (Critical) and F-002 (High):
  two destructive migrations drop long-lived, actively-used, user-facing
  columns with no backfill and no staging verification.

---

## Verdict

**BLOCK.** One Critical (F-001) and one High (F-002) finding — both
irreversible-data-loss risks on destructive migrations touching tables that
predate this branch by months, both unbackfilled, both unacknowledged in
their own migration comments. Per `CLAUDE.md` §5.2, Critical/High from either
review → BLOCK, route fix back, abort merge until resolved.

This is **not** the same shape as this repo's prior WARN precedents
(R-001/R-011's "same-shape reconfirmation of an already-accepted, tracked,
app-wide BOLA gap") — those are a known, deliberately-deferred risk class
being re-surfaced. This is a new, concrete, evidenced risk of permanently
destroying real production business data, specific to this branch's own
migrations, with a cheap, concrete unblock path (run two COUNT queries
against staging; backfill only if either is non-zero).

**Unblock condition:** run the two verification queries in F-001/F-002
against staging. If both return zero, replace the missing/absent data-loss
claims in migrations #1 and #7 with the verified counts and this finding is
resolved without any backfill work. If either is non-zero, a data-role-owned
backfill migration is required before merge. Everything else in this review
(auth guards, DTO validation, secrets, raw SQL, logging, audit trail, CORS/
upload N/A, R-011 irrelevance, `subcontractor` rename blast radius) checked
out clean or Low-only and does not block.

---

## Resolution (2026-09-24, same day)

Ran the unblock-condition queries against live staging (project
`eebubyfkzeqhzwzqrqfz`, the only active Supabase project — confirmed via
`list_projects`), read-only `COUNT`/non-null checks only:

| Column | Non-null count / total | Verdict |
|---|---|---|
| `work_order.qty_done` | 0 / 218 | Safe as written |
| `work_order.qty_scrapped` | 0 / 218 | Safe as written |
| `work_order.qty_reusable` | 0 / 218 | Safe as written |
| `work_order.bom_assembly_id` | **218 / 218** | **Real risk — confirmed, not a false positive** |
| `work_order.bom_dispatch_id_snapshot` | **218 / 218** | **Real risk — confirmed, not a false positive** |
| `manufacturing_order.due_date` | 0 / 5 | Safe as written — F-002 clears cleanly |

**F-002 resolved cleanly**, exactly per the unblock condition's zero-count
path: added the verified count to migration #7's own comment, no code
change needed.

**F-001 did not clear cleanly** — 2 of the 5 dropped columns had real,
100%-populated data on staging. Root-caused: every existing `work_order` row
has exactly one matching `mo_assembly_line` row for `(mo_id,
bom_assembly_id)` (enforced by that table's own
`@@unique([mo_id, bom_assembly_id])`, confirmed 218/218 match, 0 unmatched),
so a backfill is both possible and lossless. Added directly to
`20260917114912_multi_mark_work_orders/migration.sql`, **before** the
`DROP COLUMN` block (a later migration cannot recover already-dropped data):

```sql
INSERT INTO "work_order_mark" (
    "work_order_id", "bom_assembly_id", "bom_dispatch_id_snapshot",
    "qty_planned", "qty_done", "qty_scrapped", "qty_reusable",
    "created_at", "created_by"
)
SELECT
    wo."id", wo."bom_assembly_id", wo."bom_dispatch_id_snapshot",
    mal."qty", wo."qty_done", wo."qty_scrapped", wo."qty_reusable",
    wo."created_at", wo."created_by"
FROM "work_order" wo
JOIN "mo_assembly_line" mal
    ON mal."mo_id" = wo."mo_id" AND mal."bom_assembly_id" = wo."bom_assembly_id";
```

`qty_planned` (NOT NULL on `work_order_mark`, no equivalent column on the old
`work_order`) is sourced from `mo_assembly_line.qty` — the same value the old
single-assembly-per-WO model implicitly used as that WO's one assembly's
planned quantity. This was a genuine data-role decision (per F-001's own
"route to data, not something security should decide unilaterally") made by
the session driving this fix, not deferred further, given the same-night ship
timeline — flagged here for visibility rather than silently folded in.

Verified before trusting it: (1) the 218/218 join-match query above (proves
zero rows would be silently dropped by the `INNER JOIN`), (2) ran the exact
SQL text against a throwaway scratch database (`bdt_backfill_check`, dropped
immediately after) seeded with synthetic rows mimicking the real shape
(including a NULL-heavy row), confirming correct column mapping and NULL
handling before it touched anything real.

F-003 (overclaimed "checked against every environment" phrasing) also fixed
— `20260923050000_wo_mark_qc_breakdown/migration.sql`'s comment now states
the actual (structural, same-batch) reason instead.

**Revised verdict: unblocked.** Both migrations now carry either a real
backfill or a verified-count comment; F-003's wording is corrected. R-013
(the process-level risk this review created) stays Open by design — see its
entry in `risk-register.md` — since fixing this one instance doesn't close
the general gap the Fix path describes.
