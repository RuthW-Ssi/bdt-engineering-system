import { apiClient } from './client'
import type { MarkPrefix } from './mo'
import type { TeamRef } from './laborSkills'

// ── Enums (mirror Prisma) ─────────────────────────────────────────────────────
export type WoStatus =
  | 'NOT_STARTED'
  | 'RELEASED'
  | 'IN_PROGRESS'
  | 'PAUSED'
  | 'ON_HOLD'
  | 'DONE'
  | 'CANCELLED'

type WoEventType = 'START' | 'PAUSE' | 'RESUME' | 'DONE' | 'CANCEL' | 'ACCEPT_VERSION' | 'HOLD' | 'UNHOLD' | 'MARK_REMOVED'

// The "simple" transitions — a bare {reason?/notes?} body, POSTed to
// `/wo/:id/<action>`. done/cancel/remove-mark/accept-new-version each have
// their own richer per-mark body shape (multi-mark redesign, 2026-09-17) and
// their own dedicated functions/hooks below instead of living in this union.
export type WoAction = 'release' | 'start' | 'pause' | 'resume' | 'hold'

// Multi-mark redesign (2026-09-17): `assembly_mark` (singular) is gone —
// replaced by `assembly_marks`/`mark_count`; WO-level qty_done/qty_scrapped
// are gone too (they're per-mark now, see WoMark below).
export interface WoListItem {
  id: number
  wo_code: string
  status: WoStatus
  sequence: number
  mo: { id: number; mo_code: string }
  mark_prefix: MarkPrefix | null
  work_center: { id: number; code: string; name: string }
  assembly_marks: string[]
  mark_count: number
  qty_planned_total: number
  qty_done_total: number
  plan_start: string | null
  plan_finish: string | null
  actual_start: string | null
  actual_finish: string | null
  // Legacy free-text fallback — superseded by `subcontractor` (2026-09-22),
  // the structured Team picker. Still read for WOs created before then.
  assigned_to: string | null
  subcontractor: TeamRef | null
  is_outdated: boolean
}

interface EnrichedActivity {
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

// Operation-level snapshot — no duration_breakdown here any more (multi-mark
// redesign): how many minutes each activity contributes depends on WHICH
// mark (each has its own bom dimensions), so that moved onto WoMark below.
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
}

export interface WoMarkDispatch {
  id: number
  project: { name: string } | null
  zone: { id: number; label: string } | null
  sub_zone: { id: number; name: string } | null
}

export interface WoMarkBomAssembly {
  id: number
  assembly_mark: string
  name: string | null
  length_mm: number | null
  surface_area_m2: number | null
  weight_kg: number | null
  width_mm: number | null
  height_mm: number | null
  dispatch: WoMarkDispatch
}

// One row per (work_order, bom_assembly) — replaces the old WO-level
// bom_assembly/qty_done/qty_scrapped/qty_reusable/snapshot_dispatch fields
// (multi-mark redesign, 2026-09-17). A removed mark keeps its history
// (removed_at/by/reason) but `bom_version_status` is null once removed —
// nothing actionable once it's out of the WO.
//
// qty_qc_passed/qty_rework/qty_renew (2026-09-23, replaces qty_scrapped/
// qty_reusable) — QC breakdown of qty_done, entered both alongside qty_done
// during normal In Progress/Paused work AND for disposition on remove-mark/
// accept-new-version/cancel. Always qty_qc_passed + qty_rework + qty_renew
// ≤ qty_done.
export interface WoMark {
  id: number
  bom_assembly_id: number
  bom_assembly: WoMarkBomAssembly
  bom_dispatch_id_snapshot: number
  snapshot_dispatch: WoMarkDispatch | null
  qty_planned: string | number
  qty_not_started: string | number | null
  qty_in_progress: string | number | null
  qty_done: string | number | null
  qty_qc_passed: string | number | null
  qty_rework: string | number | null
  qty_renew: string | number | null
  removed_at: string | null
  removed_by: string | null
  removed_reason: string | null
  created_at: string
  created_by: string
  bom_version_status: BomVersionStatus | null
  duration_breakdown: DurationBreakdownRow[]
}

// Plan-vs-actual material consumption per WO (2026-09-17) — qty_planned is
// recomputed automatically (server-side) whenever the WO's marks change;
// qty_actual defaults to match but is user-editable with no upper cap (real
// usage can exceed the plan). PATCH /wo/:id/consume updates qty_actual only.
// Whole units only (2026-09-21) — both columns are a plain Int, not Decimal.
export interface WoConsume {
  id: number
  material_id: number
  material: { id: number; default_code: string; name: string }
  unit: string | null
  qty_planned: number
  qty_actual: number
  created_at: string
  created_by: string
  updated_at: string
  updated_by: string | null
}

// Physical part withdrawal (2026-09-17, qty-primary 2026-09-21), parallel to
// WoConsume but for bom_assembly_part rows — a distinct concept from
// formula-driven materials — and deliberately simpler: NO plan/actual split.
// `qty` (pieces) is auto-populated with a computed suggestion the first time
// a mark is added, but from then on it's just "whatever was entered" (PATCH
// /wo/:id/parts sets it directly); `weight_kg` is a derived display value
// (qty × the part's own weight_kg) kept in sync server-side, never edited
// directly. `bom_assembly_part.assembly` identifies which mark this part
// belongs to — each bom_assembly_part_id is already mark-specific, never
// shared.
export interface WoPart {
  id: number
  bom_assembly_part_id: number
  bom_assembly_part: {
    id: number
    qty: string | number
    part: { id: number; part_mark: string; profile: string | null; grade: string | null; weight_kg: string | number | null }
    assembly: { id: number; assembly_mark: string }
  }
  qty: string | number
  weight_kg: string | number
  created_at: string
  created_by: string
  updated_at: string
  updated_by: string | null
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
  plan_start: string | null
  plan_finish: string | null
  actual_start: string | null
  actual_finish: string | null
  pre_hold_status: WoStatus | null
  assigned_to: string | null
  subcontractor: TeamRef | null
  notes: string | null
  released_at: string | null
  released_by: string | null
  created_at: string
  updated_at: string
  created_by: string
  updated_by: string | null
  manufacturing_order: { id: number; mo_code: string; status: string; primary_mark_prefix_code: string; primary_mark_prefix: MarkPrefix }
  mrp_workcenter: { id: number; code: string; name: string; machine: string | null }
  mark_prefix: MarkPrefix
  marks: WoMark[]
  source_routing_op: SourceRoutingOp | null
  consumes: WoConsume[]
  parts: WoPart[]
}

export interface WoEvent {
  id: number
  work_order_id: number
  work_order_mark_id: number | null
  event_type: WoEventType
  notes: string | null
  recorded_by: string
  recorded_at: string
}

// ── Cancel cascade preview (Task 10, Sprint 20 · now per-mark) ─────────────
// One physical mark → many WOs (one per routing op, sharing mo_id + the
// mark). Cancelling one WO previews its non-CANCELLED siblings split into
// siblings with no output (auto-cascade-cancelled alongside the primary WO)
// and siblings with real output (left untouched — "Move to Stock" is a UI
// placeholder only, no stock/inventory concept exists in this codebase).
interface WoCancelSibling {
  id: number
  wo_code: string
  sequence: number
  status: WoStatus
  source_routing_op_id: number | null
  marks: { qty_done: string | number | null }[]
}

export interface WoCancelSiblingsPreview {
  to_cancel: WoCancelSibling[]
  needs_disposition: WoCancelSibling[]
}

/** Sum of qty_done across a sibling's non-removed marks — display helper. */
export function siblingQtyDone(sibling: WoCancelSibling): number {
  return sibling.marks.reduce((s, m) => s + (m.qty_done != null ? Number(m.qty_done) : 0), 0)
}

// Per-mark (multi-mark redesign, 2026-09-17) — GET /wo/:id/bom-version-status
// now returns one of these per non-removed mark, not one WO-level object.
export interface BomVersionStatus {
  work_order_mark_id: number
  bom_assembly_id: number
  assembly_mark: string
  is_outdated: boolean
  delta_types: ('REMOVED' | 'QTY_CHANGED' | 'SPEC_CHANGED')[]
  delta_details: Record<string, unknown> | null
  snapshot_dispatch_id: number
  latest_dispatch_id: number
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

// ── Visual tab (Sprint 28) ───────────────────────────────────────────────────
type WoBimMatchStatus = 'ok' | 'mark_not_found' | 'model_not_ready' | 'no_model'

export interface WoBimMatch {
  status: WoBimMatchStatus
  mark: string
  model_id: number | null
  model_version: string | null
  translation_status: string | null
  global_id: string | null
  match_count: number
}

// ── WO CRUD ───────────────────────────────────────────────────────────────────
export async function getWos(params?: {
  status?: WoStatus
  mo_id?: number
  work_center_id?: number
  mark_prefix_code?: string
  search?: string
  // Sprint 24 (progress page WO panel): mark-scoped filter — backend
  // resolves through mark + dispatch, not raw bom_assembly_id
  assembly_mark?: string
  project_id?: number
  zone_id?: number
}): Promise<WoListItem[]> {
  return (await apiClient.get('/wo', { params })).data
}

export async function getWo(id: number): Promise<WoDetail> {
  return (await apiClient.get(`/wo/${id}`)).data
}

export async function getWoEvents(id: number): Promise<WoEvent[]> {
  return (await apiClient.get(`/wo/${id}/events`)).data
}

// ── Status transitions — release / start / pause / hold / resume ───────────
// resume is dual-purpose server-side (PAUSED→IN_PROGRESS or ON_HOLD→unhold)
// but the same call either way from here.
export async function woTransition(
  id: number,
  action: WoAction,
  body?: { reason?: string; notes?: string },
): Promise<WoDetail> {
  return (await apiClient.post(`/wo/${id}/${action}`, body ?? {})).data
}

// ── QC breakdown (2026-09-23, replaces qty_reusable) — shared shape for
// done()'s per-mark input, cancel()'s mark_disposition[], remove-mark, and
// accept-new-version. All three optional individually (a field just isn't
// sent when not entered); together must sum to ≤ qty_done, enforced server-side.
export interface MarkQcBreakdownInput {
  qty_qc_passed?: number
  qty_rework?: number
  qty_renew?: number
}

// ── Done — per-mark array (multi-mark redesign, 2026-09-17) ────────────────
// qty_not_started/qty_in_progress (2026-09-23) — work-state breakdown of
// qty_planned, done-only (not shared with cancel/remove-mark/accept-version,
// unlike the QC fields — those disruption flows dispose of qty_done, not the
// not-yet-done remainder).
export interface WoDoneMarkInput extends MarkQcBreakdownInput {
  bom_assembly_id: number
  qty_not_started?: number
  qty_in_progress?: number
  qty_done: number
}

export async function woDone(id: number, body: { marks: WoDoneMarkInput[]; notes?: string }): Promise<WoDetail> {
  return (await apiClient.post(`/wo/${id}/done`, body)).data
}

// ── Cancel (whole WO) — per-mark QC breakdown array (multi-mark redesign) ───
export interface MarkDispositionInput extends MarkQcBreakdownInput {
  bom_assembly_id: number
}

export async function woCancel(
  id: number,
  body: { reason: string; mark_disposition?: MarkDispositionInput[] },
): Promise<WoDetail> {
  return (await apiClient.post(`/wo/${id}/cancel`, body)).data
}

// ── Remove one mark (multi-mark redesign, NEW) ──────────────────────────────
export interface RemoveMarkInput extends MarkQcBreakdownInput {
  bom_assembly_id: number
  reason: string
}

export async function removeWoMark(id: number, body: RemoveMarkInput): Promise<WoDetail> {
  return (await apiClient.post(`/wo/${id}/remove-mark`, body)).data
}

// ── Consume actuals — qty_planned is server-computed, this only sets qty_actual ──
export interface ConsumeActualInput {
  material_id: number
  qty_actual: number
}

export async function updateWoConsume(id: number, body: { consume: ConsumeActualInput[] }): Promise<WoDetail> {
  return (await apiClient.patch(`/wo/${id}/consume`, body)).data
}

// ── Part withdrawal — sets qty (pieces) directly, no plan/actual split ───────
export interface PartWithdrawnInput {
  bom_assembly_part_id: number
  qty: number
}

export async function updateWoParts(id: number, body: { parts: PartWithdrawnInput[] }): Promise<WoDetail> {
  return (await apiClient.patch(`/wo/${id}/parts`, body)).data
}

// ── Cancel cascade preview ──────────────────────────────────────────────────
export async function getWoCancelSiblings(id: number): Promise<WoCancelSiblingsPreview> {
  return (await apiClient.get(`/wo/${id}/cancel-siblings`)).data
}

// ── BOM Version Alert (now per-mark) ─────────────────────────────────────────
export async function getBomVersionStatus(id: number): Promise<BomVersionStatus[]> {
  return (await apiClient.get(`/wo/${id}/bom-version-status`)).data
}

export async function acceptNewVersion(
  id: number,
  body: MarkQcBreakdownInput & { bom_assembly_id: number; note?: string; apply_to_other_wos?: boolean },
): Promise<WoDetail> {
  return (await apiClient.post(`/wo/${id}/accept-new-version`, body)).data
}

// ── Schedule (read-only) ────────────────────────────────────────────────────
export async function getWoSchedule(id: number): Promise<WoScheduleGroup[]> {
  return (await apiClient.get(`/wo/${id}/schedule`)).data
}

// `bomAssemblyId` selects which of the WO's marks to resolve — omitted, the
// backend defaults to the WO's first non-removed mark (multi-mark redesign
// mark-selector, Visual tab).
export async function getWoBimMatch(id: number, bomAssemblyId?: number): Promise<WoBimMatch> {
  return (await apiClient.get(`/wo/${id}/bim-match`, { params: bomAssemblyId != null ? { bom_assembly_id: bomAssemblyId } : undefined })).data
}
