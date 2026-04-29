# ADR-0010 — Custom Routing Promotion Pattern

**Date:** 2026-04-29  
**Status:** Accepted  
**Sprint:** 4.3 (RT54)

## Context

When the same structural routing (same op_code sequence) is replicated across 3 or more products as custom routings, maintaining them individually creates drift risk. A shared template would let all products inherit rate changes centrally.

## Decision

Implement a promotion flow:

1. **Candidate detection** — `GET /custom-routings/promotion-candidates` groups all active custom routings by their sorted op_code sequence key (e.g. `WC-BU:WC-AS:WC-PT`). Groups with `count ≥ 3` are returned as promotion candidates.
2. **Promote** — `POST /custom-routings/:id/promote-to-template` with `{ template_name }`:
   - Creates a new `routing_template` in `draft` state.
   - Clones the source custom routing's ops and activities into the template (resolving or creating `routing_activity_template` rows as needed).
   - Sets the source product's `has_custom_routing = false` and `routing_template_id` to the new template.
   - Returns `{ template_id, template_code, rebound_product_ids }`.
3. **FE suggestion banner** — `CustomRoutingEditor` polls promotion candidates and shows a green banner when the current product belongs to a group with `count ≥ 3`. Clicking "Promote to Template" prompts for a template name.

## Similarity algorithm

Two custom routings are considered structurally similar if their sorted op_code arrays produce the same join key. Activity-level matching is intentionally not required at promotion time; activity templates are resolved by `formula_param_code` (or created fresh if not found).

## Consequences

- Only the source custom routing's product is rebound automatically. Other products in the same group require a manual rebind or a separate promote call.
- The promoted template starts in `draft` state and must be activated separately.
- Promotion does not delete the source `custom_routing` record; it becomes orphaned (with `product.has_custom_routing = false`) and can be cleaned up in a future maintenance sprint.
