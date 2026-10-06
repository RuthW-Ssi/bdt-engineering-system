import { isAxiosError } from 'axios'
import { apiClient } from './client'

// ── Enums (mirror Prisma) ─────────────────────────────────────────────────────
export type MoStatus = 'DRAFT' | 'CONFIRMED' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED'
// MO Part (wiki features/mo-part-import-plan): ASSEMBLY = mark-based MO,
// PART = size-based lines pre-filled from one source, then freely edited.
export type MoKind = 'ASSEMBLY' | 'PART'
export type PartSource = 'MATERIAL_LIST' | 'BOM_PART_LIST' | 'MANUAL'

export interface PartLine {
  profile: string
  grade: string
  length_mm: number
  qty: number
  unit_weight_kg?: number | null
  part_mark?: string | null
  bom_part_ids?: number[]
}

export interface MoPartLineRow extends PartLine {
  id: number
  line_seq: number
}

export interface CreateMoPartPayload {
  project_id: number
  primary_mark_prefix_code: string
  routing_template_id: number
  part_source: PartSource
  source_filename?: string | null
  plan_start?: string
  plan_finish?: string
  confirm?: boolean
  part_lines: PartLine[]
}

export type UpdateMoPartPayload = Pick<CreateMoPartPayload, 'primary_mark_prefix_code' | 'routing_template_id' | 'plan_start' | 'plan_finish' | 'part_lines'>

export interface MarkPrefix {
  code: string
  label: string
  category: string
}

export interface MoListItem {
  id: number
  mo_code: string
  status: MoStatus
  kind: MoKind
  plan_start: string | null
  plan_finish: string | null
  mark_prefix: MarkPrefix
  routing_template: { id: number; code: string; name: string }
  assembly_count: number
  part_line_count: number
  operation_count: number
  create_date: string
}

interface RoutingOpActivity {
  name: string
  measure: string | null
  labors: { skill: string; qty: number; level?: string | null }[]
  tools: { id: number; name: string; qty: number }[]
  consumables: { resource_id: number; code: string; name: string; formula_id?: number | null; formula_name?: string | null; formula_expr?: string | null; result_unit?: string | null }[]
}

// Routing op snapshot (read live from routing_template · replaces mo_operation)
export interface RoutingOp {
  id: number
  sequence: number
  op_code: string
  name: string
  time_cycle: string | number
  time_cycle_manual: string | number | null
  workcenter: { id: number; code: string; name: string; machine: string | null }
  op_type: { id: number; key: string; label: string; color: string } | null
  activities?: RoutingOpActivity[]
}

export interface MoAssemblyRow {
  id: number
  line_seq: number
  bom_assembly_id: number
  assembly_mark: string
  name: string | null
  project: string | null
  zone: string | null
  sub_zone: string | null
  qty: number
  total: number
  allocated: number
  remaining: number
  // Only present when fetched with an operation_id — qty of this mark still
  // unplanned for THAT operation within this MO, after sibling work orders
  // of the same operation. Distinct from `remaining` above (cross-MO).
  wo_remaining: number | null
  allocation_breakdown: { mo_code: string; qty: number }[]
}

export interface MoHistoryEntry {
  id: number
  from_status: MoStatus
  to_status: MoStatus
  reason: string
  changed_by: string
  changed_at: string
}

interface MoAssemblyLine {
  id: number
  bom_assembly_id: number
  qty: string | number
  line_seq: number
  bom_assembly: { assembly_mark: string; name: string | null }
}

export interface MoDetail extends Omit<MoListItem, 'routing_template'> {
  routing_template: { id: number; code: string; name: string; operations: RoutingOp[] }
  routing_template_id: number
  primary_mark_prefix_code: string
  actual_start: string | null
  actual_finish: string | null
  assembly_lines: MoAssemblyLine[]
  project: { id: number; project_code: string; name: string } | null
  part_source: PartSource | null
  // Prisma Decimal columns arrive as strings — convert with Number() before math.
  part_lines: MoPartLineRow[]
  projects_involved: { id: number; project_code: string; name: string }[]
  zones_involved: { id: number; label: string }[]
  sub_zones_involved: { id: number; name: string }[]
  create_uid: number
  write_uid: number
  write_date: string
  create_user?: { id: number; name: string; login: string }
  write_user?: { id: number; name: string; login: string }
  /**
   * Stale-BOM-version warnings for this MO's assembly lines (WO BOM-Version
   * Hold, Sprint 20 · S20-T05). Always present but only ever non-empty while
   * `status === 'DRAFT'` — the backend recomputes it on every `findOne()` and
   * hardcodes `[]` once the MO leaves DRAFT (WOs exist by then and carry the
   * ON_HOLD banner instead, per design Q22).
   */
  stale_assembly_warnings: { mo_assembly_line_id: number; assembly_mark: string; delta_types: string[] }[]
}

export interface CreateMoPayload {
  primary_mark_prefix_code: string
  routing_template_id: number
  plan_start?: string
  plan_finish?: string
  assembly_lines: { bom_assembly_id: number; qty: number }[]
  confirm?: boolean
}

// ── Form-support responses ────────────────────────────────────────────────────
export interface MarkPrefixWithCount extends MarkPrefix {
  part_type_code: string
  active: boolean
  pending_bom_count: number
}

export interface AssemblyPickerItem {
  id: number
  assembly_mark: string
  name: string | null
  mark_prefix: string | null
  project: string | null
  zone: string | null
  sub_zone: string | null
  project_due_date: string | null
  zone_end_date: string | null
  sub_zone_due_date: string | null
  bom_version: string
  total: number
  allocated: number
  remaining: number
  allocation_breakdown: { mo_code: string; qty: number }[]
}

export interface AssemblyPickerGroup {
  key: Record<string, string | null> | null
  label: string
  bom_version: string | null
  project_due_date: string | null
  zone_end_date: string | null
  sub_zone_due_date: string | null
  items: AssemblyPickerItem[]
}

export interface AssemblyPickerResponse {
  mark_prefix: string | null
  total: number
  groups: AssemblyPickerGroup[]
}

export interface RoutingTemplateLite {
  id: number
  code: string
  name: string
  state: string
  operation_count: number
  bound_product_count: number
}

export interface RoutingSuggestResponse {
  suggested: RoutingTemplateLite[]
  others: RoutingTemplateLite[]
}

export interface RoutingActivitySnap {
  name: string
  measure: string | null
  per_minute: number | null
  source_activity_id: number | null
  machine_id: number | null
  machine_name: string | null
  tool_ids: number[] | null
  tool_names: string[]
  labors: { skill: string; qty: number; level?: string | null }[] | null
  consumables: { resource_id: number; code: string; name: string }[] | null
}

export interface RoutingOpDetail {
  id: number
  sequence: number
  op_code: string
  name: string
  time_cycle: number
  time_cycle_manual: number | null
  time_mode: string
  formula_expr: string | null
  workcenter: { id: number; code: string; name: string; machine: string | null }
  op_type: { id: number; key: string; label: string; color: string } | null
  activities_snapshot: RoutingActivitySnap[] | null
}

export interface RoutingTemplateDetail {
  id: number
  code: string
  name: string
  state: string
  operations: RoutingOpDetail[]
}

export interface MoConsumeSummaryRow {
  material_id: number
  code: string
  name: string
  qty: number
  unit: string | null
}

export interface MoPartRow {
  part_mark: string
  description: string | null
  profile: string | null
  grade: string | null
  length_mm: number | null
  weight_kg_each: number | null
  total_qty: number
  total_weight_kg: number | null
  assembly_marks: string[]
  mo_breakdown: { mo_code: string; qty: number }[]
}

// Multi-mark redesign (2026-09-17): the ONLY way a WO gets created now —
// ALWAYS a brand-new WO for (this MO, operation_id). An operation can have
// several WOs at once (2026-09-23, e.g. split across teams), but there is no
// way to add marks to an already-created WO — "สร้าง wo แล้วไม่ควรเพิ่ม mark
// ทีหลังได้" (a WO's mark set is fixed at creation, same as its team/plan
// dates — need more marks for the same operation? Create another WO).
export interface CreateWoPayload {
  operation_id: number
  // Structured "which team is this WO issued to" (2026-09-22) — the Create WO
  // form's Team dropdown, FK to the `team` table.
  team_id?: number
  plan_start?: string
  plan_finish?: string
  // How many people from `team_id` are on this WO — required (2026-09-25).
  team_headcount: number
  marks: { assembly_line_id: number; qty: number }[]
  // Optional overrides on top of the auto-computed suggestions the preview
  // already showed — only entries the user actually edited need to be sent
  // (2026-09-17 single-page form: everything submits together in one call).
  parts?: { bom_assembly_part_id: number; qty: number }[]
  consume?: { material_id: number; qty_actual: number }[]
}

export interface CreateWoResult {
  work_order_id: number
  wo_code: string
  marks_added: number
}

// ── Preview (2026-09-17) — same selection shape as CreateWoPayload's marks,
// no writes. Called live as the user picks marks, before Create is pressed.
export interface PreviewWoPayload {
  operation_id: number
  marks: { assembly_line_id: number; qty: number }[]
}

export interface PreviewWoPart {
  bom_assembly_part_id: number
  assembly_mark: string
  part_mark: string
  profile: string | null
  grade: string | null
  // Pieces (2026-09-21) — parts are discrete physical items withdrawn by
  // count, not weighed out by hand. `qty` is the suggested default, already
  // capped by `max_qty`.
  qty: number
  // Real physical cap (2026-09-18, qty-based 2026-09-21) — sum of qty for
  // this part across every WO of this MO must never exceed the mark's true
  // total (unlike consume, which may legitimately go over its plan). Already
  // applied to `qty` above; surfaced separately so the UI can show/enforce
  // it as the input's max.
  max_qty: number
  // Weight per single piece — lets the UI show a live "= X kg" readout next
  // to the qty input without a network round-trip as the user edits qty.
  unit_weight_kg: number
  // qty × unit_weight_kg for the suggested qty above — informational only,
  // never independently edited or capped.
  weight_kg: number
}

export interface PreviewWoConsume {
  material_id: number
  code: string
  name: string
  // null when this material is linked to the operation in the Activity
  // Library with no formula to compute a quantity from — still shown (not
  // dropped) so this list doesn't disagree with the MO overview's Routing
  // card, which lists it as a plain reference regardless of formula.
  qty: number | null
  unit: string | null
}

export interface PreviewWoResult {
  parts: PreviewWoPart[]
  consume: PreviewWoConsume[]
  // What the new WO's own duration fields would be set to for this exact
  // (operation, marks) selection — same math recomputeDuration() runs once
  // the WO actually exists. Powers Plan Finish's auto-calculation in the
  // Create WO form (2026-09-23): Plan Start + these two, no manual entry.
  expected_duration_min: number
  setup_time_min: number
}

export async function previewMoWorkOrder(id: number, payload: PreviewWoPayload): Promise<PreviewWoResult> {
  return (await apiClient.post(`/mo/${id}/work-orders/preview`, payload)).data
}

// ── MO CRUD ───────────────────────────────────────────────────────────────────
export async function getMos(params?: {
  status?: MoStatus
  mark_prefix?: string
  project_id?: number
  search?: string
}): Promise<MoListItem[]> {
  const res = await apiClient.get('/mo', { params })
  return res.data
}

export async function getMo(id: number): Promise<MoDetail> {
  return (await apiClient.get(`/mo/${id}`)).data
}

export async function getMoAssemblies(id: number, operationId?: number): Promise<MoAssemblyRow[]> {
  return (await apiClient.get(`/mo/${id}/assemblies`, { params: operationId ? { operation_id: operationId } : undefined })).data
}

export async function getMoParts(id: number): Promise<MoPartRow[]> {
  return (await apiClient.get(`/mo/${id}/parts`)).data
}

export async function getMoConsumeSummary(id: number): Promise<MoConsumeSummaryRow[]> {
  return (await apiClient.get(`/mo/${id}/consume-summary`)).data
}

export async function getMoHistory(id: number): Promise<MoHistoryEntry[]> {
  return (await apiClient.get(`/mo/${id}/history`)).data
}

export function importMaterialList(file: File) {
  const fd = new FormData()
  fd.append('file', file)
  return apiClient
    .post('/mo/part/import/material-list', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    .then(r => r.data as { project_number: string | null; lines: PartLine[]; warnings: string[]; filename: string })
}

export function importBomParts(dispatchId: number, slot?: 'MAIN' | 'ACC') {
  return apiClient
    .get('/mo/part/import/bom-parts', { params: { dispatch_id: dispatchId, slot } })
    .then(r => r.data as { lines: PartLine[]; skipped: string[] })
}

export function createMoPart(payload: CreateMoPartPayload) {
  return apiClient.post('/mo/part', payload).then(r => r.data as { id: number; mo_code: string })
}

export function updateMoPart(id: number, payload: UpdateMoPartPayload) {
  return apiClient.patch(`/mo/part/${id}`, payload).then(r => r.data as { id: number; mo_code: string })
}

export async function createMo(payload: CreateMoPayload): Promise<MoDetail> {
  return (await apiClient.post('/mo', payload)).data
}

export async function updateMo(id: number, payload: Partial<CreateMoPayload>): Promise<MoDetail> {
  return (await apiClient.patch(`/mo/${id}`, payload)).data
}

// actual_start/actual_finish (2026-10-01) — typed by the user, only sent with
// to_status DONE (backend 400s them on any other transition, and no longer
// auto-fills them on Start).
export async function changeMoStatus(
  id: number,
  body: { to_status: MoStatus; reason: string; actual_start?: string; actual_finish?: string },
): Promise<MoDetail> {
  return (await apiClient.patch(`/mo/${id}/status`, body)).data
}

// DONE-only correction of the actual dates (2026-10-01) — 409 otherwise.
export async function updateMoActualDates(
  id: number,
  body: { actual_start: string; actual_finish: string },
): Promise<MoDetail> {
  return (await apiClient.patch(`/mo/${id}/actual-dates`, body)).data
}

export async function createMoWorkOrder(id: number, payload: CreateWoPayload): Promise<CreateWoResult> {
  return (await apiClient.post(`/mo/${id}/work-orders`, payload)).data
}

// ── Form-support endpoints ────────────────────────────────────────────────────
export async function getMarkPrefixesWithCount(params?: { project_id?: number; zone_id?: number }): Promise<MarkPrefixWithCount[]> {
  return (await apiClient.get('/mark-prefixes/with-pending-count', { params })).data
}

export async function getBomAssembliesByPrefix(params: {
  mark_prefix_id?: string
  pending_mo?: boolean
  group_by?: string
}): Promise<AssemblyPickerResponse> {
  return (await apiClient.get('/bom-assemblies', { params })).data
}

export async function getRoutingSuggestions(mark_prefix_id: string): Promise<RoutingSuggestResponse> {
  return (await apiClient.get('/routing-templates', { params: { mark_prefix_id } })).data
}

export async function getRoutingTemplateDetail(id: number): Promise<RoutingTemplateDetail> {
  return (await apiClient.get(`/routing-templates/${id}`)).data
}

// GET /mo/:id/print-packet is JWT-guarded, so it's fetched as an
// authenticated blob (same reason as fetchDrawingBlob in api/drawings.ts).
// `responseType: 'blob'` means axios never JSON-parses an ERROR body either
// (the 409 "missing drawing" payload arrives as a Blob, not the plain
// object getErrorMessage.ts expects) — read it back to JSON here so that
// helper still surfaces the real message instead of falling back to a
// generic one.
// `woIds` (2026-09-21) — selective print: which WO travelers to include.
// Omitted means every non-cancelled WO (backward-compatible default).
// `includeManifest` — whether the MO overview page is included too; omitted
// means included (backward-compatible default). At least one of the two
// must end up non-empty/true — the backend 409s otherwise.
// `lang` (2026-09-29) — language of the printed form's labels; backend
// defaults to 'en' when omitted.
export type PrintLang = 'en' | 'th'

export async function fetchMoPrintPacketBlob(id: number, woIds?: number[], includeManifest?: boolean, lang?: PrintLang): Promise<Blob> {
  try {
    return (await apiClient.get(`/mo/${id}/print-packet`, {
      responseType: 'blob',
      params: {
        ...(woIds ? { wo_ids: woIds.join(',') } : {}),
        ...(includeManifest === false ? { include_manifest: 'false' } : {}),
        ...(lang ? { lang } : {}),
      },
    })).data as Blob
  } catch (err) {
    if (isAxiosError(err) && err.response?.data instanceof Blob) {
      const text = await err.response.data.text()
      try {
        err.response.data = JSON.parse(text)
      } catch {
        // not JSON — leave the blob in place, getErrorMessage falls back
      }
    }
    throw err
  }
}
