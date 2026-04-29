# 🟡 SKELETON — `capacity-planning` (Sprint 7)

**Tag:** 🟨 Hybrid (Siemens Opcenter APS approach)
**Practice basis:** Siemens Opcenter APS · finite/infinite capacity · APICS S&OP

## Why this exists as a skeleton

Sprint 4 stores `mrp_workcenter.capacity_per_period_json` as a snapshot. Sprint 7 turns it into a **time-bucketed plan** with:

- Available capacity (raw × OEE × time_efficiency)
- Committed capacity (sum of WO durations scheduled into bucket)
- Reserved capacity (sales forecast pull)
- Utilisation % per bucket

Used for:
- Quote feasibility check ("can we deliver in week 22?")
- Bottleneck identification before MO confirm
- Sales-Operations Planning reviews

Schema in `prisma/schema.skeleton.prisma` Section 8.

## Sprint 7 implementation checklist

- [ ] Migration: `mrp_workcenter_capacity_plan`
- [ ] Bucket auto-create: cron creates next-26-weeks buckets per WC every Monday
- [ ] Available compute: pull from WC working_hours_per_week × oee × time_efficiency
- [ ] Committed compute: SUM(workorder.duration_expected) where date_planned_start in bucket
- [ ] Capacity gate on MO confirm: warn if any WC bucket > 100% utilisation
- [ ] FE: capacity heatmap — WC × week, cell colour green/yellow/red
- [ ] FE: drill-down — click cell → list of WOs in bucket

## Future extensions (Sprint 8+)

- Finite scheduling solver (CP-SAT / OR-Tools)
- Alternate WC routing (use `mrp_workcenter.alternative_workcenter_ids`)
- Multi-objective: min lateness + min WIP + max throughput
