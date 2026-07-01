import { apiClient } from './client'

export interface ActivityMachineDto {
  id: number
  code: string
  name: string
}

export interface ActivityMaterialDto {
  id: number
  default_code: string
  name: string
}

export interface ActivityConsumeDto {
  material: { id: number; default_code: string; name: string }
  formula:  { id: number; name: string; expr: string; result_unit: string | null; variables: string[] } | null
}

export interface ActivityLaborDto {
  skill: string
  qty: number
  level?: string | null
}

export interface ActivityToolDto {
  resource: { id: number; code: string; name: string }
  qty: number
}

export interface ActivityDto {
  id: number
  activity_code: string
  name: string
  machine: ActivityMachineDto | null
  consumes: ActivityConsumeDto[]
  skills: ActivityLaborDto[]
  tools?: ActivityToolDto[]
  duration_min: string
  create_uid: number
  create_date: string
  write_uid: number
  write_date: string
}

export interface CreateActivityPayload {
  name: string
  machine_id?: number
  duration_min: number
  consumes?: { material_id: number; formula_id?: number }[]
  labors?: { skill: string; qty: number; level?: string }[]
  tools?: { resource_id: number; qty: number }[]
}

export interface PaginatedActivities {
  data: ActivityDto[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export const activitiesApi = {
  list(params?: { q?: string; machine_id?: number; material_id?: number; page?: number; limit?: number }): Promise<PaginatedActivities> {
    return apiClient.get('/activities', { params }).then((r) => r.data)
  },

  getOne(id: number): Promise<ActivityDto> {
    return apiClient.get(`/activities/${id}`).then((r) => r.data)
  },

  create(payload: CreateActivityPayload): Promise<ActivityDto> {
    return apiClient.post('/activities', payload).then((r) => r.data)
  },

  update(id: number, payload: Partial<CreateActivityPayload>): Promise<ActivityDto> {
    return apiClient.patch(`/activities/${id}`, payload).then((r) => r.data)
  },

  remove(id: number): Promise<void> {
    return apiClient.delete(`/activities/${id}`).then(() => undefined)
  },
}
