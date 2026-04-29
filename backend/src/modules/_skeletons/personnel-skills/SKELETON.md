# 🟡 SKELETON — `personnel-skills` (Sprint 6)

**Tag:** 🟨 Hybrid
**Practice basis:** ISA-95 PersonnelSpec · AWS D1.1 / TIS 2543 welder certification · BDT operator/skilled/group-head split

## Why this exists as a skeleton

Sprint 4 `routing_activity_template.manpower` is just a count. For code-compliant steel fabrication:

- **Welders must be certified** — AWS D1.1 §4 (procedure qualification) + §6 (welder qualification)
- **NDT inspectors must be certified** — ASNT SNT-TC-1A (MT/PT/UT/RT levels)
- **Crane operators** — TIS 2543 (Thai standard)

Without skill matrix:
- Cannot validate "this WO needs an AWS-certified welder, but only operators are scheduled"
- Cannot generate audit trail for compliance review
- Cannot expire certifications and trigger renewal

Schema in `prisma/schema.skeleton.prisma` Section 5.

## Sprint 6 implementation checklist

- [ ] Migrations: `personnel_skill` + `personnel_skill_assignment` + `routing_activity_skill_req`
- [ ] Seed standard skills: AWS D1.1 (FCAW/SMAW/GMAW/SAW), TIS 2543, NDT MT/PT L1/L2, Crane Op
- [ ] Activity → skill requirement seeding: tack-weld activities require AWS-D1.1 (any), buildup-weld requires AWS-D1.1 SAW, NDT activities require ASNT MT-L2
- [ ] Schedule validator: when planning WO, check assigned operator has ≥ min_level for activity skill
- [ ] Cert expiry cron: 60 days before expiry → notify; 0 days → block scheduling for that activity
- [ ] FE: skill matrix grid (employees × skills, cell colour by level) + cert document upload

## Levels

- `trainee` — under supervision only
- `operator` — can perform under group-head review
- `skilled` — independent
- `expert` — can train + sign-off

## FK dependencies

- ✅ `res_users` (Sprint 1)
- ⏳ `routing_activity_template` (Sprint 4)
- ✅ `shop_drawing` (Sprint 3) — for cert document upload reuse
