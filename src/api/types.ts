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

// Map backend state → UI label (for ProductStatus compatibility)
export const STATE_TO_PRODUCT_STATUS: Record<string, string> = {
  draft:      'Draft',
  to_approve: 'PendingReview',
  confirmed:  'Active',
  cancel:     'Rejected',
  blocked:    'Blocked',
}
