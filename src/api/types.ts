// Odoo-compatible DTO types used by the backend API
export interface MaterialDTO {
  id: number
  default_code: string
  name: string
  description_sale: string
  categ_id: number
  uom_id: number
  type: string
  state: 'draft' | 'to_approve' | 'confirmed' | 'cancel' | 'blocked'
  active: boolean
  version: string | null
  attributes: Record<string, unknown>
  drawing_ref: string | null
  criticality: string | null
  total_weight_kg: number | null
  odoo_ref_id: string | null
  create_uid: number
  write_uid: number
  create_date: string
  write_date: string
  category?: { id: number; name: string; prefix_5: string | null; group_no: string | null }
  uom?: { id: number; name: string }
  write_user?: { id: number; name: string }
}

export interface MaterialListResponse {
  total: number
  page: number
  limit: number
  pages: number
  items: MaterialDTO[]
}

export interface UomDTO {
  id: number
  name: string
  category_id: number
  category?: { id: number; name: string }
  active: boolean
}

export interface CategoryDTO {
  id: number
  name: string
  parent_id: number | null
  group_no: string | null
  prefix_5: string | null
  complete_name: string | null
  needs_criticality: boolean
  active: boolean
}

export interface CreateMaterialPayload {
  categ_id: number
  uom_id: number
  name: string
  description_sale: string
  type?: string
  attributes?: Record<string, unknown>
  drawing_ref?: string
  criticality?: string
  total_weight_kg?: number
}

// Map backend state → UI label (for ProductStatus compatibility) — Materials
export const STATE_TO_PRODUCT_STATUS: Record<string, string> = {
  draft:      'Draft',
  to_approve: 'PendingReview',
  confirmed:  'Active',
  cancel:     'Rejected',
  blocked:    'Blocked',
}

// ═══════════════════════════════════════════════════════════════
// Sprint 2: Product Layer types
// ═══════════════════════════════════════════════════════════════

export type PaintLayerType = 'primer' | 'intermediate' | 'fireproof' | 'topcoat'

export interface PaintLayerPreset {
  paint_type: PaintLayerType
  layers: number
  material_code: string
  microns?: number
}

export interface PaintSpecPreset {
  layers: PaintLayerPreset[]
}

export interface WeldingSpecPreset {
  material_code: string
  fillet_mm: number
  sides: number
  weld_layers: number
}

export type ProductType = 'standard' | 'custom'
export type ProductState = 'draft' | 'in_design' | 'in_review' | 'approved' | 'released' | 'obsolete'

export interface ProductDTO {
  id: number
  product_code: string
  engineering_code: string | null
  item_code: string | null
  odoo_compliance_status: string
  name: string
  categ_id: number
  product_type: ProductType
  odoo_type: string
  state: ProductState
  active: boolean
  sale_ok: boolean
  purchase_ok: boolean
  sales_price: string
  cost_raw_material: string | null
  cost_transport: string | null
  cost_production: string | null
  cost_warehouse: string | null
  // Standard-only
  variant_attributes: Record<string, unknown> | null
  stock_policy: string | null
  reorder_min: string | null
  reorder_max: string | null
  // Custom-only
  project_id: number | null
  erection_zone_id: number | null
  mark_prefix: string | null
  mark_number: string | null
  engineer_hours_est: string | null
  // Sprint 4.2: Routing
  routing_template_id: number | null
  has_custom_routing: boolean
  // Spec presets (standard products)
  default_paint_spec?: PaintSpecPreset | null
  default_welding_spec?: WeldingSpecPreset | null
  // Shared
  attributes: Record<string, unknown>
  odoo_ref_id: string | null
  create_uid: number
  write_uid: number
  create_date: string
  write_date: string
  // Relations (included in list/detail)
  category?: { id: number; name: string; prefix_5: string | null }
  project?: { id: number; project_code: string; name: string } | null
  erection_zone?: { id: number; code: string; label: string } | null
  mark?: { code: string; label: string; category: string } | null
  write_user?: { id: number; name: string }
  create_user?: { id: number; name: string }
}

export interface ProductListResponse {
  total: number
  page: number
  limit: number
  pages: number
  items: ProductDTO[]
}

export interface ProjectDTO {
  id: number
  project_code: string
  name: string
  state: string
  active: boolean
  create_date: string
  write_date: string
  _count?: { zones: number; products: number }
  write_user?: { id: number; name: string }
  customer?: { id: number; name: string; ref: string | null }
}

export interface ProjectListResponse {
  total: number
  page: number
  limit: number
  pages: number
  items: ProjectDTO[]
}

export interface ProjectZoneDTO {
  id: number
  project_id: number
  code: string
  label: string
  erection_sequence: number | null
  active: boolean
}

export interface MarkPrefixDTO {
  code: string
  label: string
  category: string
  part_type_code: string
  active: boolean
}

export interface CreateStandardProductPayload {
  product_type: 'standard'
  product_kind?: 'part' | 'assembly'
  name: string
  categ_id: number
  engineering_code?: string
  item_code?: string
  odoo_type?: string
  sale_ok: boolean
  purchase_ok: boolean
  cost_raw_material?: number
  cost_transport?: number
  cost_production?: number
  cost_warehouse?: number
  variant_attributes?: Record<string, unknown>
  stock_policy?: string
  reorder_min?: number
  reorder_max?: number
  attributes?: Record<string, unknown>
  default_paint_spec?: PaintSpecPreset
  default_welding_spec?: WeldingSpecPreset
}

export interface CreateCustomProductPayload {
  product_type: 'custom'
  name: string
  categ_id: number
  project_id: number
  erection_zone_id?: number
  mark_prefix: string
  mark_number: string
  engineer_hours_est?: number
  attributes?: Record<string, unknown>
}

export type CreateProductPayload = CreateStandardProductPayload | CreateCustomProductPayload

// Product state → UI display
export const PRODUCT_STATE_LABELS: Record<ProductState, string> = {
  draft:      'Draft',
  in_design:  'In Design',
  in_review:  'In Review',
  approved:   'Approved',
  released:   'Released',
  obsolete:   'Obsolete',
}

export const PRODUCT_STATE_COLORS: Record<ProductState, { bg: string; text: string }> = {
  draft:      { bg: '#F5F5F5', text: '#555555' },
  in_design:  { bg: '#E6F1FB', text: '#0C447C' },
  in_review:  { bg: '#FAEEDA', text: '#854F0B' },
  approved:   { bg: '#EAF3DE', text: '#27500A' },
  released:   { bg: '#D1F2E0', text: '#065F46' },
  obsolete:   { bg: '#FCEBEB', text: '#8A1520' },
}
