import { apiClient } from './client'
import { getPresignedUpload, uploadViaPresignedUrl } from './file-storage'

export interface Drawing {
  id: number
  project_id: number
  zone_id: number
  sub_zone_id: number | null
  // Per-mark revision (wiki: features/drawing-revision-plan.md). Both
  // nullable: a handful of legacy rows predate the mark/rev backfill and
  // were left unparsed rather than guessed at — callers must not assume
  // either is present. "Current" (highest rev per zone/sub-zone/mark) is
  // derived by the backend, never stored here.
  mark: string | null
  rev: number | null
  file_key: string
  file_name: string
  mime_type: string | null
  uploaded_by_id: number
  create_date: string
}

export async function getDrawingsByZone(zoneId: number, subZoneId: number | null): Promise<Drawing[]> {
  return (await apiClient.get('/drawings', { params: { zone_id: zoneId, sub_zone_id: subZoneId ?? undefined } })).data
}

// Distinct assembly marks from the ACTIVE BOM for a zone (or sub-zone) — used
// by the upload review table to offer a pick-list and flag a parsed mark
// that doesn't match anything in the BOM.
export async function getDrawingBomMarks(zoneId: number, subZoneId: number | null): Promise<string[]> {
  return (await apiClient.get('/drawings/bom-marks', { params: { zone_id: zoneId, sub_zone_id: subZoneId ?? undefined } })).data
}

// New GCS key shape (per-mark revision, replacing the old flat version
// folder): drawings/<project_code>/<zone_code>/[<subzone_code>/]<mark>/rev<n>/<file_name>.
// Mirrors the backend CreateDrawingDto's file_key regex
// (/^drawings\/[^/\\]+\/[^/\\]+\/(?:[^/\\]+\/)?[^/\\]+\/rev\d+\/[^/\\]+$/) —
// '/' and '\' in the mark and file name must not survive into the key, since
// either would otherwise smuggle in extra path segments.
export function drawingKey(
  scope: { projectCode: string; zoneCode: string; subZoneCode: string | null },
  mark: string,
  rev: number,
  fileName: string,
): string {
  const safeMark = mark.replace(/[/\\]/g, '_')
  const safeName = fileName.replace(/[/\\]/g, '_')
  const subZoneSegment = scope.subZoneCode ? `${scope.subZoneCode}/` : ''
  return `drawings/${scope.projectCode}/${scope.zoneCode}/${subZoneSegment}${safeMark}/rev${rev}/${safeName}`
}

export interface UploadDrawingInput {
  projectId: number
  projectCode: string
  zoneId: number
  zoneCode: string
  subZoneId: number | null
  subZoneCode: string | null
  mark: string
  rev: number
  file: File
  // May differ from file.name — the caller dedupes identically-named files
  // within one (mark, rev) pair before calling this (see useUploadDrawings).
  fileName: string
}

export async function uploadDrawing({ projectId, projectCode, zoneId, zoneCode, subZoneId, subZoneCode, mark, rev, file, fileName }: UploadDrawingInput): Promise<Drawing> {
  const key = drawingKey({ projectCode, zoneCode, subZoneCode }, mark, rev, fileName)
  const presigned = await getPresignedUpload(key, file.type || 'application/octet-stream')
  await uploadViaPresignedUrl(presigned, key, file)
  return (
    await apiClient.post('/drawings', {
      project_id: projectId,
      zone_id: zoneId,
      sub_zone_id: subZoneId ?? undefined,
      mark,
      rev,
      file_key: key,
      file_name: fileName,
      mime_type: file.type || undefined,
    })
  ).data
}

export async function deleteDrawing(id: number): Promise<void> {
  await apiClient.delete(`/drawings/${id}`)
}

// GET /file-storage/download is JWT-guarded — a bare <a href>/<iframe src>
// can't attach the Authorization header, so this fetches the file as an
// authenticated blob, matching the pattern ProjectProgress.tsx's
// handleExport already uses for the same problem (see
// backend/../file-storage.controller.ts's download() + apiClient's request
// interceptor for why: the endpoint requires a Bearer token). Shared by
// downloadDrawing (triggers a save) and the PDF preview panel (renders the
// blob in an iframe) — same fetch, different thing done with the result.
export async function fetchDrawingBlob(fileKey: string): Promise<Blob> {
  const res = await apiClient.get('/file-storage/download', {
    params: { key: fileKey },
    responseType: 'blob',
  })
  return res.data as Blob
}

export async function downloadDrawing(fileKey: string, fileName: string): Promise<void> {
  const blob = await fetchDrawingBlob(fileKey)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}
