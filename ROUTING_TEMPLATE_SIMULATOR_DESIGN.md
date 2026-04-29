# Routing Template Simulator — Design Analysis

> **Author:** Cowork architect pass — 2026-04-29
> **Scope:** UX/UI + API design for the template-only routing page with a 2-mode simulator
> **Companion docs:**
> - [`SPRINT_PLAN_ROUTING_STD_TIME_4_2.md`](./SPRINT_PLAN_ROUTING_STD_TIME_4_2.md) — Option 3 plan (this design adds stories RT44–RT47)
> - [`GAP_ANALYSIS_ROUTING_PATTERN.md`](./GAP_ANALYSIS_ROUTING_PATTERN.md) — Option 3 decision
> - [`GAP_ANALYSIS_ROUTING_STDTIME.md`](./GAP_ANALYSIS_ROUTING_STDTIME.md) — formula model

---

## 1. Why this matters (rationale)

The Sprint 4.1 RoutingEditor is per-product (RT14). After Option 3, **the Routing page becomes the template editor** — engineers design recipes here that drive 50,000+ products. Without a simulator on this page:

- Engineers must create a real product, bind it, recompute, just to see if a template works → **slow round-trip**
- Edge cases (very heavy, very long, unusual welding size) need real BIM data — often missing during template authoring
- Cannot demonstrate to managers "this template will give 7,200 min for a 1500 kg / 12 m column"

**Practice basis:**
- **Siemens Opcenter:** *Master Recipe Validation* — recipes must be tested against representative product specs before activation
- **ISA-95 §5.3:** *Product Production Rule* must declare expected input ranges + reference values
- **AISC steel:** Welding Procedure Specification (WPS) is qualified on coupons before production qualification — same principle

The simulator IS the BDT equivalent of WPS qualification — a what-if box bolted onto the template authoring page.

---

## 2. Attribute inventory — what the simulator needs as input

I walked through all 19 formula parameters in `parameter` sheet × all 923 activity rows × `activities_parameter` glossary to extract the **closed set of inputs** the formula engine ever reads.

### 2.1 Raw inputs (from `products.attributes` JSONB — Sprint 2 already imports)

These are **direct fields** the engineer would supply manually OR pull from a real product:

| # | Field | Unit | Source in BIM | Notes |
|---|---|---|---|---|
| 1 | `sumWeight` | kg | aggregated from parts | total assembly weight |
| 2 | `Length` | m (or mm — see §2.4) | Tekla bbox | main longitudinal dimension |
| 3 | `Width` | m | Tekla bbox | secondary dim (flange width for I-beam) |
| 4 | `Height` (xlsx: `Hight`) | m | Tekla bbox | for pipe = OD; for beam = web height |
| 5 | `count_part` | int | Tekla parts list | # of sub-parts (= part_quan) |
| 6 | `count_tag` | int | Tekla tag groups | # of mark groups |
| 7 | `sumNet_surface_area` | m² | Tekla surface | total paintable surface |
| 8 | `TYPEPAINT` | enum string | engineer set | paint code; routes to primer/fireproof/topcoat |

### 2.2 Manual-input attributes (engineer estimates — never come from BIM auto)

| # | Field | Unit | Notes |
|---|---|---|---|
| 9 | `buildup_weldingsize` | mm | weld bead leg/throat — design choice |
| 10 | `product_welding_length` | m | total weld length not from buildup (manual cal per drawing) |
| 11 | `welding_remaining_length` (xlsx: ความยาวแนวเชื่อมที่เหลือ) | m | residual weld length (e.g., stiffener → web) |
| 12 | `pipe_perimeter` | m | for pipe routing — could be auto-computed from `Height` (OD) but xlsx treats as input |
| 13 | `welding_point` | int | for pipe routing — # of weld points (= part × 2 typically) |
| 14 | `grinding_point` | int | secondary grinding location count |
| 15 | `burning_point` | int | heat-straightening point count |

### 2.3 Derived attributes (computed inside formula engine — not direct inputs)

The 19 named formula parameters in `parameter` sheet that the engine evaluates from raw inputs above:

```
buildup_weight        = sumWeight * 0.8                       (raw: sumWeight)
buildup_perimeter     = (Length * 2) + (Width * 2)            (raw: Length, Width)
buildup_weldingpoint  = 2 * (Length / 0.2)                    (raw: Length)
buildup_weldingsize   = manual                                 (input #9)
per unit              = 1 (constant)                           (no input)
part_quan             = count_part                             (raw: count_part)
assembly_point        = count_part                             (raw: count_part)
product_welding_length= manual                                 (input #10)
product_length        = Length                                 (raw: Length)
product_perimeter     = (Length * 2) + (Width * 2)            (raw: Length, Width)
product_area          = sumNet_surface_area                    (raw: sumNet_surface_area)
section_perimeter     = (undefined in xlsx — flag warning)
dimeter               = Height                                 (raw: Height — pipe OD)
part Length           = Length                                 (raw: Length)
จำนวน joint           = count_part * 2                         (raw: count_part)
จุดการเชื่อม          = count_part * 2                         (raw: count_part)
ความยาวแนวเชื่อม pipe  = pipe_perimeter                        (input #12)
ความยาวแนวเชื่อมที่เหลือ = manual                              (input #11)
type paint (routing)   = TYPEPAINT                             (raw: TYPEPAINT)
```

### 2.4 Unit consistency note

xlsx mixes `mm` and `m` (e.g., `Length` is m in BIM but `buildup_weldingsize` is mm). The simulator MUST display unit clearly per field. Unit conversion happens inside `FormulaService` (Sprint 4.1 RT5) — already covered.

### 2.5 What the simulator displays per template (not per activity)

For a given template (e.g., `Main`), iterate all `routing_op_activity → activity_template → formula_param.inputs_required` and **union** the set. Most templates need ~6–10 inputs (not all 15).

Endpoint: `GET /routing-templates/:id/required-attrs` → returns:

```json
{
  "template_id": 1,
  "template_code": "Main",
  "required_attrs": [
    {"name": "sumWeight",      "kind": "raw",    "unit": "kg",  "used_in_activities": 12, "default_for_simulation": 1500},
    {"name": "Length",         "kind": "raw",    "unit": "m",   "used_in_activities": 18, "default_for_simulation": 12},
    {"name": "Width",          "kind": "raw",    "unit": "m",   "used_in_activities": 6,  "default_for_simulation": 0.4},
    {"name": "count_part",     "kind": "raw",    "unit": "pcs", "used_in_activities": 4,  "default_for_simulation": 18},
    {"name": "buildup_weldingsize", "kind": "manual", "unit": "mm", "used_in_activities": 6, "default_for_simulation": 6},
    {"name": "product_welding_length", "kind": "manual", "unit": "m", "used_in_activities": 2, "default_for_simulation": 8},
    {"name": "TYPEPAINT",      "kind": "raw",    "unit": "code", "used_in_activities": 3,  "default_for_simulation": "RO-PAINT-001"}
  ]
}
```

The `default_for_simulation` is seeded in the template (engineer sets a "representative product" baseline once; simulator uses it as starting point in manual mode).

---

## 3. UX design — 2 modes

### 3.1 Page layout (RoutingEditor — TEMPLATE view, post-Option 3)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Routing Template: Main                                  [active] [▾]   │
│  ────────────────────────────────────────────────────────────────────  │
│  Built-up Beam Standard · v1.0 · 10 ops · 62 activities · 6 inputs req  │
│  Bound products: 1,832 · Overrides: 14 · Custom routings: 3             │
└─────────────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────┬──────────────────────────────────────┐
│ LEFT — TEMPLATE STRUCTURE        │ RIGHT — SIMULATOR PANEL              │
│ (drag-drop op list, edit, etc.)  │                                      │
│                                  │ ┌──────────────────────────────────┐ │
│ ▼ 10 · prepare-material          │ │  Try this template                │ │
│   ─ retrieve, lay out, mark      │ │  [● Pick product] [○ Manual input]│ │
│ ▼ 20 · buildup-fit               │ ├──────────────────────────────────┤ │
│   ─ lift, assemble, tack…        │ │  ✦ Pick product mode             │ │
│ ▼ 30 · buildup-welding           │ │   Search: [WH-CO-1            ▾]│ │
│   ─ 4-side weld + flips          │ │   ─────────────────────────────  │ │
│ ▼ 40 · fitup                     │ │   WH-CO-1 (CMBDT4 / zone1)        │ │
│ ▼ 50 · welding                   │ │   sumWeight    1,236.6 kg  [✓]   │ │
│ ▼ 60 · grinding                  │ │   Length         12.000 m  [✓]   │ │
│ ▼ 70 · primer                    │ │   Width           0.400 m  [✓]   │ │
│ ▼ 80 · fireproof                 │ │   count_part         18 pcs[✓]   │ │
│ ▼ 90 · topcoat                   │ │   buildup_weldingsize ⚠ missing  │ │
│ ▼ 100· qc-inspect                │ │     [enter manually]: [6  ] mm   │ │
│                                  │ │   product_welding_length ⚠       │ │
│                                  │ │     [enter manually]: [8  ] m    │ │
│                                  │ │   TYPEPAINT  RO-PAINT-001  [✓]   │ │
│                                  │ │                                  │ │
│                                  │ │   [ ▶ Run simulation ]           │ │
│                                  │ ├──────────────────────────────────┤ │
│                                  │ │  Result                          │ │
│                                  │ │  Total: 7,248 min (≈ 121 h)      │ │
│                                  │ │  Cost:  ฿ 14,520                  │ │
│                                  │ │  ─────                            │ │
│                                  │ │  prepare-material      120 min   │ │
│                                  │ │  buildup-fit           640 min   │ │
│                                  │ │  buildup-welding     1,860 min   │ │
│                                  │ │  fitup                 720 min   │ │
│                                  │ │  welding             2,200 min   │ │
│                                  │ │  grinding              340 min   │ │
│                                  │ │  primer                420 min   │ │
│                                  │ │  fireproof             420 min   │ │
│                                  │ │  topcoat               420 min   │ │
│                                  │ │  qc-inspect            108 min   │ │
│                                  │ │                                  │ │
│                                  │ │  [ Save as test fixture ]        │ │
│                                  │ │  [ Compare with another sample ] │ │
│                                  │ └──────────────────────────────────┘ │
└──────────────────────────────────┴──────────────────────────────────────┘
```

### 3.2 Mode 1 — Pick Product

```
[● Pick product] [○ Manual input]

Search: [type product code or mark…           ▾]
        ↓
Autocomplete dropdown (server-side fuzzy search on products):
  WH-CO-1  · Column · 0X202 / zone1 · 1236.6 kg
  WH-CO-2  · Column · 0X202 / zone1 · 1500.0 kg
  WH-BE-1  · Beam   · 0X202 / zone3 · 890.4 kg
  ↓ select WH-CO-1
        ↓
[GET /products/WH-CO-1 → returns products.attributes JSONB]
Pre-fill all fields with product values. 
  - Field exists in attributes → ✓ green tick + value shown read-only-ish (still editable)
  - Field missing in attributes → ⚠ amber warning + manual entry box appears
        ↓
[ ▶ Run simulation ] — calls POST /routing-templates/:id/simulate
```

**Key UX details:**
- Search is server-side fuzzy on `product_code`, `mark_no`, `name` — already exists in Sprint 2 product list endpoint, just reuse with `?simulator_mode=true` flag
- Selected product shown in summary card (zone, project, key dims)
- User can **edit** any pre-filled value (override per-simulation, doesn't persist to product) — useful for "what if this product were 20% heavier?"
- Edited fields get a subtle "modified from product" badge

### 3.3 Mode 2 — Manual input

```
[○ Pick product] [● Manual input]

   sumWeight              [             ] kg
   Length                 [             ] m
   Width                  [             ] m
   Height                 [             ] m
   count_part             [             ] pcs
   sumNet_surface_area    [             ] m²
   TYPEPAINT              [RO-PAINT-001 ▾]
   buildup_weldingsize    [             ] mm
   product_welding_length [             ] m

   ↳ "Use template defaults" link → fills with default_for_simulation values

[ ▶ Run simulation ]
```

**Key UX details:**
- Each field shows **unit + tooltip** explaining what it is (use template's first activity description as hint)
- "Use template defaults" pre-fills with `routing_template.default_input_spec` (engineer-curated representative values — see §5.1 schema addition)
- Validation: required fields highlighted on submit; form errors shown inline
- For TYPEPAINT and other enum fields: dropdown with codes from xlsx `standard code` sheet

### 3.4 Result panel (shared between both modes)

```
┌──────────────────────────────────────────────────────────────────────┐
│ Result · WH-CO-1 (Pick product)                          [✕ Clear]   │
├──────────────────────────────────────────────────────────────────────┤
│  Total cycle time   7,248 min   ≈ 120.8 h                            │
│  Total std cost     ฿ 14,520                                          │
│  Critical path      buildup-welding (1,860 min — 25.7%)              │
├──────────────────────────────────────────────────────────────────────┤
│  Breakdown by op:                                                     │
│   ┃ prepare-material     120 min   1.7% [▕]                          │
│   ┃ buildup-fit          640 min   8.8% [▕▕▕▕]                       │
│   ┃ buildup-welding    1,860 min  25.7% [▕▕▕▕▕▕▕▕▕▕▕▕]               │
│   ┃ fitup                720 min   9.9% [▕▕▕▕▕]                      │
│   ┃ welding            2,200 min  30.4% [▕▕▕▕▕▕▕▕▕▕▕▕▕▕]            │
│   ┃ ...                                                               │
├──────────────────────────────────────────────────────────────────────┤
│  Per-activity (expandable — click op above to drill down)             │
│  ⓘ Hover any row to see formula trace                                │
├──────────────────────────────────────────────────────────────────────┤
│  [ ◇ Save as test fixture ]   [ ⚖ Compare with another sample ]      │
└──────────────────────────────────────────────────────────────────────┘
```

**Key UX details:**
- Bar chart shows op proportions — visually identifies bottleneck activity
- Click op → drill-down panel below shows per-activity rows + formula trace tooltip (reuse Sprint 4.1 §6.3 trace pattern)
- "Save as test fixture" → optional — saves the input set to template for regression testing (Sprint 4.2 in scope or deferred per §7)
- "Compare" → opens dual-pane: pick a 2nd sample → side-by-side per-op deltas

### 3.5 Mode toggle interaction

- Switching mode preserves manually-entered values (warns: "Switch will discard pick-product binding; keep your inputs?")
- Manual values entered in pick-product mode (overrides on top of product) are kept on switch to pure manual

---

## 4. API additions

```
GET  /api/v1/routing-templates/:id/required-attrs
     → { template, required_attrs[], default_input_spec }

GET  /api/v1/products?simulator_mode=true&q=WH-CO   ← reuses existing search
     → product list with attributes JSONB included for fast pick

POST /api/v1/routing-templates/:id/simulate
     Body: {
       mode: 'pick_product' | 'manual',
       product_id?: number,                 // when pick_product (still allow manual overrides)
       attribute_overrides?: Record<string, any>  // when pick_product (override) or all values when manual
     }
     → {
       total_cycle_time_min: 7248.0,
       total_std_cost_thb: 14520.0,
       critical_op_id: 30,
       ops: [
         { op_id, name, sequence, cycle_time_min, cost_thb, pct_of_total,
           activities: [
             { activity_id, name, sequence, cycle_time_min, formula_trace, manpower, workcenter_name }
           ]
         }
       ],
       warnings: [
         "section_perimeter formula is undefined — used 0",
         "TYPEPAINT='RO-PAINT-001' triggered fireproof+topcoat path"
       ]
     }

POST /api/v1/routing-templates/:id/test-fixtures   ← deferred to RT47 (optional)
     Body: { name, mode, product_id?, attribute_overrides, expected_total_min }
     → saves a test fixture for regression
```

**Performance target:** simulate endpoint < 300 ms (no DB writes; just compute service against in-memory template + activity rows).

---

## 5. Schema additions (minimal)

### 5.1 routing_template — add 1 column

```prisma
model routing_template {
  // ... existing fields from Sprint 4.2 §3.1 ...
  
  // Engineer-curated baseline values for simulator "Manual mode → Use defaults"
  default_input_spec Json?    // { sumWeight: 1500, Length: 12, Width: 0.4, count_part: 18, ... }
}
```

### 5.2 routing_template_test_fixture (NEW — optional Sprint 4.2 RT47, can defer)

```prisma
// 🟨 Saved simulator inputs as regression test fixtures
model routing_template_test_fixture {
  id                  Int       @id @default(autoincrement())
  template_id         Int
  template            routing_template @relation(fields: [template_id], references: [id], onDelete: Cascade)
  name                String    @db.VarChar(80)            // 'Standard 1500 kg / 12 m column'
  description         String?   @db.Text
  source_mode         String    @db.VarChar(20)            // 'pick_product' | 'manual'
  source_product_id   Int?                                  // if pick_product (snapshot at fixture creation)
  attribute_values    Json                                   // resolved input values used
  expected_total_min  Decimal?  @db.Decimal(10, 2)         // engineer's expected — CI compares actual vs expected ±5%
  expected_total_cost Decimal?  @db.Decimal(12, 2)
  // Audit
  create_uid          Int
  create_user         res_users @relation("rtf_create", fields: [create_uid], references: [id])
  create_date         DateTime  @default(now()) @db.Timestamptz

  @@index([template_id])
}
```

**Use case:** CI runs `simulate` against every fixture nightly; alerts on >5% drift after activity_template version bump. Strong protection against silent template regressions.

---

## 6. Edge cases

| # | Case | Behaviour |
|---|---|---|
| E1 | Product missing required attribute | Highlight amber, prompt manual entry; simulate still runs with provided values |
| E2 | Manual mode user submits with required field empty | 400 with field name; FE surfaces inline error |
| E3 | Template references undefined formula param (`section_perimeter` xlsx case) | Compute returns warning in `warnings[]`; activity using it gets `cycle_time_min=0 + warn flag`; doesn't fail entire simulation |
| E4 | Picked product has overrides | Simulator on TEMPLATE ignores overrides — explicitly tells user "this is template view; product has 2 overrides — see ProductDetail to compute with overrides applied" |
| E5 | Picked product `has_custom_routing=true` | Disable simulate button + banner: "This product uses custom routing, not template — switch to CustomRoutingEditor" |
| E6 | Switching mode mid-edit | Confirm dialog if values entered; preserve where compatible |
| E7 | TYPEPAINT routes to different op subset (primer/fireproof/topcoat) | Simulator output filters out non-applicable ops — show "skipped: 2 ops (primer/fireproof) — TYPEPAINT='topcoat-only'" note |
| E8 | Negative or out-of-range input (e.g., Length = -5) | FE validation rejects; backend defensive: `Math.max(0, val)` + warning |
| E9 | Product attribute exists but wrong type (string instead of number) | FormulaService coerces; if NaN, returns `cycle_time=NaN + error in warnings[]` |
| E10 | Bulk simulation (run all fixtures at once) | Sprint 4.2 RT47 adds `POST /routing-templates/:id/simulate-fixtures` returning array — single endpoint, 1 round trip |

---

## 7. Effort & Sprint 4.2 integration

### 7.1 New stories (added to Sprint 4.2)

| ID | Tag | Story | Effort |
|---|:-:|---|---|
| **RT44** | 🟦 | API: `GET /routing-templates/:id/required-attrs` — walks template → ops → activities → unions formula_param.inputs_required; returns kind/unit/used_in_count + default_input_spec | 3 h |
| **RT45** | 🟨 | API: `POST /routing-templates/:id/simulate` — pure compute, no DB write; reuses CycleTimeService with pluggable attribute source (product OR manual JSON) | 4 h |
| **RT46** | 🟨 | FE: SimulatorPanel component on RoutingEditor — 2-mode toggle, attr table with auto-pick from product, inline manual entry, result card with bar chart | 8 h |
| **RT47** | 🟨 | FE + API: routing_template_test_fixture CRUD + "Save as fixture" button + "Compare" dual-pane (defer if buffer tight) | 5 h |

**Total:** 20 h new effort

### 7.2 Effort budget reconciliation

Sprint 4.2 was at 80 h / 80 h. Adding 20 h means either:
- **Option A:** Bump sprint to 100 h (drop 1 dev to 4 days, or extend by 1.5 days)
- **Option B:** Defer RT47 (test fixtures + compare) → 15 h added → still over budget
- **Option C (recommended):** Move RT47 to Sprint 4.3 / Sprint 5; promote RT44+RT45+RT46 (15 h core simulator) into Sprint 4.2 by trimming RT39 (BindingRuleManager preview counter — defer the "preview count" widget, ship plain CRUD only — saves 2 h) + RT38 (badge polish — 2 h trim). Net delta: +15 − 4 = **+11 h** still over.
- **Option D (cleanest):** Sprint 4.2 lengthens by 1 day (95 h budget) — accept the 11–15 h uplift; engineering value of simulator is high

Recommend **Option D** if user prioritises simulator. Otherwise Option C with RT47 deferred.

### 7.3 Story dependencies

```
RT22-RT24 schema  ─►  RT44 required-attrs API  ─►  RT46 SimulatorPanel FE
RT31 CycleTimeService dispatch  ─►  RT45 simulate API  ─►  RT46 SimulatorPanel FE
RT45 simulate API  ─►  RT47 fixtures + compare
```

RT44 + RT45 are backend-only and can ship independently of RT46. RT46 is the bottleneck visible deliverable.

---

## 8. Open questions for user

1. **Scope of RT47** — ship test fixtures + Compare in Sprint 4.2, or defer to Sprint 4.3?
   - Cowork rec: defer RT47; RT44–46 (core simulator) is the demo-able feature
2. **`default_input_spec` editability** — engineers edit on template directly, or admin-only?
   - Cowork rec: any user with template edit permission (same RBAC as routing_template state changes)
3. **Result chart library** — Recharts (already used in artifacts pattern), Chart.js, or custom CSS bars?
   - Cowork rec: custom CSS bars (simplest, matches existing UI in `documents/session-*.html`)
4. **Cost preview vs cycle-time only** — show std cost too, or cycle time only?
   - Cowork rec: both — already computed in same pipeline, free to display
5. **Persistence of last simulation per user** — restore inputs on page refresh?
   - Cowork rec: localStorage keyed by `template_id + user_id`; clears on template version change
6. **Comparison feature scope** (RT47) — same template with 2 inputs, OR 2 templates with 1 input each?
   - Cowork rec: same template, 2 inputs (sensitivity analysis); cross-template comparison Sprint 5+

---

## 9. What this changes in Sprint 4.2 plan file

I'll add Epic F (RT44–RT47) as new stories + adjust the demo script to include simulator walkthrough. Schema §3.1 gets `default_input_spec Json?` column added. API §4 grows by 2 endpoints. UX §6 (RoutingEditor wireframe) gets the right-panel simulator view.

Schedule impact: D5 was already tight; recommend Option D (extend to 6 days) OR move RT47 to next sprint.

---

*— end of simulator design analysis. Sprint 4.2 plan to be amended next (Task #14).*
