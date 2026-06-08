# Security Findings — T-ACT.02 Drop Sprint 4 Routing Chain

- **Review date:** 2026-06-08
- **Branch:** `dev-t-drop-sprint4-routing`
- **Task:** T-ACT.02 — Drop Sprint 4 routing chain
- **Scope:** 10 DB tables dropped, 6 backend services deleted, 4 frontend pages
  deleted, 3 services stubbed (zone-summary, BomRoutingConfig consumable
  detection, TemplatePreviewPanel activity aggregation)
- **Reviewer role:** security (review-only)
- **Overall verdict:** ⚠️ **WARN**

> **Verdict rationale:** The single High finding (F-001) is a **pre-existing**
> issue not introduced by this PR — the `CreateOpTypeDto`/`UpdateOpTypeDto`
> interface pattern predates this branch. The PR itself (drops + stubs) is
> clean: JWT guard coverage complete, migration safe, stubs do not leak
> internals. F-001 is flagged as a BLOCK-level finding that must be resolved on
> a standalone backend ticket before the next release gate. The remaining items
> are Medium/Low and do not block this PR independently.

---

## Summary checklist

| Check | Result | Notes |
|---|---|---|
| All kept endpoints guarded with `@UseGuards(JwtAuthGuard)` | ✅ PASS | Class-level guard on `RoutingsController` covers all methods |
| DTO validation with class-validator on kept POST/PATCH endpoints | ⚠️ PARTIAL | `CreateOpTypeDto` / `UpdateOpTypeDto` are plain interfaces — no class-validator (pre-existing) |
| No secrets / credentials in diff | ✅ PASS | Grep clean |
| Migration uses `IF EXISTS` guards | ✅ PASS | All 10 DROP statements have `IF EXISTS` |
| No SQL injection via `$queryRawUnsafe` | ✅ PASS | Zero `$queryRawUnsafe` calls in changed code |
| Zone-summary stub returns empty arrays (no error leak) | ✅ PASS | Returns `{ applied_count: 0, consumables: [], workcenter_times: [], by_assembly: [] }` |
| BomRoutingConfig stub free of PII / internal data | ✅ PASS | Consumable/activity computation removed; no engineering IP rendered in partial state |
| History endpoints use `select: { id, name }` (no password/email leak) | ✅ PASS | `changed_by: { select: { id: true, name: true } }` |
| Migration wrapped in BEGIN/COMMIT (atomic) | ✅ PASS | Single transaction |
| Deleted pages removed from frontend router | ✅ PASS | 3 routes removed from `App.tsx` |

---

## Findings

### F-001 · High · API3:2023 BOPLA — op-type DTOs are plain interfaces, not validated classes

- **Where:**
  - `backend/src/modules/routings/services/op-type.service.ts:4-21`
    (`CreateOpTypeDto`, `UpdateOpTypeDto` declared as TypeScript interfaces)
  - `backend/src/modules/routings/routings.controller.ts`
    (`POST /op-types`, `PATCH /op-types/:id`)
- **What:** `CreateOpTypeDto` and `UpdateOpTypeDto` are TypeScript
  `interface` types, not classes decorated with `class-validator`. At
  runtime, TypeScript interfaces are erased. The global
  `ValidationPipe({ whitelist: true, transform: true })` has no effect
  because there is no class-validator metadata to introspect. This means:
  - Required fields (`key`, `label`) are not enforced — `null` / `undefined`
    reach Prisma, surfacing as 500 DB errors (Prisma error message may leak
    column names and constraint names to the caller).
  - `PATCH /op-types/:id` uses `data: { ...dto }` — the full request body
    is spread into the Prisma update without whitelist enforcement; extra
    fields silently pass the NestJS pipe layer (Prisma secondary guard
    provides partial protection at the DB column level only).
  - `method_options` is `as any`-cast JSONB with no structure validation;
    any JSON document is accepted and stored.
- **Why (impact):** Unvalidated JSONB in `method_options` can store
  unexpected structures that break downstream rendering. Missing required
  field guards cause DB errors that expose Prisma internals. Absence of
  whitelist enables probing of the Prisma column schema via error messages.
- **OWASP:** API3:2023 (Broken Object Property Level Authorization) +
  A03:2021 (Injection — unvalidated input path)
- **Severity:** High
- **Note:** This pattern **pre-dates this PR** — the op-type endpoints
  existed on `main` before this branch. This PR reorganises them within the
  controller but does not introduce or fix the issue.
- **Fix route → backend:**
  1. Convert `CreateOpTypeDto` and `UpdateOpTypeDto` from `interface` to
     `class` with `class-validator` decorators:
     ```typescript
     import { IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean,
               IsArray, ValidateNested, IsHexColor, MaxLength } from 'class-validator'
     import { Type } from 'class-transformer'

     export class MethodOptionDto {
       @IsString() value: string
       @IsString() label: string
     }

     export class CreateOpTypeDto {
       @IsString() @IsNotEmpty() @MaxLength(64) key: string
       @IsString() @IsNotEmpty() @MaxLength(128) label: string
       @IsOptional() @IsString() @MaxLength(20) color?: string
       @IsOptional() @IsString() @MaxLength(64) default_op_code?: string
       @IsOptional() @IsArray() @ValidateNested({ each: true })
       @Type(() => MethodOptionDto) method_options?: MethodOptionDto[]
       @IsOptional() @IsNumber() sequence?: number
       @IsOptional() @IsNumber() default_wc_id?: number
     }
     ```
  2. Replace `data: { ...dto }` spread in `update()` with an explicit field
     list (matching the pattern used in `create()`).
  3. Run `npm run build` to confirm TS compilation after conversion.
- **Standalone ticket required** — do not block this PR for this fix;
  raise a `be` task targeting the next sprint cycle.

---

### F-002 · Medium · API3:2023 — `PATCH /op-types/:id` spreads unwhitelisted body into Prisma

- **Where:** `backend/src/modules/routings/services/op-type.service.ts:70-76`
- **What:** `data: { ...dto, ... }` spread passes the entire request body
  object into the Prisma `update` call. Prisma's generated client rejects
  truly unknown column names at runtime (SQL error), but only after reaching
  the DB layer. No NestJS-layer whitelist blocks extra fields.
- **Why:** Defence-in-depth failure; any future Prisma schema addition with
  the same field name as an attacker-supplied key could be exploited.
- **OWASP:** API3:2023
- **Severity:** Medium
- **Pre-existing:** Yes — not introduced by this PR.
- **Fix route → backend:** Replace spread with an explicit `data` object
  listing each accepted field individually (see F-001 fix step 2 above).

---

### F-003 · Medium · A09:2021 — op-type mutation endpoints lack audit user capture

- **Where:** `backend/src/modules/routings/routings.controller.ts`
  (`createOpType`, `updateOpType`, `removeOpType` handlers — lines ~383-399)
- **What:** None of the three op-type mutation handlers inject
  `@CurrentUser()`. The service therefore cannot record `create_uid` or
  `write_uid` on op-type changes. Who created or modified an operation type
  is untracked.
- **Why:** Op-type changes affect the entire routing palette — a schema-level
  change with broad downstream impact. OWASP A09:2021 requires security-
  relevant events to be logged with sufficient context to identify who acted.
- **OWASP:** A09:2021 (Insufficient Logging and Monitoring)
- **Severity:** Medium
- **Pre-existing:** Yes — not introduced by this PR.
- **Fix route → backend:** Add `@CurrentUser() user: JwtPayload` to the
  three handlers; thread `user.sub` into service methods; persist
  `create_uid: uid, write_uid: uid` in the Prisma `create` and `update`
  calls (matching the pattern in `RoutingService`).

---

### F-004 · Low · API4:2023 — `getTemplateHistory` pagination has no max `limit` cap

- **Where:** `backend/src/modules/routings/routings.controller.ts:263-277`
- **What:** `@Query('limit') limit = '50'` — no maximum cap applied before
  `take: Number(limit)`. A client can request unlimited records in a single
  call. The existing R-003 (no rate limiting) amplifies this.
- **OWASP:** API4:2023 (Unrestricted Resource Consumption)
- **Severity:** Low (engineering IP history, not PII; tables will be small
  at current project scale)
- **Pre-existing:** Yes — same unbounded pagination pattern used on other
  history endpoints.
- **Fix route → backend:** Apply `take: Math.min(Number(limit) || 50, 200)`.

---

### F-005 · Low · API8:2023 — CORS wildcard `origin: '*'` in `main.ts`

- **Where:** `backend/src/main.ts:8`
  ```typescript
  app.enableCors({ origin: '*' })
  ```
- **What:** Wildcard CORS allows any origin to make credentialed requests
  to the API. In production this broadens the cross-origin attack surface.
- **OWASP:** API8:2023 (Security Misconfiguration)
- **Severity:** Low — partially mitigated by JWT `Authorization` header
  requirement (CORS credentials mode would need explicit origin anyway for
  cookie-based auth; bearer token auth is less sensitive to CORS origin).
- **Pre-existing:** Yes — unchanged by this PR. Overlaps with R-006.
- **Fix route → devops/backend:** Set `origin: process.env.ALLOWED_ORIGINS?.split(',')` or explicit list per environment, defaulting to `http://localhost:5173` in dev.

---

## What passed

| Item | Evidence |
|---|---|
| JWT guard on all kept routes | `@UseGuards(JwtAuthGuard)` class-level decorator at `RoutingsController:40`; no `@Public()` override on any kept endpoint |
| Migration atomicity | `BEGIN` / `COMMIT` wrap all 10 DROP statements |
| Migration safe order | Tables dropped child-first (`routing_op_act_tool` → `routing_op_act_consumable` → `routing_op_activity` → … → `routing_activity_template`) |
| `IF EXISTS` on every DROP | All `DROP TABLE` statements use `IF EXISTS` — no hard-fail on partially applied schema |
| `DROP COLUMN IF EXISTS` on FK removal | `ALTER TABLE … DROP CONSTRAINT IF EXISTS` + `DROP COLUMN IF EXISTS` |
| No `$queryRawUnsafe` | Full diff grep clean |
| Zone-summary stub | Returns `{ dispatch_id, applied_count: 0, total_matched: 0, consumables: [], workcenter_times: [], by_assembly: [] }` — no internal error detail |
| BomRoutingConfig stub | Removed `calcActivityTime`, consumable loop, activity rendering; no internal formula / schema data exposed in partial state |
| History `include` uses `select` | `changed_by: { select: { id: true, name: true } }` — no password, email, or hash columns |
| Deleted pages removed from router | `ActivityTemplateMaster`, `CustomRoutingEditor`, `BulkOverrideAdmin` routes removed from `src/App.tsx`; dead code no longer served |
| No hardcoded secrets in diff | Grep for `password|secret|key|credential|DATABASE_URL|jwt_secret` returned zero additions |
| `createRouting` DTO properly validated | `CreateRoutingDto.from_template` uses `@IsOptional() @IsString()` class-validator — the one new frontend call is backed by a correctly validated DTO |

---

## Risk register impact

| Register entry | Impact of this change |
|---|---|
| R-001 BOLA | Neutral — object-level checks still absent on kept endpoints; no regression |
| R-002 BOPLA (full object leak) | Slight positive — 6 deleted services remove 6 potential raw-Prisma return paths |
| R-003 API4 rate limiting | Neutral — F-004 pagination cap is a sub-item of this open risk |
| R-004 API5 RBAC | Neutral — no new RBAC added; pre-existing open risk unchanged |
| R-005 API6 anti-automation | Neutral |
| R-006 Security Misconfiguration | Neutral |

**New risk entry required:** None. F-001/F-002/F-003 are pre-existing sub-items of
R-001/R-002/R-004 respectively and do not warrant a new top-level register entry.
Suggest a backend team note under R-002 that op-type DTOs are unvalidated.

---

## Recommended actions (prioritised)

| Priority | Action | Route |
|---|---|---|
| P1 (next sprint) | Convert `CreateOpTypeDto` / `UpdateOpTypeDto` to class-validator classes; replace spread in `update()` | backend |
| P2 (next sprint) | Add `@CurrentUser()` to op-type mutation handlers; persist `create_uid/write_uid` | backend |
| P3 (backlog) | Add pagination max cap to history endpoints (`Math.min(limit, 200)`) | backend |
| P4 (backlog) | Restrict CORS `origin` per environment | devops / backend |

---

_Reviewed 2026-06-08 · security subagent (review-only) · OWASP API Top 10 2023 baseline_
