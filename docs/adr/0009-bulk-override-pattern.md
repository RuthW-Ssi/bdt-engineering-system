# ADR-0009 — Bulk Override Pattern

**Date:** 2026-04-29  
**Status:** Accepted  
**Sprint:** 4.3 (RT50–RT51)

## Context

Production engineering requires applying the same rate change (per_minute, std_measure, manpower) across dozens or hundreds of products that share a routing template or a structural characteristic (product type, mark prefix, JSONB attribute value). Doing this one product at a time through the RoutingEditor is impractical and error-prone.

## Decision

Implement a bulk override endpoint `POST /routing-overrides/bulk` with a `preview_only` flag:

1. **Criteria-based matching** — filter products by: `routing_template_id`, `product_type`, `mark_prefix`, `attribute_filter` (JSONB path + value). All criteria are ANDed.
2. **preview_only=true** — returns `matched_count`, `affected_products[]`, `skipped_count` without writing anything.
3. **preview_only=false** — runs inside a Prisma `$transaction`; calls `upsertRoutingOverride` per matched product; skips products where `has_custom_routing=true`.
4. **ECO gate (stub)** — `eco_id` field accepted but not enforced until Sprint 5.

The FE (`/admin/bulk-overrides`) follows a two-step UX: Find → Preview → Apply, requiring the user to see affected products before committing.

## Consequences

- Products with custom routing are intentionally skipped to preserve their structural independence.
- Large datasets (>1 000 products) may hit transaction timeout limits; a GIN index on `products.attributes` JSONB is recommended if attribute filtering is used at scale (Sprint 5 follow-up).
- Rollback of a bulk apply requires a second bulk call with the previous rate value; there is no automated undo.
