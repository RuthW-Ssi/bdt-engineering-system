// Pre-shop at the BOM page (2026-11-23, wiki features/bom-preshop-upload-plan).
// The Engineer uploads a Dispatch Note and an optional Part List, puts parts
// into assemblies, and saves; each save is a new PRE_SHOP BOM revision (≥ 1).
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
