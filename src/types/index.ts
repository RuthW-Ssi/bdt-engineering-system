// ── Operations ────────────────────────────────────────────────
export type OpCode = 'CUT' | 'WELD' | 'DRILL' | 'PAINT' | 'QC' | 'BEND' | 'GRIND' | 'SHEAR' | 'ASSEMBLE'

// ── Categories ────────────────────────────────────────────────
export type Category = 'Assembly' | 'SubAssembly' | 'Part' | 'Plate' | 'ShapeStock' | 'OtherMat' | 'Consumable' | 'Coil'

// ── Statuses ──────────────────────────────────────────────────
export type ProductStatus = 'Draft' | 'PendingReview' | 'Active' | 'Rejected' | 'Blocked'
export type RoutingStatus = 'Active' | 'Draft' | 'PendingReview' | 'Rejected'

// ── Meta interfaces ───────────────────────────────────────────
export interface OpMeta { label: string; icon: string; color: string }
export interface CatMeta { color: string; icon: string; label: string }
export interface StatusMeta { label: string; bg: string; text: string; border: string; icon: string }

// ── Product ───────────────────────────────────────────────────
export interface Product {
  product_code: string
  name_th: string
  name_en: string
  category: Category
  status: ProductStatus
  version: string | null
  uom: string
  odoo_ref_id: string | null
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
