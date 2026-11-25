export type DiffStatus = 'added' | 'removed' | 'changed' | 'unchanged'

export interface DiffRow<T> {
  status: DiffStatus
  prev: T | null
  curr: T | null
  // a confirmed rename (2026-10-21): prev is shown under the new name; this is the old one
  renamed_from?: string
  rename_id?: number
}

export interface AssemblyDiffItem {
  assembly_mark: string
  name: string | null
  qty: number | null
  weight_kg: number | null
  surface_area_m2: number | null
  length_mm: number | null
  width_mm: number | null
  height_mm: number | null
}

export interface PartDiffItem {
  part_mark: string
  description: string | null
  profile: string | null
  grade: string | null
  qty: number | null
  length_mm: number | null
  weight_kg: number | null
}

export interface JunctionDiffItem {
  assembly_mark: string
  part_mark: string
  qty: number
}

export interface DiffMetric {
  prev: number | null
  curr: number | null
  delta: number | null
}

export interface DiffChanges {
  added: number
  removed: number
  changed: number
}

export interface DiffAggregate {
  weight_kg: DiffMetric
  area_m2: DiffMetric
  assembly_count: DiffMetric
  assembly_changes: DiffChanges
  part_total: DiffMetric
  part_changes: DiffChanges
}

export interface DispatchDiffResult {
  prev_id: number
  curr_id: number
  /** Version numbers shown as "v.prev → v.curr": upload number for full shop, revision for BOM-page pre-shop (2026-11-24) */
  prev_no: number | null
  curr_no: number | null
  /** Where the previous side came from — PRE_SHOP when a zone's first full shop compares with its last pre-shop (2026-11-24) */
  prev_source: 'BOM_UPLOAD' | 'PRE_SHOP'
  warning: string | null
  aggregate: DiffAggregate
  assembly_diff: DiffRow<AssemblyDiffItem>[]
  part_diff: DiffRow<PartDiffItem>[]
  junction_diff: DiffRow<JunctionDiffItem>[]
}
