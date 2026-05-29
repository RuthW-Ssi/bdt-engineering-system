# Sprint 4.2 — Cycle Time Compute Audit

**Date:** 2026-04-29  
**System:** BDT App — Routing Option 3 (Hybrid Template + Override + Custom)  
**Tolerance target:** ±15% vs MO production sheet

---

## Product: CUS-00001 — COLUMN WH-CO-1

**Attributes:** weight_kg=454, length_mm=8459, width_mm=240, height_mm=1143, paint_area_m2=16.814

### Template path (no overrides)

| Op | Workcenter | Computed (min) |
|----|-----------|---------------|
| buildup_fit | WC-BU | 55.0 |
| buildup_welding | WC-BU | 82.5 |
| fitup | WC-AS | 15.0 |
| welding | WC-AS | 30.0 |
| painting | WC-PT | 15.0 |
| **Total** | | **197.5** |

**MO sheet reference:** ~210 min (±6.3%) ✅ within 15% tolerance

### With override test (activity 1: per_minute 10→15)

| Activity | Base per_min | Override per_min | Δ cycle time |
|----------|-------------|-----------------|-------------|
| 3.1 ยกชิ้นงานขึ้น Jig | 10 | 15 | formula=0 (no sumWeight attr) |

> Note: Activities using `sumWeight`, `count_part`, `sumNet_surface_area` return 0 because product attributes use different key names (`weight_kg` vs `sumWeight`). These formulas will resolve when product attribute mapping is standardised in Sprint 5.

---

## Product: CUS-00001 — Custom Routing path

After converting to custom routing (cloned from Main template) and deleting `buildup_fit` op:

| Op | Workcenter | Computed (min) |
|----|-----------|---------------|
| buildup_welding | WC-BU | 82.5 |
| fitup | WC-AS | 15.0 |
| welding | WC-AS | 30.0 |
| painting | WC-PT | 15.0 |
| **Total** | | **142.5** |

Delta vs template: −55 min (−27.8%) — expected, 1 op removed.

---

## Summary

| Product | Path | Computed (min) | MO Sheet (min) | Δ% | Status |
|---------|------|---------------|----------------|-----|--------|
| CUS-00001 | Template (Main) | 197.5 | ~210 | −6.3% | ✅ |
| CUS-00001 | Custom (4 ops) | 142.5 | N/A — no MO yet | — | — |

### Known gaps (Sprint 5 action items)
- `sumWeight`, `count_part`, `sumNet_surface_area`, `product_length` formula params expect attribute keys that differ from product JSONB keys → align attribute schema in Sprint 5
- Only 1 product verified; full audit requires binding 10+ products and comparing with MO Tekla export
