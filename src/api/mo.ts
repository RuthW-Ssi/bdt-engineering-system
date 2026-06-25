import { apiClient } from './client'

// ── Enums (mirror Prisma) ─────────────────────────────────────────────────────
export type MoStatus = 'DRAFT' | 'CONFIRMED' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED'

export interface MarkPrefix {
  code: string
  label: string
  category: string
}

export interface MoListItem {
  id: number
  mo_code: string
  status: MoStatus
  due_date: string | null
  mark_prefix: MarkPrefix
  routing_template: { id: number; code: string; name: string }
  assembly_count: number
  operation_count: number
  create_date: string
}

export interface RoutingOpActivity {
  name: string
  measure: string | null
  per_minute: number | null
  machine: { id: number; code: string; name: string } | null
  tools: { id: number; code: string; name: string; qty: number }[]
  labors: { skill: string; qty: number; level?: string | null }[] | null
  consumables: { resource_id: number; code: string; name: string }[] | null
}

// Routing op snapshot (read live from routing_template · replaces mo_operation)
export interface RoutingOp {
  id: number
  sequence: number
  op_code: string
  name: string
  time_cycle: string | number
  time_cycle_manual: string | number | null
  workcenter: { id: number; code: string; name: string }
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

export interface MoAssemblyLine {
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
  assembly_lines: MoAssemblyLine[]
  projects_involved: { id: number; project_code: string; name: string }[]
  zones_involved: { id: number; label: string }[]
  sub_zones_involved: { id: number; name: string }[]
  create_uid: number
  write_uid: number
  write_date: string
  create_user?: { id: number; name: string; login: string }
  write_user?: { id: number; name: string; login: string }
}

export interface CreateMoPayload {
  primary_mark_prefix_code: string
  routing_template_id: number
  due_date?: string
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
  bom_version: number
  total: number
  allocated: number
  remaining: number
  allocation_breakdown: { mo_code: string; qty: number }[]
}

export interface AssemblyPickerGroup {
  key: Record<string, string | null> | null
  label: string
  bom_version: number | null
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
  workcenter: { id: number; code: string; name: string }
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

export async function getMoAssemblies(id: number): Promise<MoAssemblyRow[]> {
  return (await apiClient.get(`/mo/${id}/assemblies`)).data
}

export async function getMoParts(id: number): Promise<MoPartRow[]> {
  return (await apiClient.get(`/mo/${id}/parts`)).data
}

export async function getMoHistory(id: number): Promise<MoHistoryEntry[]> {
  return (await apiClient.get(`/mo/${id}/history`)).data
}

export async function createMo(payload: CreateMoPayload): Promise<MoDetail> {
  return (await apiClient.post('/mo', payload)).data
}

export async function updateMo(id: number, payload: Partial<CreateMoPayload>): Promise<MoDetail> {
  return (await apiClient.patch(`/mo/${id}`, payload)).data
}

export async function changeMoStatus(
  id: number,
  body: { to_status: MoStatus; reason: string },
): Promise<MoDetail> {
  return (await apiClient.patch(`/mo/${id}/status`, body)).data
}

export async function cancelMo(id: number): Promise<MoDetail> {
  return (await apiClient.delete(`/mo/${id}`)).data
}

// ── Form-support endpoints ────────────────────────────────────────────────────
export async function getMarkPrefixesWithCount(): Promise<MarkPrefixWithCount[]> {
  return (await apiClient.get('/mark-prefixes/with-pending-count')).data
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
