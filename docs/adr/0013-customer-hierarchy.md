# ADR-0013 — Customer Hierarchy: res_partner Subset

**Date:** 2026-05-08
**Status:** Accepted
**Sprint:** 6 (Auth dev mode + PM Foundation)

---

## Context

Sprint 6 introduced the Project Management Foundation: a Customer → Project → Zone → Sub-zone
hierarchy to track which steel structures belong to which client site and zone.

The team needed to decide how to model the `Customer` entity. Options were: (a) create a
standalone `customer` table, or (b) model it as a subset of Odoo's `res_partner` table.

---

## Decision

Model Customer as a subset of Odoo's `res_partner` table.

- Table: `res_partner` with `is_company=true`, `active` flag, `customer_rank` field.
- Existing Odoo field naming preserved (`name`, `ref`, `phone`, `email`, `active`).
- `project` gains `customer_id FK → res_partner` (nullable for backwards compat; required on new projects).
- `project_zone.zone_type` column removed — no domain use case found.
- `project_zone.erection_sequence` added for ordered zone display and drag-drop reorder.
- `sub_zone` table added as child of `project_zone`.

---

## Consequences

- Odoo sync compatibility maintained — `res_partner` rows can be exchanged with Odoo without schema mismatch.
- Frontend PM hierarchy (CustomerList → ProjectList → ZoneList → SubZoneList) is fully wired.
- Sub-zone depth is fixed at one level; deeper nesting deferred until a concrete use case arises.

---

## See also

- Implementation detail: [wiki/features/customers-projects.md](../../knowledge-base/projects/bdt-engineering-system/wiki/features/customers-projects.md)
- Data model: [wiki/tech/data-model.md](../../knowledge-base/projects/bdt-engineering-system/wiki/tech/data-model.md)
