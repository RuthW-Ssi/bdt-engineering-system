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
  // Upload BATCH number — NOT the drawing revision (that's `rev`, above).
  // +1 per upload action, scoped per zone(+sub-zone); every file in one
  // upload shares the same number (see useUploadDrawings). Nullable: a
  // handful of legacy/live-check rows predate it.
  version: number | null
  file_key: string
  file_name: string
  mime_type: string | null
  uploaded_by_id: number
  // Who uploaded this file (per spec: "upload date/time … plus who uploaded
  // them") — joined in by the backend's findByZone, optional/nullable the
  // same way uploaded_by_id's own user could in principle be missing. The
  // backend omits this join entirely (not just the field) for a customer
  // caller — never relied on here as a privacy boundary, just absent.
  uploaded_by?: { name: string } | null
  create_date: string
}

export async function getDrawingsByZone(zoneId: number, subZoneId: number | null): Promise<Drawing[]> {
  return (await apiClient.get('/drawings', { params: { zone_id: zoneId, sub_zone_id: subZoneId ?? undefined } })).data
}

// Highest .pdf upload-batch version already used for a zone (or sub-zone) —
// null if none yet. Restored alongside `version` itself (reversed "drop
// version" decision, 2026-10-20) — scoped the same way it was pre-branch.
export async function getLatestDrawingVersion(zoneId: number, subZoneId: number | null): Promise<{ version: number | null }> {
  return (await apiClient.get('/drawings/latest-version', { params: { zone_id: zoneId, sub_zone_id: subZoneId ?? undefined } })).data
}

// Distinct assembly marks from the ACTIVE BOM for a zone (or sub-zone) — used
// by the upload review table to offer a pick-list and flag a parsed mark
// that doesn't match anything in the BOM.
export async function getDrawingBomMarks(zoneId: number, subZoneId: number | null): Promise<string[]> {
  return (await apiClient.get('/drawings/bom-marks', { params: { zone_id: zoneId, sub_zone_id: subZoneId ?? undefined } })).data
}

// Task 11 fix round 1, finding 1 (2026-10-20): the client no longer uploads
// straight to the final per-mark/rev key — it stages the file at a
// disposable key under drawings/_incoming/, and the SERVER builds the real
// drawings/<project_code>/<zone_code>/[<subzone_code>/]<mark>/rev<n>/
// <file_name> key itself (backend file-key.ts's buildExpectedFileKey) only
// once the upload is proven valid (A3-normalised OK, ownership checked).
// This closes the old bug where a bad PDF re-uploaded under the SAME final
// key as an existing sheet destroyed that sheet — the presigned PUT had
// already overwritten the object before the server's own validation ran.
// Mirrors the backend CreateDrawingDto's upload_key regex
// (/^drawings\/_incoming\/[^/\\]+\/[0-9a-f-]{36}\/[^/\\]+$/).
export function stagingUploadKey(projectCode: string, fileName: string): string {
  const safeName = fileName.replace(/[/\\]/g, '_')
  return `drawings/_incoming/${projectCode}/${crypto.randomUUID()}/${safeName}`
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
  // Upload BATCH number — the same number for every file in one upload
  // action, fetched once per batch by useUploadDrawings (not per file).
  version: number
  file: File
  // May differ from file.name — the caller dedupes identically-named files
  // within one (mark, rev) pair before calling this (see useUploadDrawings).
  fileName: string
}

// zoneCode/subZoneCode (UploadDrawingInput) are NOT needed here any more —
// the staging key only needs the project code; the server derives
// zone/sub-zone from zone_id/sub_zone_id itself when it builds the final
// key. Left on the input type since useUploadDrawings' scope already carries
// them and other callers may still want them for display.
export async function uploadDrawing({ projectId, projectCode, zoneId, subZoneId, mark, rev, version, file, fileName }: UploadDrawingInput): Promise<Drawing> {
  const uploadKey = stagingUploadKey(projectCode, fileName)
  const presigned = await getPresignedUpload(uploadKey, file.type || 'application/octet-stream')
  await uploadViaPresignedUrl(presigned, uploadKey, file)
  return (
    await apiClient.post('/drawings', {
      project_id: projectId,
      zone_id: zoneId,
      sub_zone_id: subZoneId ?? undefined,
      mark,
      rev,
      version,
      upload_key: uploadKey,
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
