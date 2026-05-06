# ADR-0005 — Routing Pattern: Hybrid Template + Override + Custom (Option 3)

**Status:** Accepted  
**Date:** 2026-04-29  
**Sprint:** 4.2  
**Authors:** Architecture team

---

## Context

Sprint 4.1 implemented "per-product clone" routing — each product gets its own set of `mrp_routing_workcenter` rows (`product_id = X`). This works correctly for small catalogs but fails at scale:

- **50,000+ custom products** → 50,000 × 5 ops = 250,000 routing rows
- Every template update requires mass re-clone across all products
- No visibility into which products deviate from the standard process

Three patterns were evaluated:

| Option | Description |
|--------|-------------|
| **Option 1** | Per-product clone (Sprint 4.1 baseline) |
| **Option 2** | Pure template — all products share one template, no per-product variation |
| **Option 3** | Hybrid: shared template + sparse override rows + custom routing escape hatch |

See `GAP_ANALYSIS_ROUTING_PATTERN.md` for full evaluation matrix.

---

## Decision

**Option 3 — Hybrid Template + Override + Custom** was selected.

### Data model

```
routing_template (shared)
  └── mrp_routing_workcenter (op rows, template_id FK)
       └── routing_op_activity (junction: op → activity_template)
            └── routing_activity_template (formula + defaults)

products
  ├── routing_template_id  → inherits template ops (Class A/B: ~95% of products)
  └── has_custom_routing   → uses custom_routing instead (Class C: ~5%)
       └── custom_routing
            └── custom_routing_op
                 └── custom_routing_activity

product_routing_override (sparse)
  └── (product_id, activity_template_id) UNIQUE
       → override_per_minute / override_std_measure / override_manpower
```

### Binding rules

Products are assigned templates automatically via `routing_template_binding_rule` (priority-ordered rules engine). Manual override via `POST /products/:code/rebind`.

---

## Consequences

### Positive
- **Scale:** 50,000 products share 5 template ops → 41 junction rows total (vs 250,000)
- **Auditability:** overrides are explicit sparse rows — easy to see what changed
- **Flexibility:** custom routing escape hatch for structurally different products (Class C)
- **Template updates:** change template → all bound products pick it up immediately on next recompute
- **Frontend:** Inherited/Overridden badges make it visible which activities deviate

### Negative / Trade-offs
- **Complexity:** 3 code paths in CycleTimeService (`computeFromTemplate`, `computeCustomRouting`, unbound → 400)
- **ECO gate deferred:** Override changes on products with confirmed MOs should require an ECO ref; stubbed to always-pass in Sprint 4.2 (Sprint 5 action item)
- **Attribute naming gap:** Formula params use keys like `sumWeight` that differ from product JSONB keys like `weight_kg`; alignment deferred to Sprint 5

### Sprint 5 action items
- ECO gate: `hasConfirmedMO()` check in `OverrideService.upsertOverride()`
- Attribute key mapping: normalise product JSONB keys to match formula param variable names
- WO snapshot: `mrp_workorder.activity_snapshot` — copy routing activity state at work-order creation time

---

## Alternatives considered

### Option 2 — Pure template (rejected)
Too rigid. Steel fabrication has legitimate per-product deviations that cannot be encoded purely in formula parameters.

### Option 1 — Per-product clone (rejected for large catalog)
Acceptable for < 500 products but fails at 50,000+. Template updates require mass re-cloning.
