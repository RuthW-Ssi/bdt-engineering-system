# 🟡 SKELETON — `mrp-productivity` (Sprint 5)

**Tag:** 🟦 Standard Odoo
**Practice basis:** Odoo 17 `mrp.workcenter.productivity` + `mrp.workcenter.productivity.loss` · ISA-95 Equipment Performance
**Replaces xlsx:** N/A — currently no actual downtime tracking; xlsx OEE is forecast only

## Why this exists as a skeleton

Sprint 4 stores `availability` / `performance` / `quality` as static fields (forecast). Real OEE measurement requires a **time-series log** of every uptime/downtime block. Without this:

- Cannot compute actual A% — only target
- Cannot diagnose WC bottleneck causes (material shortage vs tool break vs power)
- Cannot generate variance reports (planned vs actual)

Schema in `prisma/schema.skeleton.prisma` Section 2.

## Sprint 5 implementation checklist

- [ ] Migration: `mrp_workcenter_productivity` + `mrp_workcenter_productivity_loss`
- [ ] Seed loss reasons (~12 standard categories per Odoo): material_shortage, tool_break, power_outage, setup_time, training, planned_maint, etc.
- [ ] API: `POST /workcenters/:id/productivity_block` (start/end pairs)
- [ ] Cron job: every hour, recompute `mrp_workcenter.availability` from last-30d productivity log
- [ ] FE: WC dashboard widget — pareto chart of loss reasons (week/month)

## Computed metric (Sprint 5)

```
For workcenter wc, period [t1, t2]:
  total_planned_min  = (t2 - t1) × time_efficiency
  total_downtime_min = sum(prod.duration) where prod.loss.loss_type='availability'
  availability%      = (total_planned_min - total_downtime_min) / total_planned_min × 100
```

## FK dependencies

- ⏳ `mrp_workcenter` (Sprint 4)
- ⏳ `mrp_workorder` (Sprint 5 sibling)
- ✅ `res_users` (Sprint 1)
