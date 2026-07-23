import { apiClient } from './client'

export type ProgressStatus = 'notstart' | 'qcinsp' | 'qcfinal' | 'load' | 'install' | 'done'

export interface ProgressZoneRow {
  assembly_id: number
  mark: string
  weight_kg: number | null
  qty: number | null
  qc_inspection_pass: boolean
  qc_final_pass: boolean
  actual_load_date: string | null
  install_date: string | null
  qc_install_date: string | null
  pct: number
  status: ProgressStatus
}

export interface ProgressBuckets {
  notstart: number
  in_progress: number
  done: number
}

export interface ProgressZoneRollup {
  zone_id: number
  zone_code: string
  zone_label: string
  assembly_count: number
  total_weight_kg: number
  pct: number
  buckets: ProgressBuckets
}

export interface ProgressOverview {
  zones: ProgressZoneRollup[]
  total: { assembly_count: number; total_weight_kg: number; pct: number; buckets: ProgressBuckets }
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

// Partial update — omitted fields stay unchanged, explicit null clears a date.
export interface UpdateAssemblyProgressPayload {
  qc_inspection_pass?: boolean
  qc_final_pass?: boolean
  actual_load_date?: string | null
  install_date?: string | null
  qc_install_date?: string | null
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
  payload: UpdateAssemblyProgressPayload,
): Promise<{ updated: number }> {
  return (await apiClient.patch(`/projects/${projectCode}/progress/assemblies/bulk`, { assembly_ids: assemblyIds, ...payload })).data
}
