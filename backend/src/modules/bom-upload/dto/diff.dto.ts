export type DiffStatus = 'added' | 'removed' | 'changed' | 'unchanged'

export interface DiffRow<T> {
  status: DiffStatus
  prev: T | null
  curr: T | null
}

export interface AssemblyDiffItem {
  assembly_mark: string
  name: string | null
  qty: number | null
  weight_kg: number | null
  surface_area_m2: number | null
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
  warning: string | null
  aggregate: DiffAggregate
  assembly_diff: DiffRow<AssemblyDiffItem>[]
  part_diff: DiffRow<PartDiffItem>[]
  junction_diff: DiffRow<JunctionDiffItem>[]
}
