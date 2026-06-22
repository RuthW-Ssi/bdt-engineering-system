import { apiClient } from './client'

export interface ResourceDto {
  id: number; code: string; name: string; type: string
}

export interface OpActLaborDto {
  skill: string; qty: number; level?: string | null
}

export interface OpActMaterialDto {
  resource: { id: number; code: string; name: string }
  formula:  { id: number; name: string; expr: string; result_unit: string | null } | null
}

export interface OpActDto {
  id: number
  sequence: number
  name: string
  measure: string
  unit: string | null
  per_minute: string | null
  machine_id: number | null
  machine: ResourceDto | null
  source_activity_id: number | null
  source_activity_code: string | null
  snapshot_at: string | null
  is_stale: boolean
  tools: { resource: ResourceDto; qty: number }[]
  consumables: { resource: ResourceDto; qty: string | null; unit: string | null }[]
  skills: OpActLaborDto[]
  op_materials: OpActMaterialDto[]
}

export interface OperationTemplateDetailDto {
  id: number
  op_code: string
  name: string
  status: string
  time_mode: string
  duration_min: string | null
  formula_expr: string | null
  method?: string | null
  op_type_id: number | null
  workcenter_id: number | null
  activities: OpActDto[]
}

export const operationTemplatesApi = {
  getOne(id: number, staleCheck = false): Promise<OperationTemplateDetailDto> {
    const params = staleCheck ? { include: 'stale_check' } : undefined
    return apiClient.get(`/operation-templates/${id}`, { params }).then(r => r.data)
  },

  addFromLibrary(templateId: number, activityId: number): Promise<OpActDto> {
    return apiClient
      .post(`/operation-templates/${templateId}/activities/from-library/${activityId}`)
      .then(r => r.data)
  },

  updateFromLibrary(templateId: number, opActId: number): Promise<OpActDto> {
    return apiClient
      .post(`/operation-templates/${templateId}/activities/${opActId}/update-from-library`)
      .then(r => r.data)
  },
}
