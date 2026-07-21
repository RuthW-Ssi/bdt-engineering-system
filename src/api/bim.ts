import { apiClient } from './client'

export type BimTranslationStatus = 'pending' | 'processing' | 'extracting' | 'complete' | 'failed'

export interface BimModelListItem {
  id: number
  filename: string
  translation_status: BimTranslationStatus
  create_date: string
  project_id: number
  major_version: number
  minor_version: number
}

export interface BimLatestVersion {
  major_version: number | null
  minor_version: number | null
}

export interface UploadBimModelPayload {
  file: File
  projectId: number
  versionChoice: 'minor' | 'major'
}

export interface BimModelFilter {
  projectId?: number
}

export interface BimStatusResult {
  id: number
  status: BimTranslationStatus
  progress?: string
  error: string | null
}

export interface BimElement {
  id: number
  model_id: number
  viewer_id: number | null
  external_id: string | null
  mark: string | null
  global_id: string | null
  ifc_type: string | null
  phase: string | null
  position: string | null
  assembly_mark: string | null
  assembly_global_id: string | null
  weight_kg: number | null
  area_m2: number | null
  length_mm: number | null
  width_mm: number | null
  height_mm: number | null
  status: string
  properties: Record<string, Record<string, unknown>>
}

export interface BimViewerToken {
  urn: string
  access_token: string
}

export async function listBimModels(filter?: BimModelFilter): Promise<BimModelListItem[]> {
  return (await apiClient.get('/bim-models', {
    params: { project_id: filter?.projectId },
  })).data
}

export async function getLatestBimVersion(projectId: number): Promise<BimLatestVersion> {
  return (await apiClient.get('/bim-models/latest-version', {
    params: { project_id: projectId },
  })).data
}

export function uploadBimModel(payload: UploadBimModelPayload, onProgress?: (pct: number) => void): Promise<BimModelListItem> {
  const formData = new FormData()
  formData.append('file', payload.file)
  formData.append('project_id', String(payload.projectId))
  formData.append('version_choice', payload.versionChoice)
  return apiClient
    .post('/bim-models', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress
        ? e => { if (e.total) onProgress(Math.round((e.loaded / e.total) * 100)) }
        : undefined,
    })
    .then(r => r.data)
}

export async function getBimStatus(id: number): Promise<BimStatusResult> {
  return (await apiClient.get(`/bim-models/${id}/status`)).data
}

export async function retryBimModel(id: number): Promise<{ id: number; status: BimTranslationStatus }> {
  return (await apiClient.post(`/bim-models/${id}/retry`)).data
}

export async function getBimElements(id: number): Promise<BimElement[]> {
  return (await apiClient.get(`/bim-models/${id}/elements`)).data
}

export async function getBimViewerToken(id: number): Promise<BimViewerToken> {
  return (await apiClient.get(`/bim-models/${id}/viewer-token`)).data
}
