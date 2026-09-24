import { apiClient } from './client'

export interface SkillOption {
  id: number
  name: string
}

interface OperatorSkill {
  skill: { id: number; name: string }
  level: string | null
}

export interface TeamRef {
  id: number
  code: string
  name: string
}

export interface Operator {
  id: number
  code: string
  name: string
  nationality: string | null
  position_raw: string | null
  start_raw: string | null
  active: boolean
  team: TeamRef | null
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

interface SkillEntryPayload {
  skill_id: number
  level?: string
}

export interface CreateOperatorPayload {
  code: string
  name: string
  nationality?: string
  position_raw?: string
  start_raw?: string
  team_id?: number
  skills?: SkillEntryPayload[]
}

export interface UpdateOperatorPayload {
  code?: string
  name?: string
  nationality?: string
  position_raw?: string
  start_raw?: string
  team_id?: number | null
  active?: boolean
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

export interface Team {
  id: number
  code: string
  name: string
  active: boolean
}

export async function getTeams(): Promise<Team[]> {
  const res = await apiClient.get('/machines/teams')
  return res.data
}

export interface CreateTeamPayload {
  code: string
  name: string
}

export interface UpdateTeamPayload {
  code?: string
  name?: string
  active?: boolean
}

export async function createTeam(payload: CreateTeamPayload): Promise<Team> {
  const res = await apiClient.post('/machines/teams', payload)
  return res.data
}

export async function updateTeam(id: number, payload: UpdateTeamPayload): Promise<Team> {
  const res = await apiClient.patch(`/machines/teams/${id}`, payload)
  return res.data
}
