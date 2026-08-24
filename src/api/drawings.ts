import { apiClient } from './client'
import { getPresignedUpload, uploadViaPresignedUrl } from './file-storage'

export interface Drawing {
  id: number
  project_id: number
  version: number
  file_key: string
  file_name: string
  mime_type: string | null
  uploaded_by_id: number
  create_date: string
}

export async function getDrawingsByProject(projectId: number): Promise<Drawing[]> {
  return (await apiClient.get('/drawings', { params: { project_id: projectId } })).data
}

export async function getLatestDrawingVersion(projectId: number): Promise<{ version: number | null }> {
  return (await apiClient.get('/drawings/latest-version', { params: { project_id: projectId } })).data
}

export interface UploadDrawingInput {
  projectId: number
  projectCode: string
  version: number
  file: File
  // May differ from file.name — the caller dedupes identically-named files
  // within one batch before calling this (see useUploadDrawings).
  fileName: string
}

export async function uploadDrawing({ projectId, projectCode, version, file, fileName }: UploadDrawingInput): Promise<Drawing> {
  // Sanitize the filename portion — the backend's CreateDrawingDto now
  // validates file_key against /^drawings\/[^/\\]+\/v\d+\/[^/\\]+$/ (project
  // code + version folder + bare filename, no other path segments), so any
  // '/' or '\' in the original filename must not survive into the key.
  const safeName = fileName.replace(/[/\\]/g, '_')
  const key = `drawings/${projectCode}/v${version}/${safeName}`
  const presigned = await getPresignedUpload(key, file.type || 'application/octet-stream')
  await uploadViaPresignedUrl(presigned, key, file)
  return (
    await apiClient.post('/drawings', {
      project_id: projectId,
      version,
      file_key: key,
      file_name: fileName,
      mime_type: file.type || undefined,
    })
  ).data
}

export async function deleteDrawing(id: number): Promise<void> {
  await apiClient.delete(`/drawings/${id}`)
}

// GET /file-storage/download is JWT-guarded — a bare <a href> can't attach
// the Authorization header, so this fetches the file as an authenticated
// blob and triggers a synthetic download, matching the exact pattern
// ProjectProgress.tsx's handleExport already uses for the same problem
// (see backend/../file-storage.controller.ts's download() + apiClient's
// request interceptor for why: the endpoint requires a Bearer token).
export async function downloadDrawing(fileKey: string, fileName: string): Promise<void> {
  const res = await apiClient.get('/file-storage/download', {
    params: { key: fileKey },
    responseType: 'blob',
  })
  const url = URL.createObjectURL(res.data as Blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

// Same authenticated-blob-fetch pattern as downloadDrawing(), but for
// in-page preview instead of triggering a save-to-disk — caller owns the
// object URL's lifecycle (revoke it once the preview unmounts/changes).
export async function fetchDrawingBlob(fileKey: string): Promise<Blob> {
  const res = await apiClient.get('/file-storage/download', {
    params: { key: fileKey },
    responseType: 'blob',
  })
  return res.data as Blob
}
