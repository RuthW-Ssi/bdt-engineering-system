import { apiClient } from './client'
import { getPresignedUpload, uploadViaPresignedUrl } from './file-storage'

export interface Drawing {
  id: number
  project_id: number
  zone_id: number
  sub_zone_id: number | null
  version: number
  file_key: string
  file_name: string
  mime_type: string | null
  uploaded_by_id: number
  create_date: string
}

export async function getDrawingsByZone(zoneId: number, subZoneId: number | null): Promise<Drawing[]> {
  return (await apiClient.get('/drawings', { params: { zone_id: zoneId, sub_zone_id: subZoneId ?? undefined } })).data
}

export async function getLatestDrawingVersion(zoneId: number, subZoneId: number | null): Promise<{ version: number | null }> {
  return (await apiClient.get('/drawings/latest-version', { params: { zone_id: zoneId, sub_zone_id: subZoneId ?? undefined } })).data
}

export interface UploadDrawingInput {
  projectId: number
  projectCode: string
  zoneId: number
  zoneCode: string
  subZoneId: number | null
  subZoneCode: string | null
  version: number
  file: File
  // May differ from file.name — the caller dedupes identically-named files
  // within one batch before calling this (see useUploadDrawings).
  fileName: string
}

export async function uploadDrawing({ projectId, projectCode, zoneId, zoneCode, subZoneId, subZoneCode, version, file, fileName }: UploadDrawingInput): Promise<Drawing> {
  // Sanitize the filename portion — the backend's CreateDrawingDto validates
  // file_key against /^drawings\/[^/\\]+\/[^/\\]+\/(?:[^/\\]+\/)?v\d+\/[^/\\]+$/
  // (project code + zone code + optional sub-zone code + version folder +
  // bare filename), so any '/' or '\' in the original filename must not
  // survive into the key.
  const safeName = fileName.replace(/[/\\]/g, '_')
  const subZoneSegment = subZoneCode ? `${subZoneCode}/` : ''
  const key = `drawings/${projectCode}/${zoneCode}/${subZoneSegment}v${version}/${safeName}`
  const presigned = await getPresignedUpload(key, file.type || 'application/octet-stream')
  await uploadViaPresignedUrl(presigned, key, file)
  return (
    await apiClient.post('/drawings', {
      project_id: projectId,
      zone_id: zoneId,
      sub_zone_id: subZoneId ?? undefined,
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
