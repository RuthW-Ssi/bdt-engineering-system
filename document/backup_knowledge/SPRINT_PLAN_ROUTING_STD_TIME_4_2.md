# Sprint 4.2 Implementation Plan — Routing Pattern Option 3 (Hybrid) + Template Simulator

> **Project:** BDT Engineer Management System
> **Sprint:** 4.2 (follow-up to 4.1 Routing+Std Time)
> **Length:** **6 working days**, 2 devs (≈ **100 h** capacity) — *amended 2026-04-29 to include Template Simulator (Epic F)*
> **Date:** 2026-04-29 (planning) — kickoff after Sprint 4.1 lands
> **Architecture:** Monolith — extends Sprint 4.1 routing module
>
> **🎯 Sprint Goal:** (1) เปลี่ยน routing schema จาก per-product-clone (Option 1 default) → **Hybrid Option 3** ที่อิง template เป็นหลัก + sparse override + custom_routing escape hatch — เพื่อรองรับ custom products 50,000+ ต่อโปรเจกต์โดยไม่เกิด data explosion; (2) เพิ่ม **Template Simulator** ในหน้า Routing เพื่อให้ engineer ลองคำนวณกับ custom product จริงหรือ manual input ก่อน publish template
>
> **Companion docs:**
> - [`GAP_ANALYSIS_ROUTING_PATTERN.md`](./GAP_ANALYSIS_ROUTING_PATTERN.md) — pattern decision (Option 3 chosen 2026-04-29)
> - [`ROUTING_TEMPLATE_SIMULATOR_DESIGN.md`](./ROUTING_TEMPLATE_SIMULATOR_DESIGN.md) — simulator UX/API/edge-case design (Epic F basis)
> - [`SPRINT_PLAN_ROUTING_STD_TIME.md`](./SPRINT_PLAN_ROUTING_STD_TIME.md) — Sprint 4.1 baseline (this 4.2 supersedes its routing-table schema)
> - [`GAP_ANALYSIS_ROUTING_STDTIME.md`](./GAP_ANALYSIS_ROUTING_STDTIME.md) — original gap analysis
> - [`STANDARDIZE_VS_CUSTOM_ODOO.md`](./STANDARDIZE_VS_CUSTOM_ODOO.md) — Odoo ADR
>
> **Prerequisite:** Sprint 4.1 modules merged + migrated (`mrp_workcenter` + `routing_activity_template` + `routing_formula_param` + Cycle Time Engine + FormulaService)
>
> **What carries over from 4.1 unchanged:**
> - `mrp_workcenter` — full Odoo+ISA-95 schema (4 work centers)
> - `routing_activity_template` — 923 activity rows from xlsx
> - `routing_formula_param` — 19 formula parameters
> - `FormulaService` — safe expression evaluator
> - `CycleTimeService` — gets a 1-line addition (merge overrides)
> - `WorkcenterMaster` page — UX unchanged
> - `ActivityTemplateMaster` page — UX unchanged

---

## 1. Decisions baked in (from `GAP_ANALYSIS_ROUTING_PATTERN.md` §11)

These 4 design choices are committed in Sprint 4.2. **User can override before kickoff** by editing this section; otherwise these are the defaults Claude Code implements:

| # | Question | Decision (default) | Rationale |
|---|---|---|---|
| **D1** | Auto-bind rule storage | `routing_template_binding_rule` **table** (engineer-editable via admin page) | Hard-coded rules in service = re-deploy on every taxonomy change. Table = ops-friendly. |
| **D2** | Override approval timing | **Free** during `products.state='draft'` AND no MO confirmed; **ECO-required** after first MO `action_confirm` | Engineering iteration is unrestricted before production starts; once MO lives, governance kicks in. |
| **D3** | Custom Routing badge visibility | **Prominent**: shown in BOM view header, ProductDetail header, RoutingEditor banner — orange/amber colour | Engineers must see this at a glance — hidden custom routings cause production surprises |
| **D4** | WO snapshot timing | At MO `action_plan` (Sprint 5 will enforce; Sprint 4.2 ships the snapshot data structure) | Recipe must be locked before scheduling — `action_confirm` is too early (still tweaking), `action_start` is too late (already scheduling) |
| **D5** | RT47 (test fixtures + Compare) | **In scope** — Sprint 4.2 ships full simulator including fixture save + sensitivity Compare | User chose Option D (6-day budget) over deferring RT47 — full feature parity now beats round-trip later |
| **D6** | `default_input_spec` editability | Any user with `routing_template` edit permission (same RBAC as state changes) | Simplest model — no extra RBAC tier; engineers who can change template can curate its baseline |
| **D7** | Result chart library | **Custom CSS bars** (no extra dependency) | Matches existing UX in `documents/session-*.html`; no Recharts/Chart.js bundle bloat for a simple horizontal bar |
| **D8** | Result content | Show **both cycle time + std cost** | Both already computed in same pipeline (Sprint 4.1 RT8 StdCostService) — free to display, more useful to engineers |
| **D9** | Last-simulation persistence | `localStorage` keyed by `template_id + user_id`; auto-clears when template version bumps | Survives page refresh + tab close without DB writes; staleness handled by version-key invalidation |
| **D10** | RT47 Compare scope | **Same template, 2 input sets** (sensitivity analysis) — cross-template Compare deferred to Sprint 5+ | Sensitivity is the immediate engineering need ("what if 1500kg vs 2000kg?"); cross-template requires more thought (different op sets) |
| **D11** | Override survival on ECO | Default `survive`; ECO opt-in `reset` or `reset_matching` | Match AISC WPS practice — overrides usually exist for valid steel-domain reasons |
| **D12** | Versioning model | **3-layer**: history tables (Layer 1 — this sprint) + active row version (Layer 2 — already in 4.2) + WO snapshot (Layer 3 — Sprint 5) | All three needed for full governance; cheap to ship history now, expensive to backfill later |
| **D13** | Bulk override (flavour 3b) | **Sprint 4.3** — 4.2 ships history tables only | Per Option E — separates structural change (history, this sprint) from feature (bulk, next sprint) |
| **D14** | Bulk override criteria includes `attribute_filter` | Yes — supports `attributes.material_grade='SS400'` etc. | Engineer's first ask — basic FK criteria too narrow |
| **D15** | In-flight WO behaviour on ECO apply | Auto re-snapshot WOs in `state ∈ {pending, ready}`; freeze `state ∈ {progress, done}` | "Not started yet" should pick up new recipe; in-flight production frozen |
| **D16** | Bulk override skips `has_custom_routing=true` | Yes, with explicit warning + count in result | Custom routings opted out of template path — bulk template-side overrides don't apply |

---

## 2. Sprint 4.2 Scope

### 2.1 In-scope ✅

- **Schema migration** — replace 4.1's `mrp_routing_workcenter (with product_id)` with template-only model
- **7 new tables** (all schema inline below in §3): `routing_template`, `routing_op_activity` (junction), `product_routing_override`, `custom_routing`, `custom_routing_op`, `custom_routing_activity`, `routing_template_binding_rule`, `routing_template_test_fixture`
- **4 services** — `TemplateBindingService` (auto-bind), `OverrideService` (sparse CRUD + ECO gate), `CustomRoutingService` (escape hatch), `TemplateSimulatorService` (compute against arbitrary attribute payload)
- **CycleTimeService update** — merge overrides before formula eval + accept pluggable attribute source (product / manual JSON)
- **API endpoints** — full CRUD for templates, overrides, custom routings, binding rules, **simulate, required-attrs, test-fixtures**
- **Frontend** — RoutingEditor enhanced with override badges + **2-mode SimulatorPanel** (pick product / manual input), new CustomRoutingEditor page, BindingRuleManager admin page, BOM view custom-routing badge
- **WO snapshot prep** — `mrp_workorder.activity_snapshot JSONB` column reserved (Sprint 5 fills it)
- **Migration data** — convert any 4.1-installed per-product routings into templates (likely just remove + re-bind)

### 2.2 Out-of-scope ❌

| Deferred to | Item |
|---|---|
| Sprint 5 | WO snapshot population at MO `action_plan` (the column exists in 4.2, the trigger is 5) |
| Sprint 5 | ECO scope=`product_override` and ECO scope=`custom_routing` — Sprint 4.2 just hooks `eco_id?` FK |
| Sprint 5 | Override versioning — current Sprint 4.2 stores latest override only |
| Sprint 6 | Skill requirement on activity_template (still uses `manpower:Decimal`) |
| Sprint 7 | Custom routing finite-capacity scheduling |

### 2.3 What Sprint 4.1 still ships unchanged

Sprint 4.1's stories RT5 (FormulaService), RT8 (StdCostService), RT10 (Workcenter API), RT15 (WorkcenterMaster FE), RT16 (ActivityTemplateMaster FE), RT18-21 (tests/docs) all stay. Sprint 4.1's RT1, RT2, RT3, RT9, RT11, RT12, RT13, RT14, RT17 require schema/code adjustments — see §6 "Sprint 4.1 reconciliation" below.

---

## 3. Schema — full Prisma definitions (inline, self-contained)

> All schema below is **active in Sprint 4.2** (not skeleton). Drop into `backend/prisma/schema.prisma`. Skeletons for Sprint 5/6/7 deferred entities remain in `backend/prisma/schema.skeleton.prisma`.

### 3.1 Routing Template (NEW — replaces 4.1's mrp_routing_workcenter.product_id)

```prisma
// ── 🟦 Routing Template (Option 3 — shared recipe across many products) ──
model routing_template {
  id          Int       @id @default(autoincrement())
  code        String    @unique @db.VarChar(20)              // 'Main' | 'Accessory' | 'False' | <custom-shared>
  name        String    @db.VarChar(60)                       // 'Built-up Beam Standard'
  description String?   @db.Text
  version     String    @default("1.0") @db.VarChar(10)
  state       String    @default("active") @db.VarChar(20)   // draft|active|obsolete
  active      Boolean   @default(true)
  // Type — used for binding-rule matching
  applies_to_product_type String? @db.VarChar(20)            // 'standard'|'custom'|null = both
  applies_to_categ_id     Int?                                // FK to product_category (Sprint 1)
  // Simulator — engineer-curated baseline values for "Manual mode → Use defaults"
  default_input_spec      Json?                               // { sumWeight: 1500, Length: 12, Width: 0.4, count_part: 18, ... }
  // Audit
  odoo_ref_id String?   @db.VarChar(40)
  create_uid  Int
  create_user res_users @relation("rt_create", fields: [create_uid], references: [id])
  create_date DateTime  @default(now()) @db.Timestamptz
  write_uid   Int
  write_user  res_users @relation("rt_write", fields: [write_uid], references: [id])
  write_date  DateTime  @default(now()) @db.Timestamptz

  operations  mrp_routing_workcenter[]
  binding_rules routing_template_binding_rule[]
  bound_products products[] @relation("ProductTemplateBind")
}
```

### 3.2 Routing Operation (REVISED — bound to template, no more product_id)

```prisma
// ── 🟦 Routing Operation (Odoo mrp.routing.workcenter — REVISED from 4.1) ──
//    Diff from Sprint 4.1: removed product_id and routing_template:String columns;
//    added template_id:Int FK; routing_view stays for future eRoute/mRoute
model mrp_routing_workcenter {
  id                Int             @id @default(autoincrement())
  template_id       Int
  template          routing_template @relation(fields: [template_id], references: [id], onDelete: Cascade)
  name              String          @db.VarChar(60)         // 'buildup-fit', 'buildup-welding', ...
  op_code           String          @db.VarChar(30)         // FK by code to op meta
  sequence          Int             @default(10)
  workcenter_id     Int
  workcenter        mrp_workcenter  @relation(fields: [workcenter_id], references: [id])
  // Time mode (Odoo-compat)
  time_mode         String          @default("formula") @db.VarChar(10)  // formula|manual|template
  time_cycle_manual Decimal?        @db.Decimal(10, 4)                   // override fallback
  // BDT-custom
  routing_view      String          @default("eRoute") @db.VarChar(10)   // eRoute|mRoute (Sprint 5)
  // Dependencies (Sprint 5 typed graph — for now flat)
  blocked_by_op_ids Int[]
  // Audit
  create_uid        Int
  create_user       res_users       @relation("rwc_create", fields: [create_uid], references: [id])
  create_date       DateTime        @default(now()) @db.Timestamptz
  write_uid         Int
  write_user        res_users       @relation("rwc_write", fields: [write_uid], references: [id])
  write_date        DateTime        @default(now()) @db.Timestamptz

  activities        routing_op_activity[]

  @@unique([template_id, sequence], map: "ux_op_seq_per_template")
  @@index([template_id])
  @@index([workcenter_id])
}
```

### 3.3 Op-Activity Junction (NEW — connects op to activities)

```prisma
// ── 🟥 Op-Activity Junction (BDT-custom — many activities per op) ──
//    Each routing_workcenter has 1..N activities (the 6 sub-steps inside an op).
//    Activities are reusable templates; this table is the order/binding.
model routing_op_activity {
  id                    Int       @id @default(autoincrement())
  routing_workcenter_id Int
  routing_workcenter    mrp_routing_workcenter @relation(fields: [routing_workcenter_id], references: [id], onDelete: Cascade)
  activity_template_id  Int
  activity_template     routing_activity_template @relation(fields: [activity_template_id], references: [id])
  sequence              Int       @default(10)

  @@unique([routing_workcenter_id, sequence])
  @@index([activity_template_id])
}
```

### 3.4 Routing Activity Template (UNCHANGED from Sprint 4.1)

```prisma
// ── 🟥 Activity Template (UNCHANGED from Sprint 4.1) ──
//    Pasted here for completeness. 923 rows seeded from process routing.xlsx.
model routing_activity_template {
  id                  Int       @id @default(autoincrement())
  op_code             String    @db.VarChar(30)
  description         String    @db.VarChar(200)
  sequence            Int       @default(10)
  include_idle        Boolean   @default(false)
  per_minute          Decimal   @db.Decimal(10, 4)
  formula_param_code  String    @db.VarChar(40)
  formula_param       routing_formula_param @relation("Param1", fields: [formula_param_code], references: [code])
  std_measure         Decimal   @db.Decimal(12, 4)
  unit                String    @db.VarChar(20)
  formula_param_code2 String?   @db.VarChar(40)
  formula_param2      routing_formula_param? @relation("Param2", fields: [formula_param_code2], references: [code])
  std_measure2        Decimal?  @db.Decimal(12, 4)
  unit2               String?   @db.VarChar(20)
  manpower            Decimal   @default(1) @db.Decimal(4, 2)
  workcenter_id       Int
  workcenter          mrp_workcenter @relation(fields: [workcenter_id], references: [id])
  equipment_ref       String?   @db.VarChar(120)
  consumable_note     String?   @db.VarChar(200)
  utilities_note      String?   @db.VarChar(40)
  version             String    @default("1.0") @db.VarChar(20)
  active              Boolean   @default(true)
  source              String    @default("xlsx_seed") @db.VarChar(20)
  create_uid          Int
  create_user         res_users @relation("act_create", fields: [create_uid], references: [id])
  create_date         DateTime  @default(now()) @db.Timestamptz
  write_uid           Int
  write_user          res_users @relation("act_write", fields: [write_uid], references: [id])
  write_date          DateTime  @default(now()) @db.Timestamptz

  op_activities       routing_op_activity[]
  overrides           product_routing_override[]

  @@index([op_code])
}
```

### 3.5 Product Routing Override (NEW — sparse, per-activity per-product)

```prisma
// ── 🟨 Product Routing Override (NEW Option 3 — sparse per-activity override) ──
//    Only rows when product needs to override a template activity. Empty in 85% of cases.
model product_routing_override {
  id                   Int       @id @default(autoincrement())
  product_id           Int
  product              products  @relation("ProductOverrides", fields: [product_id], references: [id], onDelete: Cascade)
  activity_template_id Int
  activity_template    routing_activity_template @relation(fields: [activity_template_id], references: [id])
  // Sparse override fields (null = inherit from template)
  override_per_minute  Decimal?  @db.Decimal(10, 4)
  override_std_measure Decimal?  @db.Decimal(12, 4)
  override_manpower    Decimal?  @db.Decimal(4, 2)
  override_workcenter_id Int?    // rare: route through different WC for this product
  override_workcenter  mrp_workcenter? @relation("OverrideWC", fields: [override_workcenter_id], references: [id])
  // Reason / governance
  reason               String?   @db.Text
  eco_id               Int?                              // ⏳ Sprint 5 mrp_eco
  // Audit
  create_uid           Int
  create_user          res_users @relation("ovr_create", fields: [create_uid], references: [id])
  create_date          DateTime  @default(now()) @db.Timestamptz
  write_uid            Int
  write_user           res_users @relation("ovr_write", fields: [write_uid], references: [id])
  write_date           DateTime  @default(now()) @db.Timestamptz

  @@unique([product_id, activity_template_id], map: "ux_one_override_per_pair")
  @@index([product_id])
  @@index([activity_template_id])
  @@index([eco_id])
}
```

### 3.6 Custom Routing (NEW — escape hatch for Class C products)

```prisma
// ── 🟥 Custom Routing (Option 3 escape hatch — Class C products with structurally different ops) ──
//    Used when product cannot inherit from any template. 1:1 with product.
model custom_routing {
  id          Int       @id @default(autoincrement())
  product_id  Int       @unique                                  // strict 1:1
  product     products  @relation("ProductCustomRouting", fields: [product_id], references: [id], onDelete: Cascade)
  name        String    @db.VarChar(60)
  description String?   @db.Text
  version     String    @default("1.0") @db.VarChar(10)
  state       String    @default("draft") @db.VarChar(20)        // draft|active|obsolete
  // Provenance — was this cloned from a template? Useful for diff/diag UI
  cloned_from_template_id Int?
  cloned_from_template    routing_template? @relation("CustomFromTemplate", fields: [cloned_from_template_id], references: [id])
  // ECO
  eco_id      Int?                                                // ⏳ Sprint 5
  // Audit
  create_uid  Int
  create_user res_users @relation("cr_create", fields: [create_uid], references: [id])
  create_date DateTime  @default(now()) @db.Timestamptz
  write_uid   Int
  write_user  res_users @relation("cr_write", fields: [write_uid], references: [id])
  write_date  DateTime  @default(now()) @db.Timestamptz

  ops         custom_routing_op[]

  @@index([cloned_from_template_id])
  @@index([state])
}

model custom_routing_op {
  id                Int       @id @default(autoincrement())
  custom_routing_id Int
  custom_routing    custom_routing @relation(fields: [custom_routing_id], references: [id], onDelete: Cascade)
  sequence          Int
  name              String    @db.VarChar(60)
  op_code           String    @db.VarChar(30)
  workcenter_id     Int
  workcenter        mrp_workcenter @relation("CustomOpWC", fields: [workcenter_id], references: [id])
  time_mode         String    @default("formula") @db.VarChar(10)
  time_cycle_manual Decimal?  @db.Decimal(10, 4)
  blocked_by_op_ids Int[]

  activities        custom_routing_activity[]

  @@unique([custom_routing_id, sequence])
  @@index([workcenter_id])
}

// Denormalized — custom routing has its own activity rows (no link to shared activity_template).
// Trade-off: lose template-formula reuse, gain full flexibility for Class C products.
model custom_routing_activity {
  id                  Int       @id @default(autoincrement())
  op_id               Int
  op                  custom_routing_op @relation(fields: [op_id], references: [id], onDelete: Cascade)
  sequence            Int       @default(10)
  description         String    @db.VarChar(200)
  include_idle        Boolean   @default(false)
  per_minute          Decimal   @db.Decimal(10, 4)
  formula_param_code  String    @db.VarChar(40)
  formula_param       routing_formula_param @relation("CustomActParam1", fields: [formula_param_code], references: [code])
  std_measure         Decimal   @db.Decimal(12, 4)
  unit                String    @db.VarChar(20)
  formula_param_code2 String?   @db.VarChar(40)
  formula_param2      routing_formula_param? @relation("CustomActParam2", fields: [formula_param_code2], references: [code])
  std_measure2        Decimal?  @db.Decimal(12, 4)
  unit2               String?   @db.VarChar(20)
  manpower            Decimal   @default(1) @db.Decimal(4, 2)
  workcenter_id       Int                                          // can override op's WC
  workcenter          mrp_workcenter @relation("CustomActWC", fields: [workcenter_id], references: [id])
  equipment_ref       String?   @db.VarChar(120)
  consumable_note     String?   @db.VarChar(200)
  utilities_note      String?   @db.VarChar(40)

  @@unique([op_id, sequence])
}
```

### 3.7 Routing Template Binding Rule (NEW — auto-bind from product type/attrs)

```prisma
// ── 🟨 Template Binding Rule (D1 decision — engineer-editable rule chain) ──
//    Evaluated at product create time + on-demand recompute. First-match wins.
model routing_template_binding_rule {
  id                  Int       @id @default(autoincrement())
  priority            Int       @default(100)                    // lower = higher priority; ties broken by id
  description         String?   @db.Text
  // Match criteria (AND across non-null fields; row matches if all set fields match)
  match_product_type  String?   @db.VarChar(20)                  // 'standard' | 'custom'
  match_mark_prefix   String?   @db.VarChar(10)                  // FK by code to mark_prefix_master (Sprint 2)
  match_categ_id      Int?
  match_categ         product_category? @relation(fields: [match_categ_id], references: [id])
  match_attr_path     String?   @db.VarChar(60)                  // e.g., 'attributes.material_group'
  match_attr_value    String?   @db.VarChar(60)                  // e.g., 'HR_SHAPE'
  // Action
  routing_template_id Int
  routing_template    routing_template @relation(fields: [routing_template_id], references: [id])
  active              Boolean   @default(true)
  // Audit
  create_uid          Int
  create_user         res_users @relation("br_create", fields: [create_uid], references: [id])
  create_date         DateTime  @default(now()) @db.Timestamptz
  write_uid           Int
  write_date          DateTime  @default(now()) @db.Timestamptz

  @@index([priority, active])
  @@index([routing_template_id])
}
```

### 3.8 Products table changes (Sprint 2 amendment)

```prisma
// ── products (Sprint 2) — Option 3 fields added ──
model products {
  // ...existing fields from Sprint 2...

  // Option 3 routing binding (replaces Sprint 4.1's active_routing_id)
  routing_template_id Int?
  routing_template    routing_template? @relation("ProductTemplateBind", fields: [routing_template_id], references: [id])
  custom_routing_id   Int?              // FK is in custom_routing.product_id (1:1) — duplicate here for fast SELECT
  has_custom_routing  Boolean @default(false)
  routing_overrides   product_routing_override[] @relation("ProductOverrides")
  custom_routing      custom_routing? @relation("ProductCustomRouting")
}
```

### 3.9 routing_template_test_fixture (NEW — Epic F simulator regression)

```prisma
// ── 🟨 Saved simulator inputs as regression test fixtures (Sprint 4.2 RT47) ──
//    Used by CI to detect template/activity drift; engineers store named scenarios.
model routing_template_test_fixture {
  id                  Int       @id @default(autoincrement())
  template_id         Int
  template            routing_template @relation(fields: [template_id], references: [id], onDelete: Cascade)
  name                String    @db.VarChar(80)            // 'Standard 1500 kg / 12 m column'
  description         String?   @db.Text
  source_mode         String    @db.VarChar(20)            // 'pick_product' | 'manual'
  source_product_id   Int?                                  // snapshot — product may change after fixture saved
  source_product      products? @relation("FixtureProduct", fields: [source_product_id], references: [id])
  attribute_values    Json                                   // resolved input values used (for replay)
  expected_total_min  Decimal?  @db.Decimal(10, 2)         // engineer's expected — CI compares ±5%
  expected_total_cost Decimal?  @db.Decimal(12, 2)
  // Audit
  create_uid          Int
  create_user         res_users @relation("rtf_create", fields: [create_uid], references: [id])
  create_date         DateTime  @default(now()) @db.Timestamptz

  @@index([template_id])
  @@index([source_product_id])
}
```

### 3.10 History tables (NEW — Layer 1 versioning per D12)

> Append-only history snapshots. Triggered on UPDATE of the active row. Required for ECO audit + compliance + "what changed when" queries.

```prisma
// ── 🟦 routing_template history (Layer 1 — Sprint 4.2 RT48) ──
model routing_template_history {
  id              Int      @id @default(autoincrement())
  template_id     Int
  template        routing_template @relation("TemplateHistory", fields: [template_id], references: [id], onDelete: Cascade)
  version         String   @db.VarChar(20)
  snapshot        Json                                          // full mutable-field snapshot of routing_template
  changed_by_uid  Int
  changed_by      res_users @relation("rth_user", fields: [changed_by_uid], references: [id])
  changed_at      DateTime @default(now()) @db.Timestamptz
  eco_id          Int?                                           // ⏳ Sprint 5 mrp_eco
  reason          String?  @db.Text

  @@index([template_id, changed_at])
  @@index([eco_id])
}

// ── 🟦 routing_activity_template history (Layer 1 — Sprint 4.2 RT48) ──
model routing_activity_template_history {
  id                   Int      @id @default(autoincrement())
  activity_template_id Int
  activity_template    routing_activity_template @relation("ActHistory", fields: [activity_template_id], references: [id], onDelete: Cascade)
  version              String   @db.VarChar(20)
  snapshot             Json                                      // full snapshot incl. per_minute, std_measure, formula_param_code, etc.
  changed_by_uid       Int
  changed_by           res_users @relation("ach_user", fields: [changed_by_uid], references: [id])
  changed_at           DateTime @default(now()) @db.Timestamptz
  eco_id               Int?                                       // ⏳ Sprint 5
  reason               String?  @db.Text

  @@index([activity_template_id, changed_at])
  @@index([eco_id])
}

// ── 🟨 product_routing_override history (Layer 1 — Sprint 4.2 RT49) ──
model product_routing_override_history {
  id            Int      @id @default(autoincrement())
  override_id   Int                                              // FK by id (override row may be deleted; keep FK as Int not relation)
  product_id    Int                                              // ✅ products
  activity_template_id Int                                       // ✅ routing_activity_template
  snapshot      Json                                             // full snapshot incl. override_per_minute, override_std_measure, eco_id, reason, …
  action        String   @db.VarChar(20)                         // 'create' | 'update' | 'delete'
  changed_by_uid Int
  changed_by     res_users @relation("ovrh_user", fields: [changed_by_uid], references: [id])
  changed_at     DateTime @default(now()) @db.Timestamptz
  eco_id         Int?                                            // ⏳ Sprint 5

  @@index([product_id, changed_at])
  @@index([activity_template_id, changed_at])
  @@index([eco_id])
}
```

**Triggers (raw SQL — Sprint 4.2 RT49):**

```sql
-- routing_template history
CREATE OR REPLACE FUNCTION trg_routing_template_history() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO routing_template_history (template_id, version, snapshot, changed_by_uid, changed_at, reason)
  VALUES (OLD.id, OLD.version, row_to_json(OLD), OLD.write_uid, NOW(), 'auto-history on update');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_routing_template_history
  BEFORE UPDATE ON routing_template
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION trg_routing_template_history();

-- Same pattern for routing_activity_template, product_routing_override.
-- Override-delete also captured: BEFORE DELETE trigger writes snapshot with action='delete'.
```

### 3.11 mrp_workorder snapshot field (preview for Sprint 5)

```prisma
// ── mrp_workorder (Sprint 5 skeleton — Sprint 4.2 reserves the snapshot column) ──
//    Add this 1 line to the mrp_workorder_skeleton model in schema.skeleton.prisma:
//
//    activity_snapshot Json?  // [{activity_id, name, formula_trace, cycle_time_min, manpower}]
//
//    Snapshot taken at MO action_plan (D4 decision). Preserves cycle time
//    even if template/override/custom_routing changes after WO is planned.
```

### 3.12 Constraints (raw SQL migration)

```sql
-- XOR: product uses EITHER template OR custom_routing, not neither, not both
ALTER TABLE products ADD CONSTRAINT ck_routing_xor CHECK (
  (has_custom_routing = false AND routing_template_id IS NOT NULL AND custom_routing_id IS NULL) OR
  (has_custom_routing = true  AND custom_routing_id  IS NOT NULL AND routing_template_id IS NULL)
);

-- routing_template_binding_rule: at least one match criterion must be set
ALTER TABLE routing_template_binding_rule ADD CONSTRAINT ck_br_at_least_one_match CHECK (
  match_product_type IS NOT NULL
  OR match_mark_prefix IS NOT NULL
  OR match_categ_id IS NOT NULL
  OR match_attr_path IS NOT NULL
);

-- custom_routing: state machine guard
ALTER TABLE custom_routing ADD CONSTRAINT ck_cr_state CHECK (
  state IN ('draft', 'active', 'obsolete')
);

-- Only 1 active custom_routing per product (1:1 already enforced by UNIQUE on product_id;
-- this enforces only state=active row per product instead of any row)
-- Already covered by @unique on product_id, but keeping for clarity:
CREATE UNIQUE INDEX ux_one_active_custom_routing_per_product
  ON custom_routing (product_id) WHERE state = 'active';

-- product_routing_override: cannot override a template that the product doesn't bind to
-- (validated at service layer; can't easily enforce in SQL since template may change after override)

-- ECO gate (D2 decision): if product has any confirmed MO, override row must have eco_id
-- This is service-layer enforced because mrp_production is in Sprint 5 (skeleton today).
-- Sprint 5 will add the trigger:
--   IF product has MO with state IN ('confirmed','planned','progress')
--   THEN override INSERT/UPDATE must have eco_id NOT NULL
```

---

## 4. Backlog (User Stories) — 80 h / 21 stories

> **Tag legend:** 🟦 Standard (Odoo)  ·  🟨 Hybrid (extend)  ·  🟥 Custom (BDT-only)
>
> Stories numbered RT22+ (continuing from Sprint 4.1's RT1–RT21).

### Epic A — Schema & Migration (16 h)

| ID | Tag | Story | Effort | DoD |
|---|:-:|---|---|---|
| **RT22** | 🟦 | Migration: add `routing_template` + `routing_op_activity` (junction); rewrite `mrp_routing_workcenter` to drop `product_id`/`routing_template:String`, add `template_id` FK | 4 h | migrate dev success; FK constraints active; rollback tested |
| **RT23** | 🟨 | Migration: add `product_routing_override` + `routing_template_binding_rule` | 3 h | migrate dev success; XOR check constraint applied; partial-unique index for active custom_routing |
| **RT24** | 🟥 | Migration: add `custom_routing` + `custom_routing_op` + `custom_routing_activity` + `products` FK changes | 3 h | migrate dev success; products XOR CHECK constraint enforced |
| **RT25** | 🟨 | Seed: 5 default `routing_template_binding_rule` rows (Main for COLUMN/BEAM, Accessory for PURLIN/ANCHOR, fallback to Main for unmatched custom) | 2 h | rules tested against Sprint 2 sample products; 100% bind rate |
| **RT26** | 🟦 | Mail audit hooks for all 5 new tables (template, override, custom_routing, custom_routing_op, binding_rule) | 2 h | reuses `MailMessageService` from Sprint 1 |
| **RT27** | 🟦 | Migration: add `mrp_workorder.activity_snapshot Json?` to skeleton schema (Sprint 5 will populate) | 2 h | Sprint 5 skeleton updated; type matches snapshot service signature in §5.4 |

### Epic B — Services (16 h)

| ID | Tag | Story | Effort | DoD |
|---|:-:|---|---|---|
| **RT28** | 🟨 | `TemplateBindingService.bindProduct(productId)` — runs through `routing_template_binding_rule` ordered by priority, returns first-match template; called on product create + on demand | 4 h | unit tests with 6 rule combos + edge cases (no match → null + warn); idempotent |
| **RT29** | 🟨 | `OverrideService.upsertOverride(productId, activityId, fields, reason, ecoId?)` + `removeOverride` + ECO gate per D2: throws `EcoRequiredException` if product has MO confirmed | 4 h | 8 unit tests incl. ECO gate path; mail_message logged on every change |
| **RT30** | 🟥 | `CustomRoutingService.create(productId, fromTemplateId?)` — clones template into custom_routing rows OR creates blank if no template; `update`, `clone`, `obsolete`, `restoreToTemplate` | 4 h | clone preserves activity sequence + per_minute values; restoreToTemplate sets has_custom_routing=false and clears custom_routing_id |
| **RT31** | 🟨 | Update `CycleTimeService.compute()` (from Sprint 4.1) — dispatch on `product.has_custom_routing`: branch (a) custom_routing path, branch (b) template + merge overrides path | 4 h | both branches return same shape; 6 fresh unit tests |

### Epic C — API (12 h)

| ID | Tag | Story | Effort | DoD |
|---|:-:|---|---|---|
| **RT32** | 🟦 | `RoutingTemplatesModule`: full CRUD `/routing-templates` + state actions (`activate`, `obsolete`) | 3 h | Swagger; only admin can write; 4 templates seeded read-only |
| **RT33** | 🟨 | `OverridesModule`: `/products/:code/routing-overrides` GET (list), POST/PATCH/DELETE — all enforce ECO gate | 3 h | 400 with `EcoRequiredException` payload after MO confirmed |
| **RT34** | 🟥 | `CustomRoutingsModule`: `/products/:code/custom-routing` POST (convert), GET, PATCH (ops + activities nested) ; `/custom-routings/:id/restore-to-template` | 3 h | restore endpoint sets `has_custom_routing=false` and removes custom_routing_id; audit logged |
| **RT35** | 🟨 | `BindingRulesModule`: `/routing-template-binding-rules` CRUD + reorder priority + `/products/:code/rebind` (manual trigger) | 3 h | rebind doesn't run if `has_custom_routing=true` (custom takes precedence); admin only |

### Epic D — Frontend (24 h)

| ID | Tag | Story | Effort | DoD |
|---|:-:|---|---|---|
| **RT36** | 🟨 | RoutingEditor enhancement: each activity row shows "Inherited" badge + "Override" button → in-place edit creating override row; cycle time recomputes live | 8 h | clicking Override turns row to edit form; Save calls upsertOverride; 400 EcoRequired displays inline reason banner |
| **RT37** | 🟥 | New page `/products/:code/custom-routing` (CustomRoutingEditor) — full op + activity edit; "Convert from template" CTA at top with template picker | 8 h | when products is on template path: shows "Convert" CTA; when has_custom_routing: shows full editor + "Restore to template" button |
| **RT38** | 🟨 | BOM view + ProductDetail header — show prominent "Custom Routing" badge (orange/amber per D3) when has_custom_routing | 4 h | badge clickable → navigates to CustomRoutingEditor; aria-label set |
| **RT39** | 🟨 | Admin page `/admin/binding-rules` (BindingRuleManager) — drag-drop priority, edit match criteria, preview "this rule would bind X products" counter | 4 h | drag-drop saves new priority order via PATCH; preview runs server-side count query |

### Epic E — Quality & Docs (12 h)

| ID | Tag | Story | Effort | DoD |
|---|:-:|---|---|---|
| **RT40** | 🟦 | Unit tests: TemplateBindingService (8), OverrideService (8 incl. ECO gate), CustomRoutingService (10), CycleTimeService merge logic (6) ≥80% coverage | 5 h | `npm test --coverage` green |
| **RT41** | 🟦 | E2E (supertest) — Path A: bind WH-CO-1 to Main → override 1 activity → recompute → cycle time uses override value. Path B: convert WH-CO-1 to custom_routing → recompute → cycle time independent of template | 3 h | both paths green; runs <30 s |
| **RT42** | 🟥 | Compute audit (extend Sprint 4.1 RT20): pick 3 reference products with overrides + 1 with custom_routing; verify totals against MO sheet ±15% | 2 h | `docs/sprint4_2/compute-audit.md` committed; deltas explained |
| **RT43** | 🟦 | Swagger updates + `CHANGELOG.md` Sprint 4.2 section + ADR `docs/adr/0005-routing-pattern-option3.md` + ADR `docs/adr/0006-template-simulator.md` | 2 h | doc reviewed; matches implemented behaviour |

### Epic F — Template Simulator (20 h) — see [`ROUTING_TEMPLATE_SIMULATOR_DESIGN.md`](./ROUTING_TEMPLATE_SIMULATOR_DESIGN.md)

| ID | Tag | Story | Effort | DoD |
|---|:-:|---|---|---|
| **RT44** | 🟦 | Migration + API: `default_input_spec` Json column on `routing_template` (already in §3.1); endpoint `GET /routing-templates/:id/required-attrs` walks template → ops → activities → unions formula_param.inputs_required, returns kind/unit/used_in_count + default_input_spec | 3 h | Returns shape per design §2.5; performance < 100 ms for 10-op template; unit-test coverage on union logic |
| **RT45** | 🟨 | API: `POST /routing-templates/:id/simulate` — pure compute, no DB write; reuses `CycleTimeService` with pluggable attribute source (product OR manual JSON); returns total + per-op breakdown + per-activity formula trace + `warnings[]` | 4 h | Both modes (pick_product, manual) tested; warnings include undefined params; performance < 300 ms |
| **RT46** | 🟨 | FE: `SimulatorPanel` component on RoutingEditor right side — 2-mode toggle, attr table with auto-pick from product (✓ green / ⚠ amber for missing), inline manual entry, Run button, Result card with custom-CSS bar chart per op + drill-down + formula trace; localStorage persist last simulation per (template, user) | 8 h | All 10 edge cases from design §6 handled; mode switch preserves compatible inputs; chart shows critical-path highlight |
| **RT47** | 🟨 | Migration + API + FE: `routing_template_test_fixture` table (§3.9); `POST /routing-templates/:id/test-fixtures` CRUD + "Save as fixture" button; "Compare" dual-pane (same template, 2 input sets, side-by-side per-op deltas) | 5 h | Fixture replay-able; compare mode shows %-delta per op; CI test runs fixture set nightly via `pnpm test:fixtures` |

### Epic G — Versioning History (6 h) — see [`GAP_ANALYSIS_ECO_VERSIONING_BULK.md`](./GAP_ANALYSIS_ECO_VERSIONING_BULK.md) §3

| ID | Tag | Story | Effort | DoD |
|---|:-:|---|---|---|
| **RT48** | 🟦 | Migration: `routing_template_history` + `routing_activity_template_history` + `product_routing_override_history` (3 tables, all defined in §3.10) | 3 h | 3 tables created with FK + indexes; migrate dev success; rollback tested |
| **RT49** | 🟦 | Triggers + history-read endpoint: `BEFORE UPDATE` trigger on each parent table writes snapshot JSON; `BEFORE DELETE` trigger captures override deletion; endpoint `GET /routing-templates/:id/history` (and per activity, override) returns timeline | 3 h | trigger fires on every UPDATE / DELETE; endpoint paginated (50/page); 3 unit tests confirm snapshot integrity |

**Total estimate:** 16 + 16 + 12 + 24 + 12 + 20 + 6 = **106 h** ✅ (6-day budget per Option D + Option E from ECO/versioning gap analysis)

**Tag mix:** 🟦 ~30% / 🟨 ~45% / 🟥 ~25% — Epic F adds more Hybrid weight (simulator extends Odoo formula model with BDT scenario testing — practice from Siemens Master Recipe Validation).

---

## 5. Sprint Schedule (5 days × 2 devs)

| Day | Dev A — Backend / Schema / Engine | Dev B — Frontend / UX |
|:-:|---|---|
| **D1** | RT22 (4h) template + junction migration · RT26 (2h) audit hooks · RT28 (2h) TemplateBindingService skeleton | RT36 (6h) RoutingEditor inherited-badge + override button — design pass + base markup · UX review of override flow |
| **D2** | RT23+RT24 (6h) override + custom_routing migrations · RT25 (2h) seed binding rules | RT36 (4h) RoutingEditor finish (live recompute + ECO inline error) · RT38 (2h) BOM/ProductDetail badge · scaffolding RT37 |
| **D3** | RT28 (2h) finish · RT29 (4h) OverrideService + ECO gate · RT30 (1h) CustomRoutingService start | RT37 (6h) CustomRoutingEditor — list ops + add/del/reorder · "Convert from template" picker |
| **D4** | RT30 (3h) CustomRoutingService finish · RT31 (4h) CycleTimeService dispatch + merge · RT27 (1h) WO snapshot column reservation | RT37 (4h) CustomRoutingEditor finish · RT39 (3h) BindingRuleManager admin page · RT38 polish |
| **D5** | RT32+RT33+RT34+RT35 (10h) all 4 API modules · RT44 (3h) required-attrs API · RT45 (3h) simulate API start | RT39 (1h) finish · RT46 (8h) SimulatorPanel FE · scaffolding RT47 |
| **D6** | RT45 (1h) simulate API finish · RT47 (3h) fixture API + Compare backend · RT48 (3h) history migrations · RT49 (3h) triggers + history endpoint | RT47 (2h) FE Save-as-fixture + Compare dual-pane · RT41 (2h) FE E2E · RT42 (2h) audit · RT43 (2h) docs · RT40 (1h) finish tests |

D6 afternoon = bug-bash + demo prep. Cap at 106 h.

---

## 6. Sprint 4.1 reconciliation (what to amend before kickoff)

If Sprint 4.1 has been **planned but not implemented yet** (current state as of 2026-04-29), Claude Code should treat the following Sprint 4.1 stories as superseded by Sprint 4.2 in the same delivery window:

| Sprint 4.1 story | Action |
|---|---|
| **RT1** Migration of routing tables | **Superseded** — use RT22+RT23+RT24 instead. Single combined migration recommended. |
| **RT2** xlsx seed importer | **Amend** — import 28 rows from `routing` sheet as `routing_template` rows + `mrp_routing_workcenter` rows under each template (not under products). Activities still go to `routing_activity_template` unchanged. |
| **RT3** Sample 0X202 routing seed | **Amend** — bind WH-CO-1 to template `Main` via `routing_template_id` FK; do NOT clone template into per-product rows. |
| **RT9** RoutingsModule API | **Replace** — `/products/:code/routing` returns merged view (template + product-specific overrides), not per-product routing rows. New endpoints (RT32-35) cover template/override/custom_routing CRUD. |
| **RT11** ActivityTemplatesModule | **Mostly unchanged** — just remove the "per-product override creates new row" path; that's now `OverrideService` (RT29). |
| **RT12** Recompute controller | **Amend** — dispatch on `has_custom_routing`. |
| **RT13** Real-API hooks (FE) | **Amend** — add `useTemplate(templateId)`, `useOverrides(productCode)`, `useCustomRouting(productCode)` hooks; existing `useRouting(productCode)` becomes a higher-level "merged view" hook. |
| **RT14** RoutingEditor real-API | **Amend** — see RT36 (override badges); the editor now shows mostly read-only template ops with override affordance per row. |
| **RT17** ProductDetail "Routing" tab | **Amend** — show binding info (template name + override count + custom flag) + link to RoutingEditor or CustomRoutingEditor depending on flag |

**Effective sprint structure:** treat Sprint 4.1 + Sprint 4.2 as a single 10-day "Sprint 4 Combined" effort if delivering in one block. If splitting across two cycles, ship 4.1 with stub override + custom_routing tables (empty) so 4.2 just adds the logic.

---

## 7. Service-layer details (key new code)

### 7.1 TemplateBindingService

```ts
// backend/src/modules/routing-templates/template-binding.service.ts
@Injectable()
export class TemplateBindingService {
  constructor(private prisma: PrismaService) {}

  /** Returns chosen template_id for a product, or null if no rule matches. */
  async bindProduct(productId: number): Promise<number | null> {
    const product = await this.prisma.products.findUniqueOrThrow({
      where: { id: productId },
      include: { category: true },
    })

    // has_custom_routing takes precedence — short-circuit
    if (product.has_custom_routing) return null

    const rules = await this.prisma.routing_template_binding_rule.findMany({
      where: { active: true },
      orderBy: [{ priority: 'asc' }, { id: 'asc' }],
    })

    for (const r of rules) {
      if (r.match_product_type && r.match_product_type !== product.product_type) continue
      if (r.match_mark_prefix && r.match_mark_prefix !== product.mark_prefix) continue
      if (r.match_categ_id && r.match_categ_id !== product.categ_id) continue
      if (r.match_attr_path && r.match_attr_value) {
        const actual = this.extractAttr(product, r.match_attr_path)
        if (String(actual) !== r.match_attr_value) continue
      }
      // First-match wins
      await this.prisma.products.update({
        where: { id: productId },
        data: { routing_template_id: r.routing_template_id },
      })
      return r.routing_template_id
    }
    return null  // caller decides whether to error or warn
  }

  private extractAttr(product: any, path: string): any {
    return path.split('.').reduce((acc, key) => acc?.[key], product)
  }
}
```

### 7.2 OverrideService — ECO gate

```ts
@Injectable()
export class OverrideService {
  constructor(private prisma: PrismaService, private mail: MailMessageService) {}

  async upsertOverride(productId: number, activityId: number, fields: OverrideDto, reason?: string, ecoId?: number) {
    // D2 ECO gate
    const hasConfirmedMO = await this.hasConfirmedMO(productId)
    if (hasConfirmedMO && !ecoId) {
      throw new BadRequestException({
        code: 'ECO_REQUIRED',
        message: 'Product has confirmed MO — override requires ECO',
      })
    }
    
    const result = await this.prisma.product_routing_override.upsert({
      where: { product_id_activity_template_id: { product_id: productId, activity_template_id: activityId } },
      create: { product_id: productId, activity_template_id: activityId, ...fields, reason, eco_id: ecoId, create_uid: this.userId(), write_uid: this.userId() },
      update: { ...fields, reason, eco_id: ecoId, write_uid: this.userId() },
    })
    await this.mail.log('product_routing_override', result.id, hasConfirmedMO ? 'override_with_eco' : 'override_draft', fields)
    return result
  }

  // Sprint 5 will replace this with real check on mrp_production.state
  private async hasConfirmedMO(productId: number): Promise<boolean> {
    // skeleton for now: query mrp_production_skeleton if it exists, else false
    return false
  }
}
```

### 7.3 CycleTimeService dispatch

```ts
async compute(productId: number): Promise<RoutingCompute> {
  const product = await this.prisma.products.findUniqueOrThrow({
    where: { id: productId },
    include: { custom_routing: { include: { ops: { include: { activities: true } } } } },
  })

  if (product.has_custom_routing && product.custom_routing) {
    return this.computeCustomRouting(product)
  }
  if (product.routing_template_id) {
    return this.computeFromTemplate(product)
  }
  throw new BadRequestException('Product has neither template binding nor custom_routing')
}

private async computeFromTemplate(product: ProductWithAttrs): Promise<RoutingCompute> {
  const template = await this.loadTemplateOps(product.routing_template_id!)  // ops + activities + workcenter
  const overrides = await this.loadOverridesIndexed(product.id)              // Map<activityTemplateId, Override>

  // Iterate ops + activities, applying override where present, then formula eval
  // (same algorithm as Sprint 4.1 §8.1 — just inserts override application step)
}

private async computeCustomRouting(product: ProductWithCustomRouting): Promise<RoutingCompute> {
  // Walk product.custom_routing.ops + each op.activities (denormalized — no template lookup)
  // Same formula evaluation logic
}
```

### 7.4 WO snapshot shape (Sprint 5 will populate this)

```ts
// Sprint 5 mrp_workorder.activity_snapshot Json?
type WorkOrderActivitySnapshot = {
  routing_source: 'template' | 'custom_routing'
  template_id?: number
  template_version?: string
  custom_routing_id?: number
  custom_routing_version?: string
  activities: Array<{
    activity_id: number  // either routing_activity_template.id or custom_routing_activity.id
    activity_source: 'template' | 'override' | 'custom'
    sequence: number
    description: string
    cycle_time_min: number
    formula_trace: {
      m1_value: number
      std_measure: number
      ratio1: number
      per_minute: number
      m2_value?: number
      std_measure2?: number
      ratio2?: number
    }
    workcenter_id: number
    manpower: number
  }>
  total_cycle_time_min: number
  computed_at: string
  computed_by_uid: number
}
```

---

## 8. Acceptance Criteria (Sprint 4.2 Demo)

✅ Demo script (20 min):

**Part A — Option 3 routing pattern**
1. Open `/admin/binding-rules` → see 5 seeded rules; drag rule "Match COLUMN/BEAM → Main" to top → save
2. Open product `WH-CO-1` (auto-bound to `Main` template) → Routing tab shows "Inherited from Main · 0 overrides"
3. Click "Open Editor" → see 10 ops with template activities; click "Override" on `4.5 Weld bead 2nd side` → change `per_minute` from 20 → 25 → Save → cycle time recomputes live, total updates
4. Verify override row exists in DB; mail_message logged
5. Try to override a 2nd activity AFTER simulating "MO confirmed" (toggle a flag) → 400 EcoRequired error displays inline
6. Click "Make Custom Routing" → confirm dialog → product now has `has_custom_routing=true`, `custom_routing` row created cloning Main → orange "Custom Routing" badge appears in BOM view + ProductDetail header
7. Open `/products/WH-CO-1/custom-routing` → CustomRoutingEditor shows 10 ops; delete one (e.g., `topcoat`); save → recompute → total time decreased
8. Click "Restore to template" → confirm → custom_routing obsoleted, product re-bound to Main, badge disappears
9. Open `/admin/binding-rules` → click rule "Main" → see "Currently bound: 1 product" preview

**Part B — Template Simulator (Epic F)**
10. Open `/routing-templates/Main` (RoutingEditor) → right panel SimulatorPanel visible · "6 inputs required" header
11. Mode 1 (Pick product): search "WH-CO-2" → autocomplete picks → all 6 fields ✓ green from `products.attributes` → click "Run simulation" → result card shows total ~9,300 min · bar chart highlights `welding` op as critical
12. Override `Length` field from 14 → 18 m in the panel → re-run → total updates with delta indicator
13. Switch to Mode 2 (Manual) → confirm dialog "keep your inputs?" → Yes → all values preserved as manual
14. Click "Use template defaults" → form fills with `default_input_spec` baseline → run → total ~7,200 min
15. Click "Save as fixture" → name "Standard 1500kg/12m" + expected_total_min 7200 → saved
16. Click "Compare" → pick fixture "Standard 1500kg/12m" + run with `sumWeight=2500` → side-by-side panel shows %-delta per op (e.g., `buildup-fit +66%`)
17. Refresh page → SimulatorPanel restores last manual inputs from localStorage
18. Run E2E: `pnpm test --testPathPattern=sprint4_2` → green; `pnpm test:fixtures` → all fixtures within ±5% of expected

Non-functional:
- 80% test coverage on services
- Single product compute (template path) < 500 ms
- Single product compute (custom_routing path) < 500 ms
- Override toggle round-trip (DB → API → FE) < 1 s
- Migration up + down clean

---

## 9. Risk register (sprint-level)

| # | Risk | Likelihood | Mitigation |
|---|---|:-:|---|
| S1 | Migration RT22 drops `mrp_routing_workcenter.product_id` — any 4.1 data lost | M | If 4.1 hasn't shipped, no risk. If 4.1 shipped: pre-migration step copies rows into `routing_template`+junction. Sprint 4.2 RT22 includes data-migration script. |
| S2 | `has_custom_routing=true` but `custom_routing.state='obsolete'` — orphan state | M | XOR CHECK + service rule: when obsoleting custom_routing, must restore product to template OR mark product `state=blocked` |
| S3 | Engineer abuses overrides → 80% of products have ≥1 override → defeats purpose of template | M | FE BindingRuleManager shows "products with override count" — flag if >20% of bound products have overrides → review template instead |
| S4 | ECO gate (D2) silently passes today because mrp_production is skeleton | L | Service throws explicit `'ECO check skipped: Sprint 5 not yet implemented'` warning to logs; FE shows yellow banner in dev mode |
| S5 | Custom routing duplication (engineer creates many one-offs that should share a sub-template) | M | Sprint 6+ feature: "promote custom_routing to template" — add backlog item; document in `docs/adr/0005-routing-pattern-option3.md` §future |
| S6 | Binding rule chain has no fallback → product unmatched → no template bound → recompute fails | M | RT25 seed includes a final fallback rule: `match_product_type='custom'` → template `Main` (or whichever default makes sense). Validation step in RT41 E2E asserts 100% bind rate on Sprint 2 sample products. |

---

## 10. Hand-off to Claude Code

Order of operations on receipt:

1. **Read 3 docs together:** `GAP_ANALYSIS_ROUTING_PATTERN.md` (decision rationale), `SPRINT_PLAN_ROUTING_STD_TIME.md` (4.1 baseline), this file (4.2 plan)
2. **Decide delivery cadence:** combined 4.1+4.2 (10 days, single migration) OR sequential (4.1 first, then 4.2 — but Sprint 4.1 schema needs amendment per §6 before kickoff anyway)
3. **Day 1 of combined sprint:** RT22+RT23+RT24 migrations (single migration file recommended) + RT26 audit hooks
4. **Pattern-level commits:** `[SP4.2-RT##] <story> — <DoD met>` per task; group by Epic
5. **Sprint close:** append `## [Sprint 4.2] — <date>` to `CHANGELOG.md`; commit ADR-0005; call Notion connector (under user's team page) with closeout report

**Notion log payload (template):**
```
Title: BDT Sprint 4.2 Closeout — Routing Pattern Option 3 (Hybrid)
Body:
  - 80 h delivered / 80 h planned
  - 6 new tables + 1 amended (mrp_routing_workcenter)
  - 22 stories, X tests, Y endpoints
  - Schema validated against 4 Sprint 2 sample products: 100% bind rate
  - Override demo: WH-CO-1 with 1 override → recompute matches expected
  - Custom routing demo: pipe diagonal with 4 ops only → recompute independent
  - ADR-0005-routing-pattern-option3.md committed
  - Known issues: S4 ECO gate is service-layer only until Sprint 5; S5 custom_routing→template promotion deferred
  - Demo recording: …
  - Next sprint preview: Sprint 5 — MO/WO/SN + ECO + WO snapshot population
```

**Final note:** Sprint 4.2 makes the routing system production-ready for BDT's 50,000+ custom-product workload with no schema explosion. Combined with Sprint 4.1, the routing module is feature-complete except for MO/WO execution (Sprint 5) and quality/skill governance (Sprint 6).

---

*— end of Sprint 4.2 plan. Hand off to Claude Code for combined Sprint 4.1+4.2 implementation.*
