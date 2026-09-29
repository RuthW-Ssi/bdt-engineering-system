# Security Review — Print Language Toggle + OperationBuilder Consumables Fix + MO Actual Finish

- **Scope:** `git diff origin/staging origin/dev` (release-gate), 3 feature commits:
  - `78d2ab9` — `lang` query param on `GET /mo/:id/print-packet` (`parsePrintLang`),
    new `mo-print-labels.ts` dictionary, PDF font embedding `subset: true`,
    Print dialog language toggle (`src/pages/MoDetail.tsx`, `src/api/mo.ts`)
  - `f626b69` — `OperationBuilder` no longer sends consumables for
    library-linked activities (`consumablesPayload`)
  - `b4edbba` — MO `changeStatus` → `DONE` sets `actual_finish`
- **Reviewer:** `security` role (general-purpose agent), OWASP API Top 10 2023 baseline.
- **Date:** 2026-09-29
- **Read-only review.** No source modified, nothing committed.
- **Verdict: PASS** — no Critical/High/Medium. 1 Low (pre-existing, surfaced by
  f626b69), 3 Info.

---

## Checks performed

| Check | Result |
|---|---|
| Guards on touched endpoints | Unchanged. `ManufacturingOrderController` class-level `@UseGuards(JwtAuthGuard, PermissionGuard)`; `print-packet` = `orders:view`, `PATCH :id/status` = `orders:update`. `OperationTemplatesController` = `routings:create/update`. |
| `lang` input validation | Strict allowlist: `parsePrintLang(raw) => raw === 'th' ? 'th' : 'en'` (`mo-print-labels.ts:171`). Raw value never reaches the PDF, headers or a filename. |
| User-controlled text in PDF | Only static label strings changed. Label helper functions (`assemblyQty`, `minutes`, `moreSeeQr`) interpolate server-derived numbers/qty. Data values (mo_code, project name, zone) rendered exactly as before. |
| Response headers | Still only `Content-Type: application/pdf`; no `Content-Disposition`/filename derived from input. |
| Font `subset: true` | Rendering-only change (glyph subsetting). No security impact. |
| Operation-template DTO | Class-validator DTO in place (`routings/dto/operation-template.dto.ts:17-40`; R-015's interface-DTO issue for this endpoint is resolved on `dev`). `ConsumableInputDto.resource_id` is `@IsInt()`. |
| Prisma error leakage | `LoggingExceptionFilter` delegates to Nest `BaseExceptionFilter`, which returns a generic `{"statusCode":500,"message":"Internal server error"}` for non-HttpException errors. Prisma P2003 text is logged server-side only, not returned to the client. |
| `actual_finish` mass assignment | Server-set (`new Date()`), not from `ChangeStatusDto` (only `to_status`, `reason`). `DONE` is terminal (`ALLOWED_TRANSITIONS.DONE = []`), so it can't be re-triggered to overwrite. |

---

## Findings

### F-001 · Low · API8:2023 Security Misconfiguration (improper error handling) / A04:2021 Insecure Design — consumables rule enforced client-side only

- **Where:** `backend/src/modules/routings/services/operation-template.service.ts:374-379`
  (`_createJunctions` writes `a.consumables` → `op_act_material` with no existence
  check and no `source_activity_id` check); client-side fix at
  `src/pages/OperationBuilder.tsx:50-56` (`consumablesPayload`).
- **What:** f626b69 fixes the 500 by having the client stop sending consumables for
  library-linked activities. The server still accepts `consumables` on any activity
  and does not check that `resource_id` exists in `equipment_resource`.
- **Failure scenario:** An authenticated user with `routings:create/update` sends
  `POST/PATCH /operation-templates` directly (or an older cached frontend bundle does)
  with
  1. a nonexistent `resource_id` → FK violation (P2003) → the whole publish returns 500 instead of 400; or
  2. a valid `resource_id` on an activity with `source_activity_id` set → persists
     `op_act_material` rows that the UI treats as read-only and that MO/WO/routing
     ignore (they read from the source activity), which leaves inconsistent data.
  No Prisma text leaks (generic 500 body), and the caller has to be authorized, so the
  impact is limited to data integrity and a misleading error. This behavior existed
  before this diff.
- **Fix (route → backend):** In `_createJunctions` (or before the transaction), ignore
  or reject `consumables` when `source_activity_id` is set. Check that the
  `resource_id`s exist, the same way `assertWorkcenters` does, and throw
  `BadRequestException`. Optionally map Prisma `P2003` → 400 in the global filter.

### F-002 · Info · API1:2023 BOLA — print-packet unchanged, already accepted

- **Where:** `manufacturing-orders.controller.ts:170-196`
- The new `lang` param doesn't change the object-level authorization of
  `GET /mo/:id/print-packet` (any `orders:view` user, any MO id). This is already
  tracked under R-001 (accepted print-packet BOLA). It is not a new finding.

### F-003 · Info · A09:2021 — `actual_finish` audit coverage

- **Where:** `manufacturing-orders.service.ts:667-669`
- `actual_finish` is written in the same transaction as the `mo_status_history` row
  and before the `mail.log` audit entry, so its value can be traced from the DONE
  history timestamp. Note: `UpdateMoDto` (`dto/update-mo.dto.ts:34,38`) already let
  `orders:update` users set `actual_start`/`actual_finish` by hand before this diff,
  so they can overwrite the auto-recorded value. That is existing behavior and outside
  this diff. Revisit if Actual Finish becomes an auditable KPI.

### F-004 · Info — font subsetting / label dictionary

- `subset: true` and the static `EN`/`TH` label maps add no attack surface. Unknown
  `lang` values fall back to `en` silently, which is correct fail-safe behavior.

---

## Risk register

No new risk class. F-001 fits the existing input-validation-at-boundary theme (R-015
family). R-015's operation-template instance appears resolved on `dev` (the DTO is now a
class-validator class). The risk-register owner should confirm this and move it to
Mitigated.
