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

// Direct-to-APS upload, three steps — the file bytes go straight from this
// browser to Autodesk's signed S3 URL, never through our own backend (or
// the Vercel rewrite in front of it). Confirmed 2026-07-21: both Vercel's
// rewrite-proxy body limit and Cloud Run's 32MiB HTTP/1 request cap are
// hard, non-configurable platform ceilings well under real IFC file sizes —
// routing the bytes through our own infra at all 413'd regardless of our
// own 100MB app-level limit, which never even got evaluated.
export async function uploadBimModel(payload: UploadBimModelPayload, onProgress?: (pct: number) => void): Promise<BimModelListItem> {
  const { data: init } = await apiClient.post('/bim-models/upload-init', { filename: payload.file.name })
  const { objectKey, uploadKey, url } = init as { objectKey: string; uploadKey: string; url: string }

  // Plain XHR (not apiClient/fetch) — this is a different origin (Autodesk's
  // S3-backed storage), no auth/interceptors apply, and XHR is what gives us
  // upload progress events (fetch has no request-body progress API).
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.upload.onprogress = e => { if (onProgress && e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)) }
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error(`Upload to storage failed (${xhr.status})`))
    xhr.onerror = () => reject(new Error('Upload to storage failed (network error)'))
    xhr.send(payload.file)
  })

  return (await apiClient.post('/bim-models/upload-complete', {
    project_id: payload.projectId,
    version_choice: payload.versionChoice,
    filename: payload.file.name,
    object_key: objectKey,
    upload_key: uploadKey,
  })).data
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
