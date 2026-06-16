import { apiClient } from './client'

// ── Enums (mirror Prisma) ─────────────────────────────────────────────────────
export type MoStatus = 'DRAFT' | 'CONFIRMED' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED'
export type MoOperationStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE'

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

export interface MoOperation {
  id: number
  sequence: number
  source_routing_op_id: number | null
  work_center_id: number
  work_center: { id: number; code: string; name: string }
  expected_duration_min: number
  setup_time_min: number
  op_attributes: Record<string, unknown>
  status: MoOperationStatus
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

export interface MoDetail extends MoListItem {
  routing_template_id: number
  primary_mark_prefix_code: string
  bottleneck_op_id: number | null
  assembly_lines: MoAssemblyLine[]
  operations: MoOperation[]
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

export async function getMoOperations(id: number): Promise<MoOperation[]> {
  return (await apiClient.get(`/mo/${id}/operations`)).data
}

export async function getMoAssemblies(id: number): Promise<MoAssemblyRow[]> {
  return (await apiClient.get(`/mo/${id}/assemblies`)).data
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

export async function updateOpStatus(
  id: number,
  opId: number,
  status: MoOperationStatus,
): Promise<MoOperation> {
  return (await apiClient.patch(`/mo/${id}/operations/${opId}/status`, { status })).data
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
