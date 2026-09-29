# Security Review — Operator nationality LA accepted

- **Scope:** `git diff origin/staging origin/dev-t-operator-nationality-la` (release-gate), 1 commit
  `a81285b`: `CreateOperatorDto` / `UpdateOperatorDto` `@IsIn(['TH','MM'])` → `@IsIn(OPERATOR_NATIONALITIES)`
  (`['TH','MM','LA']`), plus a DTO spec.
- **Reviewer:** `security` role (general-purpose agent), OWASP API Top 10 2023 baseline.
- **Date:** 2026-09-29
- **Read-only review.** No source modified, nothing committed.
- **Verdict: PASS** — no Critical/High/Medium findings. 1 Info.

---

## Checks performed

| Check | Result |
|---|---|
| Guards on touched endpoints | Unchanged. `MachinesController` class-level `@UseGuards(JwtAuthGuard, PermissionGuard)`; operator create = `machines:create`, update = `machines:update`. |
| Input validation | Still a strict allowlist (`@IsIn`) with the same `@IsOptional()`. The spec proves `XX` is rejected on create and update. The only change is one extra 2-char literal. |
| Storage | `operator.nationality` `VarChar(10)`, written through Prisma parameterized create/update (`machines.service.ts:139,161`). No raw SQL. |
| Output / rendering | Rendered as React text in `ResourceList.tsx:448` (auto-escaped). Not used in PDF, export, filename, header or query. |
| New attack surface | None. No new endpoint, param, dependency, secret or logging. |
| Secret grep on diff | Clean. |

---

## Findings

### F-001 · Info · API8:2023 Security Misconfiguration (hardening) — mutable exported allowlist

- **Where:** `backend/src/modules/machines/dto/create-operator.dto.ts:6`
- **What:** `OPERATOR_NATIONALITIES` is an exported mutable array, and `@IsIn` keeps a reference to it.
  In theory, any module that did `.push()` on it would widen validation at runtime. No code does
  this today.
- **Fix (route → backend, optional):** `export const OPERATOR_NATIONALITIES = ['TH','MM','LA'] as const`
  (or `Object.freeze`).

---

## OWASP delta

No change to the API Top 10 state table. No new risk-register entry.
