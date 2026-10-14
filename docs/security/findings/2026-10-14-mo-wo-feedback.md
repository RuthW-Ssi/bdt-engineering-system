# Security review — MO/WO user feedback (S38-T09–T15)

- Date: 2026-10-14 · Reviewer: security role (review-only)
- Scope: `git diff origin/dev...HEAD` on `dev-t-mo-wo-feedback` (commit 5307dd8)
- Baseline: OWASP API Security Top 10 (2023)

## Verdict: PASS (2 Low, informational)

No Critical/High/Medium findings.

## Checks performed

| Area | Result |
|---|---|
| AuthN on changed endpoints | Controllers `mo` / `wo` class-level `@UseGuards(JwtAuthGuard, PermissionGuard)` — unchanged |
| Function-level authz (API5) | `PATCH /wo/:id/marks/:markId/progress` = `orders:update`; `GET /mo/:id/assemblies`, `/mo/:id/parts` = `orders:view` — unchanged |
| BOLA (API1) on mark progress | Mark loaded via `work_order.marks where id=markId` and `updateMany where { id: markId, work_order_id: id, removed_at: null }` — cross-WO mark tampering not possible |
| New data on MO assemblies/parts (API3) | Adds `wo_id`, `wo_code`, `status`, qty fields, `actual_finish` for the MO's **own** non-cancelled WOs. All are already exposed to the same `orders:view` holder by `GET /wo/:id` and `GET /wo` list. No new privilege boundary crossed. Parts endpoint actually **narrows** exposure: cross-MO `mo_breakdown` (other MOs' codes in the same zone) replaced by this MO's own `wo_breakdown`. |
| Customer exposure | MO/WO controllers carry no `@CustomerAccessible`; global `CustomerScopeInterceptor` default-denies customer users (403). No change. |
| Input validation (API3/A03) | `actual_finish`: `@IsOptional() @IsISO8601()` + service `parseMarkFinish` (NaN → 400, future > now+5min → 400). NS+IP+Done now `=== planned` (stricter). Timeliness vs `plan_finish` enforced server-side on Done + edit-actuals, not just in UI. |
| Injection | Prisma query builder only; no `$queryRaw` in diff. Frontend diff has no `dangerouslySetInnerHTML` / `innerHTML`. |
| Audit integrity (A09) | `actual_finish` change recorded in the same `PROGRESS_UPDATE` `work_order_event.changes` (old→new ISO, `recorded_by`), inside the same transaction as the update. Clearing (QC Passed drops below qty) is also logged. |
| Error leakage | Only fixed BadRequest/Conflict messages; no stack/DB detail. |
| Migration | Additive nullable `TIMESTAMPTZ` column; no data risk. |

## Findings

### L1 — `actual_finish` not covered by optimistic-concurrency check (Low · API6/A04 integrity)
- Where: `backend/src/modules/work-orders/work-orders.service.ts:791-800`
- What: `expected` (stale check) covers only the six qty fields. If two users have a mark at QC Passed = Quantity with identical qtys and each types a different finish date, the second save silently overwrites the first (no 409). The audit row's `old` comes from the in-tx read, so history still shows both changes — no silent history loss, just a last-write-wins on the date.
- Fix (be): optionally add `expected.actual_finish` to the WHERE. Acceptable as-is.

### L2 — No lower bound on per-mark `actual_finish` (Low · API3 data quality)
- Where: `backend/src/common/actual-dates.ts:32-41`, DTO `update-mark-progress.dto.ts:26`
- What: any past ISO date (e.g. `1900-01-01`, or before WO `actual_start`/creation) is accepted. `@IsISO8601()` is non-strict, so `2026-02-30` passes and JS rolls it to 2026-03-02. Impact limited to wrong report data typed by an authorized `orders:update` user; audited.
- Fix (be): `@IsISO8601({ strict: true })`; optionally reject finish before WO actual_start / created_at.

## Notes (non-security)
- "On Plan" now prefills actual dates from plan dates (`ActualDatesModal.tsx` `choosePlan`) — user-requested, still user-confirmed; flag only as a deliberate relaxation of the 2026-10-01 "never prefilled" rule.

## OWASP API table delta
No change to the role-card table.
