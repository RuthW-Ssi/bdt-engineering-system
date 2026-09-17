import { apiClient } from './client'

interface ActivityMachineDto {
  id: number
  code: string
  name: string
}

interface ActivityConsumeDto {
  material: { id: number; default_code: string; name: string }
  formula:  { id: number; name: string; expr: string; result_unit: string | null; variables: string[] } | null
}

interface ActivityLaborDto {
  skill: string
  qty: number
  level?: string | null
}

interface ActivityToolDto {
  resource: { id: number; code: string; name: string }
  qty: number
}

export const ACTIVITY_KINDS = ['run', 'setup', 'move', 'inspect'] as const
export type ActivityKind = (typeof ACTIVITY_KINDS)[number]

export interface ActivityDto {
  id: number
  activity_code: string
  name: string
  kind: ActivityKind
  machine: ActivityMachineDto | null
  consumes: ActivityConsumeDto[]
  skills: ActivityLaborDto[]
  tools?: ActivityToolDto[]
  duration_min: string
  // Prisma Decimal columns arrive as strings
  per_minute: string | null
  formula_code: string | null
  ratio: string | null
  ratio_unit: string | null
  per_time: string | null
  create_uid: number
  create_date: string
  write_uid: number
  write_date: string
}

export interface CreateActivityPayload {
  name: string
  machine_id?: number
  kind?: ActivityKind
  duration_min: number
  per_minute?: number
  formula_code?: string
  ratio?: number
  ratio_unit?: string
  per_time?: number
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
