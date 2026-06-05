# Security Review — Schema Cleanup: Drop Orphan Tables

- **Task:** T-DROP-ORPHAN.01
- **Branch:** dev-t-drop-orphan
- **Reviewer:** security subagent (OWASP API Top 10 2023 baseline)
- **Date:** 2026-06-05
- **Scope:** Pure backend schema cleanup — no new endpoints, no auth changes, no new user inputs

---

## DECISION: PASS

Pure schema cleanup. No new endpoints, no auth changes, no new data exposure.
Removed FK includes reduce data surface area (positive).

---

## Scope summary

| File | Change |
|---|---|
| `backend/prisma/schema.prisma` | 23 orphan model blocks removed; `account_id` FK on `product_category` removed; `category_id` FK on `uom_uom` removed |
| `backend/src/modules/master-data/master-data.service.ts` | `include` of dropped FK relations (`category` on uom_uom, `account` on product_category) removed from `getUoms()` and `getCategories()` |
| `backend/prisma/migrations/20260605000000_drop_orphan_tables/migration.sql` | New migration: drops 23 tables + 2 FK columns + 6 enums |

---

## Findings

### 1. master-data.service.ts — getUoms() and getCategories()

**Status: PASS**

`getUoms()` is a minimal `findMany` filtered by `active: true`, ordered by `name`. No includes, no raw data passthrough. Clean.

`getCategories()` includes only `parent: { select: { id: true, name: true } }` — a deliberately scoped `select` (not a full relation dump). This is good hygiene. The `account` include that was removed previously existed in the schema; its removal narrows the data surface. No `account_account` financial data was ever returned via this endpoint in the post-cleanup state.

No `console.log`, `console.error`, or any logging of sensitive data found in the file.

**OWASP API3:2023 (BOPLA):** The `account` include removal is strictly positive — it eliminates a path that could have exposed `account_account` fields (chart-of-accounts/financial reference data) through a product-category lookup. After this change, `getCategories()` returns only: `id`, `name`, `complete_name`, `group_no`, `prefix_5`, `needs_criticality`, `active`, `odoo_ref_id`, and the scoped `parent { id, name }`. No financial or sensitive fields reachable.

**Note:** R-002 (full Prisma object leak) from the risk register still applies to this endpoint — `getCategories()` returns raw Prisma objects without a DTO wrapper. This is a pre-existing open risk, not introduced by this change.

### 2. Migration SQL — DROP TABLE statement audit

**Status: PASS**

Tables dropped (23 total):

| Table | Assessment |
|---|---|
| `account_account` | Orphan — Odoo accounting table, never used in active code |
| `assembly` | Orphan — superseded by `bom_assembly` (Sprint 7) |
| `assembly_part` | Orphan — superseded by `bom_assembly_part` |
| `bom_category` | Orphan — uom categorisation, unused |
| `bom_grade` | Orphan — steel grade lookup, superseded by inline field |
| `bom_mark_prefix` | Orphan — superseded by `mark_prefix_master` |
| `bom_project` | Orphan — superseded by `project` model |
| `bom_zone` | Orphan — superseded by `project_zone` |
| `dispatch` | Orphan — superseded by `bom_dispatch` (Sprint 7) |
| `dispatch_line` | Orphan — superseded by `bom_part` |
| `doc_revision` | Orphan — superseded by `bom_doc_revision` |
| `file_storage` | Orphan — superseded by Supabase Storage / `drawing_revision` |
| `material_doc_revision` | Orphan |
| `material_line` | Orphan |
| `part` | Orphan — superseded by `bom_part` |
| `product_template` | Orphan — Odoo concept not used in BDT |
| `product_variant` | Orphan |
| `project_product_cost` | Orphan |
| `promotion_request` | Orphan |
| `std_product` | Orphan |
| `steel_grade` | Orphan — superseded by inline grade fields on `materials` |
| `tekla_prefix_mapping` | Orphan — superseded by `mark_prefix_master` |
| `uom_category` | Orphan — uom grouping, unused after `category_id` FK removed |

**Critical check — active tables NOT in drop list:** `bom_dispatch`, `bom_assembly`,
`bom_assembly_part`, `bom_part`, `bom_doc_revision`, `mark_prefix_master`, `project`,
`project_zone`, `materials`, `product_category`, `uom_uom`, `res_users`, `products`,
`product_bom`, `product_bom_line`, `shop_drawing`, `drawing_revision`,
`mrp_workcenter`, `mrp_routing_workcenter`, `routing_template`, and all Sprint 4–7
active models — **none of these appear in the DROP TABLE list.** Confirmed safe.

**Naming collision check:** The orphan `assembly`/`dispatch`/`doc_revision` tables
(being dropped) are distinct from the active `bom_assembly`/`bom_dispatch`/
`bom_doc_revision` tables (kept). Backend code exclusively uses the `bom_`-prefixed
Prisma model names (`tx.bom_assembly`, `tx.bom_dispatch`, etc.). No collision risk.

**FK drop order:** All `ALTER TABLE ... DROP CONSTRAINT` statements precede the
`DROP TABLE` statements. Correct ordering — no constraint violation risk during
migration execution.

**Enums dropped (6):** `ChangeType`, `DispatchState`, `DocType`, `LineStatus`,
`SectionType`, `StdProductState` — all were bound exclusively to the orphan tables
being dropped. None are referenced in active schema models. Safe to drop.

**AlterTable:** `product_category.account_id` and `uom_uom.category_id` columns
dropped cleanly after their FK constraints are removed. No data loss risk to active
application logic — neither column is read or written by any active service.

### 3. Sensitive data exposure check — API3:2023 BOPLA

**Status: PASS (positive change)**

The `account` include on `product_category` was removed. `account_account` held
Odoo-style chart-of-accounts reference data (financial account codes). Its removal
means no API path can accidentally join and expose this data through
`GET /master-data/categories`. This is a **surface area reduction**, not a risk.

The `category` include on `uom_uom` was removed. This related to `uom_category`
(unit-of-measure grouping metadata — not financial data). Its removal is neutral;
no sensitive data involved.

### 4. A09:2021 — Security Logging and Monitoring

**Status: PASS**

No `console.log`, `console.error`, `console.warn`, or `console.debug` calls found
in the modified file (`master-data.service.ts`). No new logging of sensitive data
introduced.

### 5. Risk register cross-check

No new risks introduced. Pre-existing open risks (R-001 through R-006) are
unaffected by this change. R-002 (BOPLA — no DTO wrapper on responses) remains
open and technically applies to `getCategories()` as noted above, but this is
a pre-existing condition, not a regression from this task.

---

## OWASP coverage summary

| Category | Applicable? | Result |
|---|---|---|
| API1:2023 BOLA | No — no new endpoints | N/A |
| API2:2023 Broken Auth | No — no auth changes | N/A |
| API3:2023 BOPLA | Yes — FK include removals | PASS (positive: surface reduced) |
| API4:2023 Resource Consumption | No — no new endpoints | N/A |
| API5:2023 Broken Function Level Authz | No — no new endpoints | N/A |
| API6:2023 Sensitive Business Flow | No — no new flows | N/A |
| API7:2023 SSRF | No — no URL/redirect handling | N/A |
| API8:2023 Security Misconfiguration | No — no config changes | N/A |
| API9:2023 Improper Inventory | Yes — 23 tables removed from inventory | PASS (positive: dead surface removed) |
| API10:2023 Unsafe API Consumption | No — no third-party calls | N/A |
| A09:2021 Logging & Monitoring | Yes — checked for new logging | PASS |

---

_Signed off by security subagent. Routed to devops to proceed with commit/push._
