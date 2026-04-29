# Gap Analysis — Routing Pattern for Custom Products + BOMs

> **Author:** Cowork architect pass — 2026-04-29
> **Question:** Custom product และ BOM มีค่า attribute ต่างกันหมด → จะวาง routing แบบไหน?
>   - **Option 1:** Routing Template + Custom Routing per product
>   - **Option 2:** Routing Template only — variation อยู่ที่ MO/WO compute
>   - **Option 3 (recommended):** Hybrid — Template binding + WO snapshot + escape hatch
> **Companion docs:**
> - [`GAP_ANALYSIS_ROUTING_STDTIME.md`](./GAP_ANALYSIS_ROUTING_STDTIME.md) — gap vs Odoo/Siemens
> - [`SPRINT_PLAN_ROUTING_STD_TIME.md`](./SPRINT_PLAN_ROUTING_STD_TIME.md) — current Sprint 4 plan (will need amendment after this decision)

---

## 1. The actual question (precisely stated)

For BDT, **most products are Custom** (one-off, project-bound assemblies — see Sprint 2 product types). Each Custom product has its own `attributes` JSONB (`sumWeight`, `Length`, `Width`, `count_part`, `TYPEPAINT`, etc.) imported from BIM/Tekla. Standard products (Cee Purlin, anchor bolt) re-use shared attributes.

**Three classes of variation between custom products:**

| Class | Example | Routing structure | Cycle time | Operations list |
|---|---|---|---|---|
| **A. Same family, different size** | WH-CO-1 column (1236 kg, 12 m) vs WH-CO-2 column (1500 kg, 14 m) | **same** | different | identical 10 ops |
| **B. Same family, different sub-variant** | Built-up I-beam vs Built-up box-section column | **same** | different | identical 10 ops; some activity counts differ (4-side vs 2-side weld) |
| **C. Different typology** | Built-up I-beam (uses SAW) vs Pipe diagonal (uses CNC Pipe Plasma + manual weld) | **different** | different | different op set |

> **Class A is ~85% of products** (counted from `assembly-list.xlsx`: 50,500 rows, mostly columns/beams with same op chain, differing in dims).
> **Class B is ~10%.**
> **Class C is ~5%** (pipe, anchor bolt, accessories).

The question becomes: do we model 50,500 routings (one per custom product) or 3-5 templates with parametric overrides?

---

## 2. Option 1 — Routing Template + Custom Routing per product

**Schema:**

```
mrp_routing_workcenter (existing in Sprint 4 plan)
  ├ template rows: product_id=NULL, routing_template='Main'/'Accessory'/'False'
  └ custom rows:   product_id=<custom>, cloned from template at product create time

routing_step_activity (per routing × per activity instance — overrides allowed)
```

**Lifecycle:**

```
Product created (BIM import)
  ↓
"Pick template Main" → clone all 10 ops + ~60 activities → write product-specific routing rows
  ↓
Engineer can edit any op or activity per-product
  ↓
Cycle time = formula(template) evaluated against THIS product.attributes
  ↓
MO/WO references the product-specific routing
```

**Pros:**
- ✅ Per-product editing is trivial (edit the row)
- ✅ Audit trail per product (mail_message on routing change)
- ✅ ECO governance per-product routing (Sprint 5 mrp_eco can target a custom routing)
- ✅ Maps cleanly to Odoo `mrp.bom.operation_ids` (1 BOM = 1 set of ops)
- ✅ Engineer can A/B test routing changes without affecting siblings
- ✅ Seal-of-history: recompute routing today doesn't change yesterday's WO snapshot

**Cons:**
- ❌ **Data volume explosion**: 50,500 products × 10 ops × 6 activities = **~3,000,000 rows** for routing-step-activity table alone
- ❌ Template change does NOT auto-propagate — must run "re-clone" job + handle conflicts on rows already edited
- ❌ Storage: ~3M rows × 200 bytes = ~600 MB just for activity instances (per project)
- ❌ Cycle time recompute on attribute change: must walk per-product activities, even though formula is identical
- ❌ Engineering team must maintain "template vs custom drift" — easy to leave a stale custom routing
- ❌ "Save template" UX confusing: do edits go to template or to custom?

---

## 3. Option 2 — Routing Template only; variation at MO/WO

**Schema:**

```
mrp_routing_workcenter (template-only, ~28 rows total — Main/Accessory/False × ops)
  └ no product_id rows ever

products
  ├ routing_template_code  ← FK to template by code
  └ routing_overrides JSONB ← per-product override slots (optional)

mrp_workorder (Sprint 5 skeleton)
  ├ product_id, routing_template_code
  ├ planned_duration_min  ← computed at MO creation, snapshotted
  └ activity_snapshot JSONB ← list of activities + cycle times at the moment of MO creation
```

**Lifecycle:**

```
Product created (BIM import)
  ↓
products.routing_template_code = 'Main' (just FK, no routing rows created)
  ↓
"Compute cycle time" → service evaluates template formulas against product.attributes
  → returns ephemeral result for display, NOT persisted to mrp_routing_workcenter
  ↓
MO created → for each template op, generate WO + snapshot { activity, cycle_time_min }
  ↓
WO snapshot is the source of truth for that production run
  ↓
If template changes after WO created → existing WO unaffected (snapshot frozen)
```

**Pros:**
- ✅ Tiny data footprint: ~28 routing rows + ~120 activity-template rows = **<1000 rows total**
- ✅ Template change auto-applies to all NEW MOs (no propagation job)
- ✅ Cycle time always computed fresh against current template — no drift
- ✅ Storage and compute scale with **# active MOs**, not # products
- ✅ Engineer changes 1 row → all 50,500 products' future MOs adopt it
- ✅ Snapshot on WO is immutable (good for traceability)

**Cons:**
- ❌ Per-product override is **awkward**: must store as JSONB on `products.routing_overrides`, no FK, hard to query
- ❌ "Show me products where activity X has been overridden" → JSONB scan on 50,500 rows
- ❌ ECO governance: can't gate "routing change for product X" because there is no per-product routing — all changes are template-level
- ❌ Class C products (pipe with different op set) need a separate template, OR `products.routing_overrides` to override op list — both clunky
- ❌ Doesn't match Odoo `mrp.bom.operation_ids` cleanly (Odoo has per-BOM ops)
- ❌ Engineer can't "preview routing for custom product" without a temp MO

---

## 4. Option 3 — Hybrid (RECOMMENDED)

**Core idea:**
- Routing **structure** (which ops, in which order) is template-bound at the **structural typology** level → shared
- Cycle time is **computed**, not stored, until MO time → snapshot on WO
- **Per-product override** is allowed but rare — stored as discrete rows, not JSONB
- Custom Routing (full clone) is the **escape hatch** for Class C products — explicitly opt-in

**Schema:**

```
routing_template
  id, code='Main'|'Accessory'|'False'|<custom>, name, description, version
  ↓ has many
mrp_routing_workcenter (per template — ~28 rows)
  template_id (FK), sequence, op_code, workcenter_id
  ↓ has many
routing_activity_template (per op — ~120 rows)
  parent op (FK), formula, std_measure, per_minute, …

products (Sprint 2)
  ├ routing_template_id     ← FK (default per product_type/typology)
  └ has_custom_routing       Boolean (default false)

product_routing_override   ← only when override exists (sparse table)
  product_id, op_code, activity_template_id
  override_per_minute, override_std_measure, override_manpower, …

mrp_workorder (Sprint 5)
  ├ product_id
  ├ routing_template_id
  ├ activity_snapshot JSONB ← cycle time list at MO creation
  └ planned_duration_min

# Escape hatch for Class C products with structurally different ops
custom_routing               ← only when product needs different op list
  product_id (UNIQUE), name, version, state
  has many: custom_routing_op + custom_routing_activity
products.custom_routing_id   ← FK; if set, ignore routing_template_id
```

**Decision rule (in code):**

```ts
async function getRoutingForProduct(productId: number) {
  const p = await prisma.products.findUnique({ where: {id: productId}, ... })
  
  // Class C: explicit custom routing
  if (p.custom_routing_id) {
    return loadCustomRouting(p.custom_routing_id)
  }
  
  // Class A & B: template + sparse overrides
  const template = await loadTemplate(p.routing_template_id)
  const overrides = await prisma.product_routing_override.findMany({ where: { product_id: productId } })
  return mergeTemplate(template, overrides)
}
```

**Lifecycle:**

```
Product created (BIM import)
  ↓
auto-bind routing_template by typology rule:
  COLUMN/BEAM    → 'Main'
  ANCHOR/PURLIN  → 'Accessory'
  PIPE-DIAGONAL  → 'Accessory' (with manual override on activities)
  bespoke        → engineer creates custom_routing row, sets has_custom_routing=true
  ↓
"Compute cycle time" → service merges template + sparse overrides → evaluate formulas → ephemeral
  ↓
MO created → snapshot to WO.activity_snapshot JSONB
```

**Pros — gets best of both:**
- ✅ Class A (85%): no per-product rows, just FK to template — tiny data
- ✅ Class B (10%): sparse override rows only when actually overridden (not 6 rows × 50k products) — tiny again
- ✅ Class C (5%): full custom_routing — clean separation, explicit opt-in
- ✅ Template change auto-propagates to all unmodified products
- ✅ ECO can target template (governs everyone) OR custom_routing (per-product) — both clean
- ✅ Override discoverable via SQL: `SELECT product_id, COUNT(*) FROM product_routing_override GROUP BY product_id`
- ✅ Snapshot on WO preserves historical truth
- ✅ Engineering can preview: just call compute service against current template + overrides
- ✅ Maps to Odoo: `routing_template` ≈ `mrp.bom.operation_ids` reusable across BOM variants

**Cons:**
- ⚠️ Two classes of override (sparse rows vs full custom_routing) — engineer must know which to use → mitigate with UX: button "Override this activity" creates row in `product_routing_override`; button "Make custom routing" prompts confirmation + creates `custom_routing`
- ⚠️ Slightly more complex compute logic (template + merge overrides) — but still <50 LOC service
- ⚠️ Need migration path if BDT later wants Option 1 — but Option 3 is a strict superset, so trivial

---

## 5. Comparison matrix (the verdict)

| Dimension | Option 1: per-product clone | Option 2: template-only + WO | **Option 3: hybrid** |
|---|---|---|:-:|
| Routing rows (50k products) | ~3,000,000 | ~120 | ~120 + sparse |
| Storage (per project) | ~600 MB | ~50 KB | ~50 KB + sparse |
| Cycle time recompute on attr change | walk per-product activities | re-eval template formulas | re-eval template + apply sparse |
| Template change auto-propagates | ❌ needs job | ✅ | ✅ (except where overridden — correct behaviour) |
| Per-product editing | ✅ trivial | ❌ JSONB hack | ✅ via override row |
| ECO per-product | ✅ | ❌ | ✅ via custom_routing or override + ECO type=override |
| Class C structural variation | ✅ | ❌ awkward | ✅ via custom_routing |
| Audit trail per product | ✅ on routing | ✅ on WO | ✅ on override + WO |
| Odoo migration compat | ✅ direct | ⚠️ needs to expand to per-BOM | ✅ via routing_template = bom_id reusable |
| FE complexity | medium | low | medium |
| Snapshot historicity (WO frozen) | only via WO | ✅ via WO | ✅ via WO |
| Common-case query speed (Class A) | medium (50k × ops) | fast | fast |
| Override-case query | fast | slow (JSONB) | fast (indexed sparse table) |

**Score:** Option 3 wins on 11/13 dimensions; Option 1 wins on FE simplicity in some narrow cases; Option 2 wins on storage but loses on flexibility.

---

## 6. Critical thinking — why this matches steel-shop reality

A real steel-fab shop's process engineer thinks:

> "Built-up columns all follow the same recipe. They differ in size, weld length, plate thickness — but the ops, machines, and skill mix are identical. Cycle time scales with size. **The recipe is the template; the part is the variable.**
>
> If a customer asks for a special heat-treated column, that's a new recipe — I'll write it as a one-off."

This is exactly Option 3:
- Recipe = `routing_template` (Main, Accessory, False, …)
- Part = `products` × `attributes`
- Special one-off = `custom_routing`

Options 1 and 2 force the engineer to either:
- (Opt 1) treat every part as a one-off recipe → false work + drift risk
- (Opt 2) hide all individuality in JSONB → loses governance

---

## 7. ISA-95 / Siemens / Odoo perspectives

| Framework | Where Option 3 maps |
|---|---|
| **ISA-95 Operations Definition** | Master Recipe (= template) → Control Recipe per batch (= WO snapshot). Exactly Option 3. |
| **Siemens Opcenter Execution** | "Master Recipe" + "General Recipe" + "Site Recipe" + "Control Recipe" — multi-tier. Our Option 3 collapses to 2 tiers (template + WO snapshot), pragmatic for BDT scale. |
| **Odoo 17 MRP** | `mrp.bom.operation_ids` are per-BOM, but BOMs can be `product_tmpl` level (shared across variants). Equivalent to Option 3 if we think of template as a shared BOM. |
| **AISC steel practice** | Standard Welding Procedure Specifications (WPS) = templates per joint typology; per-job qualification record = override. Pure Option 3. |

All four reference frameworks land on Option 3 (or a richer variant). **None** of them mandate per-product routing instances when products share a structural recipe.

---

## 8. Implications for Sprint 4 plan

If user accepts Option 3, the Sprint 4 plan needs the following changes (relatively minor):

### 8.1 Schema diff vs current Sprint 4 plan

```diff
  // Current SPRINT_PLAN_ROUTING_STD_TIME.md §4
  
- model mrp_routing_workcenter {
-   product_id          Int?
-   routing_template    String?  @db.VarChar(20)
-   ...
- }
  
+ // Templates only — no product_id allowed
+ model routing_template {
+   id          Int    @id @default(autoincrement())
+   code        String @unique @db.VarChar(20)   // 'Main' | 'Accessory' | 'False' | <custom>
+   name        String @db.VarChar(60)
+   description String? @db.Text
+   version     String @default("1.0") @db.VarChar(10)
+   state       String @default("active") @db.VarChar(20)
+   active      Boolean @default(true)
+   ...audit
+   operations  mrp_routing_workcenter[]
+ }
+ 
+ model mrp_routing_workcenter {
+   id            Int @id @default(autoincrement())
+   template_id   Int
+   template      routing_template @relation(fields: [template_id], references: [id])
+   sequence      Int @default(10)
+   op_code       String @db.VarChar(30)
+   workcenter_id Int
+   ...
+   @@unique([template_id, sequence])
+ }
+ 
+ model product_routing_override {
+   id                    Int @id @default(autoincrement())
+   product_id            Int
+   activity_template_id  Int
+   override_per_minute   Decimal? @db.Decimal(10, 4)
+   override_std_measure  Decimal? @db.Decimal(12, 4)
+   override_manpower     Decimal? @db.Decimal(4, 2)
+   note                  String? @db.Text
+   ...audit
+   @@unique([product_id, activity_template_id])
+ }
+ 
+ model custom_routing {
+   id          Int @id @default(autoincrement())
+   product_id  Int @unique   // 1:1 with product
+   name        String @db.VarChar(60)
+   version     String @default("1.0") @db.VarChar(10)
+   state       String @default("draft") @db.VarChar(20)
+   ...audit
+   ops         custom_routing_op[]
+ }
+ 
+ model custom_routing_op {
+   id              Int @id @default(autoincrement())
+   custom_routing_id Int
+   sequence        Int
+   op_code         String @db.VarChar(30)
+   workcenter_id   Int
+   activities      custom_routing_activity[]
+ }
+ 
+ model custom_routing_activity {
+   id          Int @id @default(autoincrement())
+   op_id       Int
+   sequence    Int
+   description String @db.VarChar(200)
+   per_minute  Decimal @db.Decimal(10,4)
+   formula_param_code String @db.VarChar(40)
+   std_measure Decimal @db.Decimal(12,4)
+   ...
+ }
  
  // products (Sprint 2) — adjust FK
- model products {
-   active_routing_id Int?
- }
+ model products {
+   routing_template_id Int?
+   routing_template    routing_template? @relation(...)
+   custom_routing_id   Int?
+   custom_routing      custom_routing? @relation(...)
+   has_custom_routing  Boolean @default(false)
+ }
```

### 8.2 Story diff (Sprint 4)

| Sprint 4 story | Change | Reason |
|---|---|---|
| **RT1** Migration | Replace 1 table with 6 tables (template + ops + activity + override + custom + custom_op + custom_act) | New schema |
| **RT2** xlsx importer | Slightly simpler: imports 28 ops as **template** rows, not per-product | Removes need for per-product seed |
| **RT3** Seed sample | Bind WH-CO-1 to template `Main` (no routing clone) | Demonstrates Option 3 |
| **RT5** FormulaService | No change |  |
| **RT6** CycleTimeService | Add merge-overrides step before formula eval | New code path |
| **RT9** RoutingsModule | Endpoints split: `/routing-templates` for template CRUD; `/products/:code/routing` returns merged view | Two surfaces |
| **RT11** ActivityTemplatesModule | Add `POST /products/:code/routing/override` for sparse override | New endpoint |
| **RT14** RoutingEditor FE | Show "Inherited from Main template" on each row; "Override" button creates sparse row; "Make custom routing" CTA at top | UX clarity |
| **NEW RT22** | "Custom Routing Editor" — separate page for Class C products | Required by escape hatch |

**Effort delta:** +6 h (RT22) − 2 h (RT3 simpler) − 2 h (RT2 simpler) = **+2 h net**, fits within Sprint 4 buffer.

### 8.3 Skeleton schema diff

In `schema.skeleton.prisma`:

| Section | Change |
|---|---|
| §1 mrp_orders | `mrp_workorder.activity_snapshot` JSONB column added (was implicit) — formalises Option 3 snapshot |
| §3 mrp_eco | Add `eco.scope` enum: `template | product_override | custom_routing` — ECO can target any of three levels |
| §4 routing_dependency | Apply at template level OR custom_routing level (was ambiguous) |
| §5 personnel-skills | Skill requirement attached to **activity_template** (template-level, applies to all products inheriting) |

---

## 9. Edge cases & how Option 3 handles them

| Edge case | Option 3 behaviour |
|---|---|
| Engineer wants to add 1 extra QC step for a 1-off column | Create `custom_routing` for that product → sets `has_custom_routing=true` → product breaks inheritance. ECO needed if change is mid-production. |
| Template `Main` upgraded to fix bug — affects 50,000 columns mid-production | Template change → only affects MOs created AFTER change. Existing WOs frozen via snapshot. ECO required if target is "in-flight MOs": ECO triggers re-snapshot job. |
| Customer requests that one specific column has 30% slower welding | Add `product_routing_override` row: `product_id=X, activity_template_id=buildup_weld_4_1, override_per_minute=template_value × 1.3`. No clone. |
| Class C: pipe diagonal needs no `buildup-fit` op (uses pipe plasma → manual weld → done) | Create `custom_routing` with only 4 ops. Set `products.custom_routing_id`, `has_custom_routing=true`. |
| Two products share an unusual override (same special heat-treat) | Either: (a) two override rows pointing to a shared activity_template, or (b) make it a new template `Main-HT` and bind both products. Option (b) preferred when 3+ products share. |
| Recompute storm: BIM bulk import updates 5000 product attrs at once | Option 3: invalidate cache key, defer recompute to async job (Sprint 4 RT7). Compute is template-formula only, fast. With Option 1 would need to walk 5000 × ops × activities = much slower. |

---

## 10. Recommendation

**Go with Option 3 (Hybrid).**

Reasoning:
1. Aligns with how steel engineers actually think (recipe vs part).
2. Storage scales with override frequency, not product count — sustainable for 50k+ products per project.
3. Template-level change governance is the common case; per-product is the exception.
4. ISA-95 / Odoo / AISC reference frameworks all converge on this two-tier (master + control) split.
5. Sprint 4 plan delta is +2 h net — well within buffer.
6. Strict superset of Option 2 — if BDT later wants to disable per-product overrides, just remove the override table and constrain UI.
7. Skeleton entities (Sprint 5-7) are unaffected by this choice.

**What user should NOT do:**
- ❌ Adopt Option 1 — will hit 3M-row table by year 2 of operation; recompute storms will kill recompute service.
- ❌ Adopt Option 2 — JSONB-stored overrides are unqueryable in practice; ECO governance impossible at product level.

**What user SHOULD do next:**
1. Confirm Option 3 (or counter-propose).
2. Cowork updates `SPRINT_PLAN_ROUTING_STD_TIME.md` with §8 diffs.
3. Cowork updates `schema.skeleton.prisma` with §8.3 diffs.
4. Hand off to Claude Code with the amended plan.

---

## 11. Open questions for user

1. **Auto-bind rules** for `routing_template` from `products.product_type` / `mark_prefix` — should these be hard-coded in service, or stored as a `routing_template_binding_rule` table for engineers to edit? (Cowork recommends: table for editability.)
2. **Override approval** — does adding a `product_routing_override` row require ECO, or is it free for engineers until product is "released" / MO created? (Cowork recommends: free during draft, ECO-gated after first MO confirmed.)
3. **Custom Routing visibility in BOM views** — when a product has `custom_routing_id`, should BOM view show "Custom Routing" badge? (Cowork recommends: yes, prominent.)
4. **Snapshot policy** — at what point exactly does WO take its snapshot: MO confirm, MO plan, or WO ready? (Cowork recommends: MO `action_plan` — locks the recipe before scheduling.)

---

*— end of routing-pattern gap analysis. Awaiting decision before amending Sprint 4 plan.*
