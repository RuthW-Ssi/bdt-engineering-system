# Gap Analysis — ECO + Versioning + Bulk-Edit on Routing (Option 3)

> **Author:** Cowork architect pass — 2026-04-29
> **Question:** เมื่อ ECO เข้ามาแก้ routing ที่มี per-product override อยู่แล้ว — จัดการยังไง? ต้อง version ไหม? Bulk-edit per category ได้ไหม?
> **Companion docs:**
> - [`SPRINT_PLAN_ROUTING_STD_TIME_4_2.md`](./SPRINT_PLAN_ROUTING_STD_TIME_4_2.md) — Sprint 4.2 (template + override + custom routing)
> - [`GAP_ANALYSIS_ROUTING_PATTERN.md`](./GAP_ANALYSIS_ROUTING_PATTERN.md) — Option 3 decision
> - [`SKELETONS_FUTURE_PRACTICE.md`](./SKELETONS_FUTURE_PRACTICE.md) — `mrp-eco` skeleton (Sprint 5)
> - [`backend/src/modules/_skeletons/mrp-eco/SKELETON.md`](./backend/src/modules/_skeletons/mrp-eco/SKELETON.md)

---

## 1. The three sub-questions, precisely

| # | Question | Practice frame |
|---|---|---|
| **Q1** | When ECO modifies a template, what happens to products that already have a `product_routing_override` on the affected activity? | Odoo `mrp.eco` *Override Survival Policy* · Siemens Opcenter *Recipe Adjustment Rule* |
| **Q2** | Do we need to keep version history on templates / activities / overrides — or is WO snapshot enough? | ISA-95 *Production Rule Versioning* · Odoo `mrp.eco` *revision graph* · AISC *WPS Qualification Record* (immutable) |
| **Q3** | Can engineer apply one edit to every custom product in the same category at once (e.g., "all COLUMNs in 0X202 → add override X")? | Odoo `mrp.eco` *Apply on type* · ERP *bulk operation with audit* |

The answers must be **internally consistent** — ECO governance, versioning, and bulk edit are three faces of the same problem (managing change at scale).

---

## 2. Q1 — Override Survival Policy when template changes

### 2.1 The scenario

- Template `Main`, activity `4.5 Weld bead 2nd side` has `per_minute=20` in template.
- Product P1 has override: `per_minute=22` (this product is heavier — needs slower welding)
- Product P2 has override: `per_minute=18` (this product is rushed — fast-track)
- Product P3 has no override (uses template = 20)
- Product P4 is on `custom_routing` (template-independent)

ECO comes in: change template `per_minute` from 20 → 25.

**Question:** what should the cycle time be for P1, P2, P3, P4 after ECO is applied?

### 2.2 Three candidate policies

| Policy | P1 result | P2 result | P3 result | P4 result | Used by |
|---|:-:|:-:|:-:|:-:|---|
| **A. Overrides survive** (recommended default) | **22** (kept) | **18** (kept) | **25** (template) | **custom** (untouched) | Odoo default; AISC default |
| **B. Overrides reset** | 25 (template) | 25 (template) | 25 (template) | custom (untouched) | Rare — manual re-creation needed |
| **C. Overrides merge (+delta)** | 22+5=**27** | 18+5=**23** | 25 | custom | Risky — assumes additive intent |

### 2.3 Why "Survive" is the right default

Override existed for a reason — usually steel-domain reality (this product is heavier, this welder works on this jig, this assembly is for fire-rated structure).
Template change is usually a **process improvement**, not a product-specific reason. Wiping all overrides loses engineering intent.

Counter-example: if override existed *because the template was wrong* (wrong formula param, wrong measure unit), engineer wants reset. So policy must be **opt-in per ECO**.

### 2.4 Recommended policy

```
Default:   ECO modifies template/activity → existing overrides SURVIVE
Opt-in:    ECO can declare override_policy = 'reset' | 'reset_matching' | 'survive'
           - 'reset'           = wipe ALL overrides on the changed activity
           - 'reset_matching'  = wipe overrides where override_value === old_template_value
                                 (means: products that were "in sync" stay in sync)
           - 'survive' (default) = keep all overrides as-is
```

**Steel-shop sanity check:** AISC Welding Procedure Specification (WPS) qualification: when WPS is amended, existing PQRs (Procedure Qualification Records) survive unless the amendment specifically supersedes a PQR's parameter range. Same pattern.

### 2.5 Schema impact

Add to `mrp_eco` skeleton (Sprint 5):

```prisma
model mrp_eco_skeleton {
  // … existing fields from skeleton.prisma §3 …
  
  // NEW — override survival policy (only applies when type='routing'|'product_override')
  override_policy String @default("survive") @db.VarChar(20)   // 'survive' | 'reset' | 'reset_matching'
  // NEW — captures what was reset for audit/rollback
  reset_overrides_json Json?                                    // [{product_id, activity_id, old_value, restored:false}]
}
```

Service-layer rule:
```ts
async applyEco(ecoId: number) {
  const eco = await loadEco(ecoId)
  await applyTemplateChange(eco)
  
  if (eco.override_policy === 'reset') {
    const wiped = await wipeOverridesForActivities(eco.affected_activity_ids)
    await markEcoResetWiped(eco.id, wiped)
  } else if (eco.override_policy === 'reset_matching') {
    const wiped = await wipeOverridesWhereValueMatches(eco.affected_activity_ids, eco.before_after_diff)
    await markEcoResetWiped(eco.id, wiped)
  }
  // else 'survive' — no-op on overrides
  
  // Recompute affected products + invalidate cache
  await invalidateRoutingCacheForBoundProducts(eco.affected_template_id)
}
```

---

## 3. Q2 — Versioning strategy

### 3.1 What needs versioning, and why

| Entity | Why version? | Reader who needs old versions |
|---|---|---|
| `routing_template` | template was renamed / state changed; need rollback path | Engineer audit, ECO impact preview |
| `routing_activity_template` | per_minute / formula / std_measure changed; old MO snapshots reference old values | Compliance audit, "what was the rate when MO 2026-001 ran?" |
| `mrp_routing_workcenter` (op) | op sequence / WC routing changed | Same as above |
| `product_routing_override` | per-product override changed over time | Per-product cost variance analysis |
| `custom_routing` + ops + activities | custom product recipe evolved | Same — auditing custom products' history |

### 3.2 Two-layer model (recommended)

**Layer 1: Mutable rows + history table**

For high-volume entities that change often (`routing_activity_template`, `product_routing_override`), use an "immutable history snapshot" pattern:

```prisma
// Mutable current row (Sprint 4.2 schema unchanged)
model routing_activity_template {
  // … current fields …
  version  String @default("1.0") @db.VarChar(20)   // already in 4.2
  active   Boolean @default(true)                    // already in 4.2
}

// NEW — history snapshot (write-once)
model routing_activity_template_history {
  id                  Int      @id @default(autoincrement())
  activity_template_id Int                                       // FK to current row
  version             String   @db.VarChar(20)
  // Snapshot of all mutable fields at the time of change
  snapshot            Json                                        // full row state
  changed_by_uid      Int
  changed_by          res_users @relation("ach_user", fields: [changed_by_uid], references: [id])
  changed_at          DateTime @default(now()) @db.Timestamptz
  eco_id              Int?                                        // ⏳ Sprint 5 mrp_eco
  reason              String?  @db.Text

  @@index([activity_template_id, changed_at])
  @@index([eco_id])
}
```

Trigger: on UPDATE of `routing_activity_template`, write old row to history.

**Layer 2: Versioned current row** (for `routing_template` itself — lower volume, semantic versioning meaningful)

`routing_template.version` is bumped on publish via state machine. Old `state='obsolete'` rows kept indefinitely. Bound products always reference current `state='active'` row by FK; query for "what version did MO X use" goes through WO snapshot (Sprint 5 D4).

### 3.3 Why combine both layers

- **Layer 1 history** = answers "what changed and when" without bloating the active table
- **Layer 2 active versioning** = answers "what is the current published recipe" + "what state is it in"
- **WO snapshot** (Sprint 4.2 §3.10) = answers "what was actually used to produce serial Y"

Without all three, governance breaks:
- Layer 1 alone: no semantic versioning of recipes — engineers can't say "ship template v2.0"
- Layer 2 alone: history lost on every edit — compliance audit fails
- WO snapshot alone: per-MO history yes, but template-level "what changed in v1.5 → v2.0" requires reconstruction from N WOs

### 3.4 ISA-95 / Odoo / AISC alignment

- **ISA-95 §5.4** *Production Rule Lifecycle* requires versioned definitions with explicit transitions and snapshots referenced by Production Performance — matches our 3-layer model.
- **Odoo `mrp.eco`** keeps a *revision graph* on `mrp.bom` (and by extension routing in v17+). Same approach.
- **AISC Welding** PQR is a frozen historical record (= our history table); WPS is the current published version (= our active row). 

### 3.5 Schema impact (Sprint 4.2 amendment OR Sprint 5)

| Table | Add when | Impact |
|---|:-:|---|
| `routing_activity_template_history` | Sprint 4.2 (recommended) — easier to add now than backfill | +1 table; trigger on UPDATE |
| `routing_template_history` | Sprint 4.2 (cheap to add alongside) | +1 table; trigger |
| `product_routing_override_history` | Sprint 4.2 (cheap) | +1 table; trigger |
| `custom_routing_history` (full subtree) | Sprint 5 (defer — more complex) | +3 tables (op + activity history) |

**Recommend: Sprint 4.2 ships 3 history tables (template, activity_template, override).** That's +6 h effort: 3 migrations × 1 h + trigger functions × 1 h. Push Sprint 4.2 to ~106 h or trim 6 h elsewhere.

---

## 4. Q3 — Bulk edit per category

### 4.1 Three flavours of bulk

| Flavour | Description | Status in Sprint 4.2 (current) | Effort to add |
|---|---|:-:|:-:|
| **3a — Implicit bulk via template** | Edit template once → all 1,832 bound products get new value automatically (Option 3 design intent) | ✅ already works | 0 h |
| **3b — Explicit bulk override** | Filter products by criteria → apply same override to all matched | ❌ not in 4.2 | +6 h |
| **3c — Bulk custom_routing edit** | Apply same op-add/op-change across all custom routings in category | ❌ not in 4.2 | +12 h (defer Sprint 5) |

### 4.2 Flavour 3a is already free (the whole point of Option 3)

When ECO target is **template** (not override), and override_policy='survive', then:
- All bound products without override on the affected activity → adopt new value automatically
- All bound products with override on the affected activity → unchanged (intentional)
- All custom_routing products → unchanged (intentional — they opted out)

This is exactly the bulk-edit-per-category that Option 3 was designed for. The "category" boundary is determined by `routing_template_binding_rule` priority chain (Sprint 4.2 RT25).

### 4.3 Flavour 3b — design

**Use case:** "All COLUMN products in project 0X202 need a 10% slower buildup-fit time because Q3 batch had quality issues."

**API:**
```
POST /api/v1/routing-overrides/bulk
Body: {
  criteria: {
    project_id?: number,
    zone_id?: number,
    category_id?: number,
    mark_prefix?: string,
    product_type?: 'standard' | 'custom',
    routing_template_id?: number,
    has_custom_routing?: boolean,                  // usually false (custom routings are independent)
    attribute_filter?: { path: string, op: 'eq'|'gte'|'lte'|'in', value: any }[]
  },
  override: {
    activity_template_id: number,
    override_per_minute?: number,
    override_std_measure?: number,
    override_manpower?: number,
    reason: string  // required for bulk
  },
  eco_id?: number,                                   // required if ANY matching product has confirmed MO (D2 rule extends)
  preview_only?: boolean                             // default false; if true, returns count + sample rows without writing
}

Response: {
  matched_count: 47,
  applied_count: 47,
  skipped_count: 0,
  skipped_reasons: [],
  eco_required: false,
  affected_products: [{id, product_code, mark_no}]   // truncated to first 100
}
```

**Service-layer logic:**
```ts
async bulkUpsertOverride(dto: BulkOverrideDto): Promise<BulkResult> {
  // 1. Match products
  const products = await this.matchProducts(dto.criteria)
  
  // 2. Filter out custom_routing products (override doesn't apply)
  const eligible = products.filter(p => !p.has_custom_routing)
  
  // 3. ECO gate per product
  const ecoNeeded = await this.anyProductHasConfirmedMO(eligible)
  if (ecoNeeded && !dto.eco_id) {
    return { matched_count: products.length, eco_required: true, applied_count: 0, ... }
  }
  
  // 4. Preview short-circuit
  if (dto.preview_only) {
    return { matched_count: products.length, eligible_count: eligible.length, ... }
  }
  
  // 5. Apply in transaction
  const results = await this.prisma.$transaction(
    eligible.map(p => this.prisma.product_routing_override.upsert({
      where: { product_id_activity_template_id: { product_id: p.id, activity_template_id: dto.override.activity_template_id } },
      create: { ...dto.override, product_id: p.id, eco_id: dto.eco_id, create_uid, write_uid },
      update: { ...dto.override, eco_id: dto.eco_id, write_uid }
    }))
  )
  
  // 6. Audit + history (if Sprint 4.2 history tables in place)
  await this.mail.logBulk('product_routing_override', results.map(r => r.id), 'bulk_apply', dto.criteria)
  
  return { matched_count: products.length, applied_count: results.length, ... }
}
```

**FE flow:** dedicated page `/admin/bulk-overrides`:
1. Filter form (project/zone/category/mark/attr) → "Find products" → list with count
2. Pick activity to override → enter values + reason
3. Click "Preview" → backend returns `preview_only=true` count + sample
4. Confirm → backend applies; if `eco_required=true`, flow asks for ECO ID first
5. Result page shows applied count + link to audit

### 4.4 Flavour 3c — defer

Bulk edits across `custom_routing` products are rarer (custom = unique). When needed (e.g., "all 5 special heat-treated columns add a new QC step"), it's almost always better to **promote to a shared sub-template** than mass-edit. Defer to Sprint 5+ with the "promote custom_routing to template" feature noted in `SPRINT_PLAN_ROUTING_STD_TIME_4_2.md` §9 R5.

---

## 5. ECO scope expansion (full design)

To hold all of Q1+Q2+Q3 cleanly, `mrp_eco` needs richer scope semantics than the current Sprint 5 skeleton:

```prisma
model mrp_eco_skeleton {
  // … existing fields from skeleton …

  // RICHER SCOPE
  scope_type   String  @db.VarChar(30)   // 'template' | 'activity_template' | 'override_single'
                                          // | 'override_bulk' | 'custom_routing' | 'product' | 'bom' | 'drawing' | 'hybrid'
  scope_target_ids Int[]                  // template_id(s), activity_id(s), product_id(s), depending on scope_type
  scope_criteria   Json?                  // for 'override_bulk' — match criteria from §4.3
  
  // OVERRIDE POLICY (Q1)
  override_policy  String  @default("survive") @db.VarChar(20)
  reset_overrides_json Json?              // populated post-apply
  
  // VERSIONING (Q2)
  bumps_version    Boolean @default(false)   // does this ECO publish a new version?
  before_version   String? @db.VarChar(20)   // captured at apply
  after_version    String? @db.VarChar(20)
  
  // BEFORE/AFTER snapshot for audit + diff UI
  before_after_diff Json?                    // structured diff of fields changed
}
```

### 5.1 Lifecycle when ECO of `scope_type=template` applies

```
1. ECO state: draft → review → approved → in_progress
2. On 'in_progress':
   a. Snapshot current template + activities → routing_template_history + routing_activity_template_history
   b. Apply changes from ECO's before_after_diff
   c. Bump routing_template.version (Layer 2)
   d. Apply override policy:
      - 'survive': no-op
      - 'reset': UPDATE product_routing_override SET... DELETE WHERE activity_id IN affected
      - 'reset_matching': DELETE WHERE override_value === before_value
   e. Invalidate routing cache for all bound products
   f. Async: re-snapshot in-flight WOs that haven't started yet (state IN ('pending','ready'))
      — those that are 'in_progress' or 'done' frozen via existing WO snapshot
   g. ECO state → 'done'
3. mail_message logged with full before/after + product impact count
```

### 5.2 ECO impact preview (UX must-have)

Before approving an ECO, engineer/manager wants to see "what will change":

```
┌──────────────────────────────────────────────────────────────────────┐
│ ECO-2026-001 — Adjust buildup-fit per_minute (Main)         [draft]  │
├──────────────────────────────────────────────────────────────────────┤
│ Scope: template `Main` · activity `4.5 Weld bead 2nd side`           │
│ Change: per_minute  20 → 25  (+25%)                                   │
│ Override policy: ●survive  ○reset  ○reset_matching                    │
├──────────────────────────────────────────────────────────────────────┤
│ Impact preview:                                                       │
│   Bound products:               1,832                                 │
│   With override on this activity:  47                                 │
│   Without override (will adopt):  1,785                               │
│   On custom_routing (untouched):     3                                │
│                                                                       │
│   Cycle time impact (avg, on adopters):  +120 min/product             │
│   Total project-wide impact:    ~3,570 hours additional               │
│                                                                       │
│   In-flight MOs that will re-snapshot:  12                            │
│   In-flight MOs frozen (state=progress):  3                           │
└──────────────────────────────────────────────────────────────────────┘
[ Approve ] [ Reject ] [ Edit ECO ] [ Show 47 products with override ]
```

This is exactly what Odoo `mrp.eco` does for BOM changes — extend pattern to routing.

---

## 6. Updated answers — short form

| Question | Answer |
|---|---|
| Q1 — overrides when ECO hits template | **Survive by default**, ECO can opt-in `override_policy='reset' | 'reset_matching'`. Each ECO records what it wiped (audit). |
| Q2 — versioning | **3-layer:** (1) Layer-1 row history tables (cheap, on every change) + (2) Layer-2 semantic version on `routing_template` (bumped by ECO publish) + (3) WO snapshot at MO action_plan (Sprint 5 D4). All three required. |
| Q3 — bulk edit per category | **3a (implicit via template):** already free in Option 3. **3b (explicit bulk override):** new endpoint + admin page, +6 h effort. **3c (bulk custom_routing):** defer Sprint 5+; recommend "promote to sub-template" instead. |

---

## 7. Effort impact on sprint plans

### 7.1 Sprint 4.2 amendment (history tables = +6 h, bulk override = +6 h)

**Option E (recommended):** Add 3 history tables now (Sprint 4.2) + leave bulk to Sprint 4.3
- +6 h: history migrations + triggers
- Sprint 4.2 budget: 100 h → 106 h (still doable in 6 days)
- Why: history tables are FAR cheaper to add now than backfill later

**Option F:** Add history + bulk to Sprint 4.2
- +12 h: history (6) + bulk override API + admin page (6)
- Sprint 4.2 budget: 100 h → 112 h (7 days)

**Option G:** Move history + bulk to Sprint 4.3
- Sprint 4.2 stays at 100 h / 6 days
- Sprint 4.3 = 80 h with history + bulk + simulator polish + ECO preview UI hooks
- Risk: history backfill is messy if 4.2 ships without it

**Recommend Option E.** History is structural and cheap; bulk is feature, can wait.

### 7.2 Sprint 5 (mrp-eco skeleton activation)

When `mrp-eco` is activated in Sprint 5, the skeleton currently shows simple ECO entity. With this analysis, Sprint 5 must:
- Implement scope_type discrimination + scope_target_ids + scope_criteria (for bulk)
- Implement override_policy enforcement
- Implement Layer-2 version bumping on apply
- Implement before/after diff capture + Impact Preview UI
- Implement re-snapshot for in-flight WOs
- Wire override-creation gate from D2 (Sprint 4.2): "after MO confirmed → eco_id required"

Sprint 5 mrp-eco effort estimate now ~24 h (was 12 h in skeleton). Note in skeleton SKELETON.md.

### 7.3 Sprint 4.3 stub (if Option E)

```
Sprint 4.3 (~24 h half-sprint):
  - Bulk override API + admin page (RT48-RT50, 6h)
  - ECO Preview Impact UX prep (RT51-RT52, 6h)        — UI exists, eco_id field stub until Sprint 5
  - History UI: "Show history" button per template/activity/override (RT53-RT54, 6h)
  - "Promote custom_routing to sub-template" (RT55, 6h) — Q3c lite version
```

Could fold into Sprint 5 instead — flag for user decision.

---

## 8. ADRs to create

| ADR | Title | Where |
|---|---|---|
| **ADR-0007** | Override Survival Policy on Template Change | `docs/adr/0007-override-survival.md` (Sprint 4.2) |
| **ADR-0008** | 3-Layer Versioning Model for Routing | `docs/adr/0008-routing-versioning.md` (Sprint 4.2) |
| **ADR-0009** | Bulk Edit on Routing — Template-First, Override-Second | `docs/adr/0009-bulk-edit-routing.md` (Sprint 4.2 or 4.3) |
| **ADR-0010** | ECO Scope Discriminator (`scope_type`) | `docs/adr/0010-eco-scope.md` (Sprint 5) |

---

## 9. Open questions for user

1. **Effort plan** — Option E (Sprint 4.2 +6h) / F (+12h) / G (defer all)? *Cowork rec: Option E*
2. **Default override_policy** — confirm `survive` is right for BDT? *Cowork rec: yes — matches AISC WPS practice*
3. **bulk override scope** — should `attribute_filter` (e.g., `attributes.material_grade='SS400'`) be supported in 4.3, or only basic FK criteria (project/zone/category/mark)? *Cowork rec: attribute_filter included — engineer's first ask will be "all SS400 columns"*
4. **In-flight WO re-snapshot** — when ECO applies, should pending+ready WOs re-snapshot automatically, or stay frozen until manually un-frozen? *Cowork rec: auto re-snapshot pending/ready (matches "WO not started yet"); freeze in_progress+done* (Sprint 5 implements)
5. **Custom routing exclusion confirmed** — bulk override skips `has_custom_routing=true` products? *Cowork rec: yes, with explicit count in result + warning UX*

---

*— end of ECO + versioning + bulk edit gap analysis. Awaiting decision before amending Sprint 4.2 / Sprint 5 plans.*
