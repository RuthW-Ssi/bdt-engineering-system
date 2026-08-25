import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getDrawingsByZone, getLatestDrawingVersion, uploadDrawing, deleteDrawing } from '../api/drawings'

export function useZoneDrawings(zoneId: number | undefined, subZoneId: number | null) {
  return useQuery({
    queryKey: ['drawings', zoneId, subZoneId],
    queryFn: () => getDrawingsByZone(zoneId!, subZoneId),
    enabled: zoneId != null,
  })
}

// Two files with the identical name in one batch would otherwise collide on
// the same GCS key (drawings/<code>/<zone>/[<subzone>/]v<n>/<name>) and
// silently overwrite one another — append a "-2", "-3"... suffix before the
// extension for repeats within THIS batch only (cross-version collisions
// can't happen, different version folders).
function dedupeFileNames(files: File[]): string[] {
  const seen = new Map<string, number>()
  return files.map(f => {
    const count = (seen.get(f.name) ?? 0) + 1
    seen.set(f.name, count)
    if (count === 1) return f.name
    const dot = f.name.lastIndexOf('.')
    const base = dot > 0 ? f.name.slice(0, dot) : f.name
    const ext = dot > 0 ? f.name.slice(dot) : ''
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
// abort the others. One upload action = one version of THIS zone(+sub-zone)'s
// drawing set — the next version is fetched once here, not once per file
// (mirrors how BIM's upload computes nextMajor/nextMinor once per upload,
// not per file). Version numbering is scoped per zone(+sub-zone), not per
// project, since 2026-08-25's Zone rescope — uploading to Zone A never
// bumps Zone B's version counter.
export function useUploadDrawings(scope: UploadDrawingsScope) {
  const { projectId, projectCode, zoneId, zoneCode, subZoneId, subZoneCode } = scope
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (files: File[]) => {
      const { version: latest } = await getLatestDrawingVersion(zoneId!, subZoneId)
      const nextVersion = (latest ?? 0) + 1
      const fileNames = dedupeFileNames(files)
      const results = await Promise.allSettled(
        files.map((file, i) =>
          uploadDrawing({
            projectId: projectId!, projectCode: projectCode!,
            zoneId: zoneId!, zoneCode: zoneCode!,
            subZoneId, subZoneCode,
            version: nextVersion, file, fileName: fileNames[i],
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
