import { apiClient } from './client'

// Phase-based statuses (Sprint 26) — furthest phase started. Shade encodes
// in-progress (light) vs phase-complete-and-waiting (dark) for the 3D view.
export type ProgressStatus = 'notstart' | 'fabrication' | 'load' | 'erection' | 'done'
export type ProgressShade = 'light' | 'dark'

// Fabrication stage keys, workflow order — weights live server-side
// (STAGE_WEIGHTS, from the site team's Excel weight row verbatim).
export const FAB_STAGES = [
  'cut', 'buildup', 'weld1', 'fitup_drill', 'weld2',
  'qc_inspection', 'primer', 'fireproof', 'top_coat', 'qc_final',
] as const
export type FabStage = (typeof FAB_STAGES)[number]

export type FabStageFields = Record<FabStage, number>

export interface ProgressZoneRow extends FabStageFields {
  assembly_id: number
  mark: string
  weight_kg: number | null
  qty: number | null
  plan_load_date: string | null
  actual_load_date: string | null
  loaded_pcs: number
  erected_pcs: number
  // Three separate numbers, deliberately no combined total (spec) —
  // fab weighted by stage weights, load/erect by pieces of qty.
  fab_pct: number
  load_pct: number
  erect_pct: number
  status: ProgressStatus
  shade: ProgressShade
}

export interface ProgressBuckets {
  notstart: number
  in_progress: number // fabrication | load | erection
  done: number
}

export interface ProgressRollupTotals {
  assembly_count: number
  total_weight_kg: number
  fab_pct: number
  total_qty: number
  loaded_pcs: number
  erected_pcs: number
  load_pct: number
  erect_pct: number
  buckets: ProgressBuckets
}

export interface ProgressZoneRollup extends ProgressRollupTotals {
  zone_id: number
  zone_code: string
  zone_label: string
}

export interface ProgressOverview {
  zones: ProgressZoneRollup[]
  total: ProgressRollupTotals
}

// Alternate Overview grouping (Zone | Position toggle) — by BIM structural
// position code (grid/elevation, e.g. "2/A/EL.950") instead of Zone. No
// weight here: a mark can span many positions (confirmed on real data —
// about half do), so a per-position weight would either overcount total
// tonnage or need an arbitrary split the team never agreed to. Each entry
// just repeats that mark's own existing progress numbers at every position
// it physically appears.
//
// Driven from the BIM side — every physical instance the model knows
// about, not just marks that happen to have a BOM row — so a mark can be
// null here (assembly_id/pcts/status/shade) meaning it's a real piece in
// the model with no matching BOM upload yet; render its progress as "-"
// rather than omitting it. `unmatched` is the other direction: BOM rows
// with real progress but no BIM position anywhere.
export interface ProgressPositionMark {
  assembly_id: number | null
  mark: string
  count: number // BIM instance count at this position (or full qty, for `unmatched`)
  fab_pct: number | null
  load_pct: number | null
  erect_pct: number | null
  status: ProgressStatus | null
  shade: ProgressShade | null
}

export interface ProgressPositionGroup {
  position: string
  marks: ProgressPositionMark[]
}

export interface ProgressPositions {
  model_id: number | null
  model_version: string | null
  groups: ProgressPositionGroup[]
  unmatched: ProgressPositionMark[] // marks with no BIM position data — never silently dropped
}

export interface BimMatchResult {
  model_id: number | null
  model_version: string | null
  // "major.minor" (e.g. "1.1") — same scheme BomList.tsx displays: major =
  // bom_dispatch.revision, minor = chronological rank within that revision
  // ("Continue revision" reads 1.0, 1.1…; "Start new revision" jumps the
  // major). A zone's live assemblies can technically span more than one
  // dispatch (a partial "continue" upload only touches some marks) — this
  // is just the highest one, i.e. what a user would call "current". Only
  // present on the zone-scoped variant — a project spanning zones on
  // different revisions can't collapse to one number.
  bom_version?: string | null
  matches: { assembly_id: number; mark: string; global_ids: string[] }[]
}

// Partial update — omitted fields stay unchanged, explicit null clears a
// date. Percents clamp server-side to 0..100, pcs to the assembly's qty.
export interface UpdateAssemblyProgressPayload extends Partial<FabStageFields> {
  plan_load_date?: string | null
  actual_load_date?: string | null
  loaded_pcs?: number
  erected_pcs?: number
}

// Bulk applies ONE payload to rows whose qty differ — raw pcs counts are
// replaced by set-full flags the backend resolves per-row.
export interface BulkUpdateAssemblyProgressPayload
  extends Omit<UpdateAssemblyProgressPayload, 'loaded_pcs' | 'erected_pcs'> {
  set_loaded_full?: boolean
  set_erected_full?: boolean
}

export async function getProgressOverview(projectCode: string): Promise<ProgressOverview> {
  return (await apiClient.get(`/projects/${projectCode}/progress/overview`)).data
}

export async function getProgressZoneRows(projectCode: string, zoneId: number): Promise<ProgressZoneRow[]> {
  return (await apiClient.get(`/projects/${projectCode}/progress/zones/${zoneId}`)).data
}

export async function getProgressBimMatch(projectCode: string, zoneId: number): Promise<BimMatchResult> {
  return (await apiClient.get(`/projects/${projectCode}/progress/zones/${zoneId}/bim-match`)).data
}

// Project-wide variants — every zone's assemblies combined, for the Overview
// tab's whole-project 3D view + isolate-by-status.
export async function getProgressProjectRows(projectCode: string): Promise<ProgressZoneRow[]> {
  return (await apiClient.get(`/projects/${projectCode}/progress/rows`)).data
}

export async function getProgressProjectBimMatch(projectCode: string): Promise<BimMatchResult> {
  return (await apiClient.get(`/projects/${projectCode}/progress/bim-match`)).data
}

export async function getProgressPositions(projectCode: string): Promise<ProgressPositions> {
  return (await apiClient.get(`/projects/${projectCode}/progress/positions`)).data
}

export async function updateAssemblyProgress(
  projectCode: string,
  assemblyId: number,
  payload: UpdateAssemblyProgressPayload,
): Promise<ProgressZoneRow> {
  return (await apiClient.patch(`/projects/${projectCode}/progress/assemblies/${assemblyId}`, payload)).data
}

// Applies the same field values to many assemblies at once (bulk row
// selection) — one request, one backend transaction, not N sequential PATCHes.
export async function bulkUpdateAssemblyProgress(
  projectCode: string,
  assemblyIds: number[],
  payload: BulkUpdateAssemblyProgressPayload,
): Promise<{ updated: number }> {
  return (await apiClient.patch(`/projects/${projectCode}/progress/assemblies/bulk`, { assembly_ids: assemblyIds, ...payload })).data
}
