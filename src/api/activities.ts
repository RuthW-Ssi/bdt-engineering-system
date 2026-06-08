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
  material: ActivityMaterialDto
}

export interface ActivityLaborDto {
  labor_resource: ActivityMachineDto
  qty: number
}

export interface ActivityDto {
  id: number
  activity_code: string
  name: string
  machine: ActivityMachineDto
  consumes: ActivityConsumeDto[]
  labors: ActivityLaborDto[]
  duration_min: string
  create_uid: number
  create_date: string
  write_uid: number
  write_date: string
}

export interface CreateActivityPayload {
  name: string
  machine_id: number
  duration_min: number
  consumes?: number[]
  labors?: { id: number; qty: number }[]
}

export const activitiesApi = {
  list(params?: { q?: string; machine_id?: number; material_id?: number }): Promise<ActivityDto[]> {
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
