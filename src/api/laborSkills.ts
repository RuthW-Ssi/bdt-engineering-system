import { apiClient } from './client'

export interface SkillOption {
  id: number
  name: string
}

export interface OperatorSkill {
  skill: { id: number; name: string }
  level: string | null
}

export interface Operator {
  id: number
  code: string
  name: string
  nationality: string | null
  position_raw: string | null
  start_raw: string | null
  skills: OperatorSkill[]
}

export async function getOperators(): Promise<Operator[]> {
  const res = await apiClient.get('/machines/operators')
  return res.data
}

export async function getSkills(): Promise<SkillOption[]> {
  const res = await apiClient.get('/machines/skills')
  return res.data
}

export interface SkillEntryPayload {
  skill_id: number
  level?: string
}

export interface CreateOperatorPayload {
  code: string
  name: string
  nationality?: string
  position_raw?: string
  start_raw?: string
  skills?: SkillEntryPayload[]
}

export interface UpdateOperatorPayload {
  code?: string
  name?: string
  nationality?: string
  position_raw?: string
  start_raw?: string
  skills?: SkillEntryPayload[]
}

export async function createOperator(payload: CreateOperatorPayload): Promise<Operator> {
  const res = await apiClient.post('/machines/operators', payload)
  return res.data
}

export async function updateOperator(id: number, payload: UpdateOperatorPayload): Promise<Operator> {
  const res = await apiClient.patch(`/machines/operators/${id}`, payload)
  return res.data
}
