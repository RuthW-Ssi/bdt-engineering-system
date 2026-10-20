import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getDrawingsByZone, getDrawingBomMarks, uploadDrawing, deleteDrawing, fetchDrawingBlob } from '../api/drawings'

export function useZoneDrawings(zoneId: number | undefined, subZoneId: number | null) {
  return useQuery({
    queryKey: ['drawings', zoneId, subZoneId],
    queryFn: () => getDrawingsByZone(zoneId!, subZoneId),
    enabled: zoneId != null,
  })
}

// Distinct assembly marks from the ACTIVE BOM for this zone (or sub-zone) —
// feeds the upload review table's mark pick-list / mismatch warning.
export function useDrawingBomMarks(zoneId: number | undefined, subZoneId: number | null) {
  return useQuery({
    queryKey: ['drawings', 'bom-marks', zoneId, subZoneId],
    queryFn: () => getDrawingBomMarks(zoneId!, subZoneId),
    enabled: zoneId != null,
  })
}

export interface StagedDrawing {
  file: File
  // The logical name this file is recorded under — the upload review table
  // (Task 6) seeds this from the file's own name and lets the user edit it.
  fileName: string
  mark: string
  rev: number
}

// Two staged items sharing the same (mark, rev, fileName) would otherwise
// collide on the same GCS key (drawingKey is pure over those three inputs)
// and silently overwrite one another within this single upload action —
// append a "-2", "-3"... suffix before the extension for repeats of that
// exact combination. A different mark or rev is a different folder, so it
// never needs a suffix even when the file name repeats.
function dedupeStagedFileNames(items: StagedDrawing[]): string[] {
  const seen = new Map<string, number>()
  return items.map(item => {
    const key = `${item.mark}\u0000${item.rev}\u0000${item.fileName}`
    const count = (seen.get(key) ?? 0) + 1
    seen.set(key, count)
    if (count === 1) return item.fileName
    const dot = item.fileName.lastIndexOf('.')
    const base = dot > 0 ? item.fileName.slice(0, dot) : item.fileName
    const ext = dot > 0 ? item.fileName.slice(dot) : ''
    return `${base}-${count}${ext}`
  })
}

interface UploadDrawingsScope {
  projectId: number | undefined
  projectCode: string | undefined
  zoneId: number | undefined
  zoneCode: string | undefined
  subZoneId: number | null
  subZoneCode: string | null
}

// Uploads every staged file independently (allSettled, not Promise.all) so
// one bad file (rejected by the backend's traversal/size checks) doesn't
// abort the others. Each staged item carries its own mark + rev (parsed from
// its filename, or typed by the user in the review table where parsing
// failed) — there is no more single batch-wide "next version" to look up
// first; per-mark revision is per (zone, sub-zone, mark), not per upload
// action. Upload is .pdf-only since 2026-09-15's DWG removal (see
// DrawingUploadModal.tsx).
export function useUploadDrawings(scope: UploadDrawingsScope) {
  const { projectId, projectCode, zoneId, zoneCode, subZoneId, subZoneCode } = scope
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (items: StagedDrawing[]) => {
      const fileNames = dedupeStagedFileNames(items)
      const results = await Promise.allSettled(
        items.map((item, i) =>
          uploadDrawing({
            projectId: projectId!, projectCode: projectCode!,
            zoneId: zoneId!, zoneCode: zoneCode!,
            subZoneId, subZoneCode,
            mark: item.mark, rev: item.rev,
            file: item.file, fileName: fileNames[i],
          }),
        ),
      )
      const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      return { uploaded: results.length - failed.length, failed }
    },
    onSuccess: ({ failed }) => {
      qc.invalidateQueries({ queryKey: ['drawings', zoneId, subZoneId] })
      if (failed.length > 0) {
        toast.error(`${failed.length} file${failed.length === 1 ? '' : 's'} failed to upload — please try again`)
      }
    },
    onError: () => toast.error('Failed to upload drawings — please try again'),
  })
}

export function useDeleteDrawing(zoneId: number | undefined, subZoneId: number | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteDrawing(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drawings', zoneId, subZoneId] }),
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to delete drawing — please try again'),
  })
}

// PDF preview needs no APS translation (unlike the now-removed .dwg preview
// path) — just an authenticated blob turned into an object URL an <iframe>
// can render directly. staleTime
// Infinity: a given file_key's bytes never change (a new upload gets a new
// key under a new rev folder), so the cached URL is reused rather than
// refetched every time this fileKey is selected again (e.g. switching the
// DWG/PDF browse toggle back and forth). Deliberately does NOT revoke the
// object URL on unmount/change — a revoke-on-cleanup effect was tried and
// reverted: because the value is cached and reused, "this caller stopped
// asking for it" does not mean "nobody will ask again," and revoking on
// that signal left the next reuse pointing at a dead blob (PDF viewer:
// "It may have been moved, edited, or deleted."). The tab's small number of
// distinct PDF previews per session is released when the page unloads —
// an acceptable trade-off against re-introducing that bug.
export function useDrawingPdfUrl(fileKey: string | null) {
  return useQuery({
    queryKey: ['drawings', 'pdf-blob-url', fileKey],
    queryFn: async () => {
      const blob = await fetchDrawingBlob(fileKey!)
      // Never trust the server-declared content-type for what this blob
      // renders as (security finding F-001) — this hook only ever runs for
      // a file the caller has already decided is a PDF, so re-wrap
      // unconditionally rather than pass the fetched blob's own `type`
      // through. Closes the content-type-spoofing vector at the one place
      // it actually matters (what the browser renders the object URL as),
      // independent of the backend's own upload-time allowlist.
      return URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }))
    },
    enabled: fileKey != null,
    staleTime: Infinity,
  })
}
