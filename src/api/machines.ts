import { apiClient } from './client'

export type EquipmentStatus = 'OPERATIONAL' | 'MAINTENANCE' | 'REPAIR' | 'UNAVAILABLE' | 'RETIRED'
export type RepairStatus = 'OPEN' | 'IN_PROGRESS' | 'CLOSED'
export type RepairSeverity = 'LOW' | 'MEDIUM' | 'HIGH'

export interface Machine {
  id: number
  code: string
  name: string
  type: string
  current_status: EquipmentStatus
  last_maintenance_at: string | null
  days_since_pm: number | null
  location: string | null
  manufacturer: string | null
  model: string | null
}

export interface MachineDetail extends Machine {
  serial_number: string | null
  install_date: string | null
  specs: string | null
  photo_url: string | null
  quick_stats: {
    last_maintenance_at: string | null
    repairs_this_month: number
    downtime_hours: number | null
  }
  mock_jobs: MockJob[]
  _count: { repair_tickets: number; maintenance_logs: number }
}

export interface MockJob {
  code: string
  operation: string
  status: string
  start: string
  end: string | null
}

export interface MaintenanceLog {
  id: number
  machine_id: number
  performed_at: string
  performed_by: string
  description: string
  parts_replaced: string | null
  duration_min: number | null
  notes: string | null
  photo_urls: string[]
  created_at: string
}

export interface RepairTicket {
  id: number
  machine_id: number
  ticket_code: string
  status: RepairStatus
  severity: RepairSeverity
  reported_by: string
  reported_at: string
  problem_description: string
  photos_before: string[]
  repaired_by: string | null
  closed_at: string | null
  repair_description: string | null
  parts_replaced: string | null
  duration_min: number | null
  photos_after: string[]
  created_at: string
}

export interface StatusHistory {
  id: number
  machine_id: number
  from_status: EquipmentStatus
  to_status: EquipmentStatus
  reason: string
  changed_by: string
  changed_at: string
  related_repair_id: number | null
  related_maintenance_id: number | null
}

export interface SuggestedStatusChange {
  from: EquipmentStatus
  to: EquipmentStatus
}

export async function getMachines(params?: {
  status?: EquipmentStatus
  area?: string
  name?: string
}): Promise<Machine[]> {
  const res = await apiClient.get('/machines', { params })
  return res.data
}

export async function getMachine(id: number): Promise<MachineDetail> {
  const res = await apiClient.get(`/machines/${id}`)
  return res.data
}

export async function getMaintenanceLogs(machineId: number): Promise<MaintenanceLog[]> {
  const res = await apiClient.get(`/machines/${machineId}/maintenance-logs`)
  return res.data
}

export async function getRepairTickets(machineId: number): Promise<RepairTicket[]> {
  const res = await apiClient.get(`/machines/${machineId}/repair-tickets`)
  return res.data
}

export async function getStatusHistory(machineId: number): Promise<StatusHistory[]> {
  const res = await apiClient.get(`/machines/${machineId}/status-history`)
  return res.data
}

export async function createMaintenanceLog(machineId: number, payload: {
  performed_at: string
  performed_by: string
  description: string
  parts_replaced?: string
  duration_min?: number
  notes?: string
  photo_urls?: string[]
}): Promise<MaintenanceLog> {
  const res = await apiClient.post(`/machines/${machineId}/maintenance-logs`, payload)
  return res.data
}

export async function openRepairTicket(machineId: number, payload: {
  reported_by: string
  reported_at: string
  severity: RepairSeverity
  problem_description: string
  photos_before?: string[]
}): Promise<{ ticket: RepairTicket; suggested_status_change: SuggestedStatusChange | null }> {
  const res = await apiClient.post(`/machines/${machineId}/repair-tickets`, payload)
  return res.data
}

export async function closeRepairTicket(machineId: number, ticketId: number, payload: {
  repaired_by: string
  closed_at: string
  repair_description: string
  parts_replaced?: string
  duration_min?: number
  photos_after?: string[]
}): Promise<{ ticket: RepairTicket; suggested_status_change: SuggestedStatusChange | null }> {
  const res = await apiClient.patch(`/machines/${machineId}/repair-tickets/${ticketId}/close`, payload)
  return res.data
}

export async function changeStatus(machineId: number, payload: {
  new_status: EquipmentStatus
  reason: string
  changed_by: string
}): Promise<MachineDetail> {
  const res = await apiClient.patch(`/machines/${machineId}/status`, payload)
  return res.data
}

export async function uploadMachinePhoto(file: File): Promise<{ url: string }> {
  const form = new FormData()
  form.append('file', file)
  const res = await apiClient.post('/machines/upload/machine-photo', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}
