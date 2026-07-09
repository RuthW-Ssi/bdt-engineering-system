import { apiClient } from './client'
import type { MarkPrefix } from './mo'

// ── Enums (mirror Prisma) ─────────────────────────────────────────────────────
export type WoStatus =
  | 'NOT_STARTED'
  | 'RELEASED'
  | 'IN_PROGRESS'
  | 'PAUSED'
  | 'ON_HOLD'
  | 'DONE'
  | 'CANCELLED'

export type WoEventType = 'START' | 'PAUSE' | 'RESUME' | 'DONE' | 'CANCEL' | 'ACCEPT_VERSION'

export type WoAction = 'release' | 'start' | 'pause' | 'resume' | 'done' | 'cancel'

export interface WoListItem {
  id: number
  wo_code: string
  status: WoStatus
  sequence: number
  mo: { id: number; mo_code: string }
  mark_prefix: MarkPrefix | null
  work_center: { id: number; code: string; name: string }
  assembly_mark: string
  earliest_start_at: string | null
  actual_start_at: string | null
  actual_end_at: string | null
  target_end_at: string | null
  qty_done: string | number | null
  qty_scrapped: string | number | null
  assigned_to: string | null
  is_outdated: boolean
}

export interface EnrichedActivity {
  name: string
  measure: string | null
  per_minute: number | null
  formula_code: string | null
  tools: { id: number; code: string; name: string; qty: number }[]
  consumables: { resource_id: number; code: string; name: string; formula_id?: number | null; formula_name?: string | null; formula_expr?: string | null; result_unit?: string | null }[] | null
  labors: { skill: string; qty: number; level?: string | null }[] | null
}

export interface DurationBreakdownRow {
  name: string
  kind: string
  formula_code: string | null
  dimension_label: string
  dimension_value: number | null
  per_minute: number | null
  minutes: number
  is_setup: boolean
}

export interface SourceRoutingOp {
  id: number
  op_code: string
  name: string
  time_mode: string
  time_cycle: string | number | null
  time_cycle_manual: string | number | null
  formula_expr: string | null
  op_type: { id: number; key: string; label: string; color: string } | null
  activities: EnrichedActivity[]
  duration_breakdown: DurationBreakdownRow[]
}

export interface WoDetail {
  id: number
  wo_code: string
  status: WoStatus
  mo_id: number
  source_routing_op_id: number | null
  sequence: number
  work_center_id: number
  expected_duration_min: number
  setup_time_min: number
  op_attributes: Record<string, unknown>
  bom_assembly_id: number
  bom_dispatch_id_snapshot: number
  earliest_start_at: string | null
  actual_start_at: string | null
  actual_end_at: string | null
  target_end_at: string | null
  qty_done: string | number | null
  qty_scrapped: string | number | null
  assigned_to: string | null
  notes: string | null
  released_at: string | null
  released_by: string | null
  created_at: string
  updated_at: string
  created_by: string
  updated_by: string | null
  manufacturing_order: { id: number; mo_code: string; status: string; primary_mark_prefix_code: string; primary_mark_prefix: MarkPrefix }
  mrp_workcenter: { id: number; code: string; name: string; machine: string | null }
  bom_assembly: { id: number; assembly_mark: string; name: string | null; length_mm: number | null; surface_area_m2: number | null; weight_kg: number | null; width_mm: number | null; height_mm: number | null; dispatch: { id: number; project: { name: string } | null; zone: { label: string } | null; sub_zone: { name: string } | null } }
  mark_prefix: MarkPrefix
  snapshot_dispatch: { id: number; project: { name: string } | null; zone: { label: string } | null; sub_zone: { name: string } | null } | null
  source_routing_op: SourceRoutingOp | null
}

export interface WoEvent {
  id: number
  work_order_id: number
  event_type: WoEventType
  notes: string | null
  recorded_by: string
  recorded_at: string
}

// ── Cancel cascade preview (Task 10, Sprint 20) ─────────────────────────────
// One BOM mark → many WOs (one per routing op, sharing mo_id + bom_assembly_id).
// Cancelling one WO previews its non-CANCELLED siblings split into siblings
// with no output (auto-cascade-cancelled alongside the primary WO) and
// siblings with real output (left untouched — "Move to Stock" is a UI
// placeholder only, no stock/inventory concept exists in this codebase).
export interface WoCancelSibling {
  id: number
  wo_code: string
  sequence: number
  status: WoStatus
  qty_done: string | number | null
  source_routing_op_id: number | null
}

export interface WoCancelSiblingsPreview {
  to_cancel: WoCancelSibling[]
  needs_disposition: WoCancelSibling[]
}

export interface BomVersionStatus {
  is_outdated: boolean
  delta_types: ('REMOVED' | 'QTY_CHANGED' | 'SPEC_CHANGED')[]
  delta_details: Record<string, unknown> | null
  snapshot_dispatch_id: number
  latest_dispatch_id: number
  assembly_mark: string
}

export interface ScheduleVersion {
  id: number
  version_code: string
  description: string | null
  is_active: boolean
  scheduler_source: string | null
  created_at: string
  created_by: string
}

export interface WoScheduleGroup {
  version: { id: number; version_code: string; is_active: boolean; scheduler_source: string | null; description: string | null }
  rows: {
    id: number
    start_datetime: string
    end_datetime: string
    workcenter_line: { id: number; code: string; name: string } | null
  }[]
}

// ── WO CRUD ───────────────────────────────────────────────────────────────────
export async function getWos(params?: {
  status?: WoStatus
  mo_id?: number
  work_center_id?: number
  mark_prefix_code?: string
  search?: string
}): Promise<WoListItem[]> {
  return (await apiClient.get('/wo', { params })).data
}

export async function getWo(id: number): Promise<WoDetail> {
  return (await apiClient.get(`/wo/${id}`)).data
}

export async function getWoEvents(id: number): Promise<WoEvent[]> {
  return (await apiClient.get(`/wo/${id}/events`)).data
}

export async function updateWo(
  id: number,
  payload: { assigned_to?: string; notes?: string; earliest_start_at?: string },
): Promise<WoDetail> {
  return (await apiClient.patch(`/wo/${id}`, payload)).data
}

// ── Status transitions ──────────────────────────────────────────────────────
export async function woTransition(
  id: number,
  action: WoAction,
  body?: { reason?: string; qty_done?: number; qty_scrapped?: number; notes?: string; qty_reusable?: number },
): Promise<WoDetail> {
  return (await apiClient.post(`/wo/${id}/${action}`, body ?? {})).data
}

// ── Cancel cascade preview ──────────────────────────────────────────────────
export async function getWoCancelSiblings(id: number): Promise<WoCancelSiblingsPreview> {
  return (await apiClient.get(`/wo/${id}/cancel-siblings`)).data
}

// ── BOM Version Alert ───────────────────────────────────────────────────────
export async function getBomVersionStatus(id: number): Promise<BomVersionStatus> {
  return (await apiClient.get(`/wo/${id}/bom-version-status`)).data
}

export async function acceptNewVersion(
  id: number,
  body?: { note?: string; qty_reusable?: number },
): Promise<WoDetail> {
  return (await apiClient.post(`/wo/${id}/accept-new-version`, body ?? {})).data
}

// ── Schedule (read-only) ────────────────────────────────────────────────────
export async function getScheduleVersions(): Promise<ScheduleVersion[]> {
  return (await apiClient.get('/schedule/versions')).data
}

export async function getWoSchedule(id: number): Promise<WoScheduleGroup[]> {
  return (await apiClient.get(`/wo/${id}/schedule`)).data
}
