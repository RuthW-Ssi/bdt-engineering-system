import { apiClient } from './client'

// ── Backend response types ────────────────────────────────────

export type BomView = 'eBOM' | 'mBOM' | 'sBOM'
export type BomState = 'draft' | 'active' | 'obsolete'
export type BomType = 'normal' | 'phantom' | 'kit'

export interface BomLineDTO {
  id: number
  bom_id: number
  sequence: number
  material_id: number | null
  sub_product_id: number | null
  product_qty: string
  scrap_pct: string
  cutting_length_mm: string | null
  weight_per_unit_kg: string | null
  note: string | null
  part_mark: string | null
  profile: string | null
  grade: string | null
  length_mm: string | null
  area_m2: string | null
  material: { id: number; default_code: string; name: string } | null
  sub_product: { id: number; product_code: string; name: string } | null
  product_uom: { id: number; name: string } | null
}

export interface BomDTO {
  id: number
  product_id: number
  version: string
  bom_view: BomView
  owner_role: string
  state: BomState
  bom_type: BomType
  product_qty: string
  product_uom_id: number | null
  effective_from: string | null
  effective_to: string | null
  notes: string | null
  project_id: number | null
  create_uid: number
  write_uid: number
  create_date: string
  write_date: string
  product: { id: number; product_code: string; name: string }
  lines: BomLineDTO[]
  _count?: { lines: number }
}

export interface BomListItemDTO extends Omit<BomDTO, 'lines'> {
  _count: { lines: number }
}

// ── API functions ─────────────────────────────────────────────

export function listBoms(productCode: string, params?: { bom_view?: BomView; state?: BomState }) {
  return apiClient
    .get<BomListItemDTO[]>(`/products/${productCode}/boms`, { params })
    .then(r => r.data)
}

export function getBom(id: number) {
  return apiClient.get<BomDTO>(`/boms/${id}`).then(r => r.data)
}

export function activateBom(id: number) {
  return apiClient.post<BomDTO>(`/boms/${id}/action_activate`).then(r => r.data)
}

export function obsoleteBom(id: number) {
  return apiClient.post<BomDTO>(`/boms/${id}/action_obsolete`).then(r => r.data)
}

export function updateBomLine(
  bomId: number,
  lineId: number,
  data: { product_qty?: number; scrap_pct?: number },
) {
  return apiClient
    .patch<BomLineDTO>(`/boms/${bomId}/lines/${lineId}`, data)
    .then(r => r.data)
}

export function deleteBomLine(bomId: number, lineId: number) {
  return apiClient.delete(`/boms/${bomId}/lines/${lineId}`).then(r => r.data)
}
