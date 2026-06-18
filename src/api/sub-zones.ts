import { apiClient } from './client'

export interface SubZone {
  id: number
  zone_id: number
  name: string
  code: string | null
  start_date: string | null
  due_date: string | null
  active: boolean
}

export async function getSubZones(zoneId: number): Promise<SubZone[]> {
  const res = await apiClient.get(`/zones/${zoneId}/sub-zones`)
  return res.data
}

export async function createSubZone(zoneId: number, payload: { name: string; code?: string; start_date?: string; due_date?: string }): Promise<SubZone> {
  const res = await apiClient.post(`/zones/${zoneId}/sub-zones`, payload)
  return res.data
}

export async function updateSubZone(id: number, payload: { name?: string; code?: string }): Promise<SubZone> {
  const res = await apiClient.patch(`/sub-zones/${id}`, payload)
  return res.data
}

export async function deleteSubZone(id: number): Promise<void> {
  await apiClient.delete(`/sub-zones/${id}`)
}
