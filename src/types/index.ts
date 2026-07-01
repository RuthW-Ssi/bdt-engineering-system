// ── Operations ────────────────────────────────────────────────
export type OpCode = 'CUT' | 'WELD' | 'DRILL' | 'PAINT' | 'QC' | 'BEND' | 'GRIND' | 'SHEAR' | 'ASSEMBLE'

// ── Categories ────────────────────────────────────────────────
export type Category = 'Assembly' | 'SubAssembly' | 'Part' | 'Plate' | 'ShapeStock' | 'OtherMat' | 'Consumable' | 'Coil'

// ── Material Groups (13 groups per BDT Product Master standard) ──
export type MaterialGroup =
  | 'PLATE'           // Steel Plate
  | 'HR_SHAPE'        // Hot Roll Shape (H-Beam, I-Beam, Channel, Angle)
  | 'COLDFORM'        // Cold Form Shape (C-Section, Z-Section, Lipped Channel)
  | 'PIPE_TUBE'       // Steel Pipe & Tube
  | 'FLAT_ROUND_BAR'  // Flat Bar & Round Bar
  | 'COIL'            // Steel Coil
  | 'BOLT_NUT'        // Bolt, Nut, Washer (Fasteners)
  | 'WELD_CONSUMABLE' // Welding Consumable (Rod, Flux, Gas)
  | 'PAINT_COAT'      // Paint & Coating
  | 'BUILDING_COMP'   // Building Component (Purlin, Girt, Roof Sheet, Cladding)
  | 'ACCESSORY'       // Steel Accessory (Anchor Bolt, Base Plate, Gusset)
  | 'SPARE_PART'      // Spare Part (machine spare — Criticality required)
  | 'FIXED_ASSET'     // Fixed Asset / Machine (production machinery)

// ── Product Attributes (physical & material properties per BDT naming convention) ──
export interface ProductAttributes {
  grade?: string         // Material grade: SS400, SM520, A36, S235, G550 etc.
  height_h?: number      // H = Height (mm) — H-Beam, I-Beam
  width_b?: number       // B = Width / Flange Width (mm)
  web_tw?: number        // TW = Thickness Web (mm)
  flange_tf?: number     // TF = Thickness Flange (mm)
  thickness_t?: number   // T = Thickness (mm) — Plate, Flat Bar, Sheet
  diameter_d?: number    // D = Diameter (mm) — Pipe, Round Bar, Bolt
  lip_c?: number         // C = Lip Length (mm) — Cold Form only
  length_mm?: number     // Standard length (mm)
  width_mm?: number      // Width (mm) — Plate, Sheet, Coil
  weight_per_m?: number  // Weight per metre (kg/m) — auto-calculated field
}

// ── Statuses ──────────────────────────────────────────────────
export type ProductStatus = 'Draft' | 'PendingReview' | 'Active' | 'Rejected' | 'Blocked'
export type RoutingStatus = 'Active' | 'Draft' | 'PendingReview' | 'Rejected'

// ── Meta interfaces ───────────────────────────────────────────
export interface OpMeta { label: string; icon: string; color: string }
export interface CatMeta { color: string; icon: string; label: string }
export interface MatGroupMeta { label: string; label_en: string; color: string; icon: string }
export interface StatusMeta { label: string; bg: string; text: string; border: string; icon: string }

// ── Product ───────────────────────────────────────────────────
export interface Product {
  product_code: string      // 10-char code: [5-char group prefix] + [5-digit run no.]
  name_th: string
  name_en: string           // UPPERCASE English: "<Main Name> <Spec> <Dimensions>"
  category: Category
  material_group?: MaterialGroup
  status: ProductStatus
  version: string | null
  uom: string               // Standard unit: KG, M, PCS, SET, SHEET, etc.
  odoo_ref_id: string | null
  substitute_for?: string | null  // Part code of the substituted material
  attributes?: ProductAttributes
  spec: {
    drawing_ref: string | null
    total_weight_kg: number | null
    description: string
  }
  updated_at: string
  updated_by: string
}

// ── Routing ───────────────────────────────────────────────────
export interface RoutingStep {
  id: string
  step_no: number
  op_code: OpCode
  name_th: string
  work_center: string
  std_time_min: number
  note: string
}

export interface Routing {
  product_code: string
  name_th: string
  category: Category
  steps: OpCode[]
  step_count: number
  total_time_min: number
  status: RoutingStatus
  updated_at: string
  updated_by: string
  reject_reason?: string
}

// ── BOM ───────────────────────────────────────────────────────
export interface BomNode {
  id: string
  code: string
  name: string
  category: Category
  qty: number
  uom: string
  scrap_pct: number
  level: number
  children: BomNode[]
  expanded?: boolean
}

export type DiffState = 'unchanged' | 'added' | 'removed' | 'modified'

export interface FieldChange {
  field: string
  old: string
  newVal: string
}

export interface BomDiffNode {
  id: string
  code: string
  name: string
  category: Category
  state: DiffState
  level: number
  qty: string
  changes?: FieldChange[]
  children: BomDiffNode[]
  expanded?: boolean
}
