// Pre-shop at the BOM page (2026-11-23, wiki features/bom-preshop-upload-plan).
// The Engineer uploads a Dispatch Note and an optional Part List, puts parts
// into assemblies, and saves; each save is a new PRE_SHOP BOM revision (≥ 1).
import { apiClient } from './client'
import type { PreshopAssembly, PreshopPart } from './mo'

export type { PreshopAssembly, PreshopPart }

/** One row of a Tekla Part List (.xls/.xlsx) — `no` = pieces over the whole zone. */
export interface PreshopListPart {
  part_mark: string
  profile: string
  grade: string
  length_mm: number | null
  unit_weight_kg: number | null
  no: number | null
}

export interface PreshopScope { project_id: number; zone_id: number; sub_zone_id: number | null }

export interface PreshopCurrent {
  dispatch_id: number
  revision: number
  uploaded_at: string
  assemblies: PreshopAssembly[]
}

const multipart = (file: File) => {
  const form = new FormData()
  form.append('file', file)
  return form
}
const MULTIPART = { headers: { 'Content-Type': 'multipart/form-data' } }

/** POST /bom/preshop/import/dispatch-note — one Dispatch Note → assemblies (not stored). */
export async function importDispatchNote(file: File): Promise<{ filename: string; assemblies: PreshopAssembly[]; warnings: string[] }> {
  return (await apiClient.post('/bom/preshop/import/dispatch-note', multipart(file), MULTIPART)).data
}

/** POST /bom/preshop/import/part-list — one Tekla Part List → parts (not stored). */
export async function importPartList(file: File): Promise<{ filename: string; parts: PreshopListPart[] }> {
  return (await apiClient.post('/bom/preshop/import/part-list', multipart(file), MULTIPART)).data
}

/** GET /bom/preshop — the zone's current BOM-page pre-shop, or null. */
export async function getPreshop(scope: PreshopScope): Promise<PreshopCurrent | null> {
  const params = { project_id: scope.project_id, zone_id: scope.zone_id, ...(scope.sub_zone_id != null ? { sub_zone_id: scope.sub_zone_id } : {}) }
  return (await apiClient.get('/bom/preshop', { params })).data ?? null
}

/** POST /bom/preshop — save as a new pre-shop revision. */
export async function savePreshop(body: PreshopScope & { assemblies: PreshopAssembly[] }): Promise<{ dispatch_id: number; revision: number }> {
  return (await apiClient.post('/bom/preshop', body)).data
}
