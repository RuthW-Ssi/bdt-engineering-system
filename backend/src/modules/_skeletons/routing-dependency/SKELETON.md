# 🟡 SKELETON — `routing-dependency` (Sprint 5)

**Tag:** 🟨 Hybrid (extends Sprint 4 Routing)
**Practice basis:** ISA-95 ProcessSegmentDependency · Siemens Opcenter Process Segment graph

## Why this exists as a skeleton

Sprint 4 `mrp_routing_workcenter.blocked_by_op_ids` is a flat `INT[]` (sequential only). ISA-95 + Siemens model dependencies as a **typed graph**:

- `sequential` — predecessor must finish before successor starts
- `parallel` — both run simultaneously (separate machines)
- `exclusive` — only one of N can run (jig contention, e.g., buildup-fit vs buildup-weld share Jig-A)
- `alternate` — either path satisfies (Plate Plasma OR Plate Gas for the same cut)

Sprint 5 adds:
- **lag_min** — wait time between predecessor and successor (e.g., paint dry time = 120 min between primer and fireproof)
- Typed dependency table replaces flat `INT[]`

Schema in `prisma/schema.skeleton.prisma` Section 4.

## Sprint 5 implementation checklist

- [ ] Migration: `routing_op_dependency` table
- [ ] Migration: drop `blocked_by_op_ids INT[]` from Sprint 4 (or keep as denorm cache)
- [ ] DAG validator: reject cycle insertion, max-depth check
- [ ] Jig contention solver: parallel ops sharing `shared_resource_tag` cannot overlap → schedule sequential
- [ ] FE: graph visualisation (Mermaid or D3) on RoutingEditor — replace current flat list with DAG view
- [ ] Recompute affected: when dependency changes, recompute earliest-start-time per op

## Use cases (steel domain)

```
Built-up beam:
  buildup-fit ─[seq]─→ buildup-weld          (jig occupied)
  buildup-fit ─[exclusive jig-A]─ buildup-weld   ← shared resource

Painting:
  primer ──[seq, lag=120min]──→ fireproof      (drying)
  fireproof ──[seq, lag=240min]──→ topcoat     (drying)

Cutting (parallel):
  cut-plate-A ─[parallel]─ cut-plate-B          (separate CNC)
```
