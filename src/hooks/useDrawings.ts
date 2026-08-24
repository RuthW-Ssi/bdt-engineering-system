import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getDrawingsByProject, getLatestDrawingVersion, uploadDrawing, deleteDrawing } from '../api/drawings'

export function useProjectDrawings(projectId: number | undefined) {
  return useQuery({
    queryKey: ['drawings', projectId],
    queryFn: () => getDrawingsByProject(projectId!),
    enabled: projectId != null,
  })
}

// Two files with the identical name in one batch would otherwise collide on
// the same GCS key (drawings/<code>/v<n>/<name>) and silently overwrite one
// another — append a "-2", "-3"... suffix before the extension for repeats
// within THIS batch only (cross-version collisions can't happen, different
// version folders).
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

// Uploads every staged file independently (allSettled, not Promise.all) so
// one bad file (rejected by the backend's traversal/size checks) doesn't
// abort the others — the project-level flow expects many sheets in one go.
// One upload action = one version, applied to every file in the batch —
// the next version is fetched once here, not once per file (mirrors how
// BIM's upload computes nextMajor/nextMinor once per upload, not per file).
export function useUploadDrawings(projectId: number | undefined, projectCode: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (files: File[]) => {
      const { version: latest } = await getLatestDrawingVersion(projectId!)
      const nextVersion = (latest ?? 0) + 1
      const fileNames = dedupeFileNames(files)
      const results = await Promise.allSettled(
        files.map((file, i) =>
          uploadDrawing({ projectId: projectId!, projectCode: projectCode!, version: nextVersion, file, fileName: fileNames[i] }),
        ),
      )
      const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      return { uploaded: results.length - failed.length, failed }
    },
    onSuccess: ({ failed }) => {
      qc.invalidateQueries({ queryKey: ['drawings', projectId] })
      if (failed.length > 0) {
        toast.error(`${failed.length} file${failed.length === 1 ? '' : 's'} failed to upload — please try again`)
      }
    },
    onError: () => toast.error('Failed to upload drawings — please try again'),
  })
}

export function useDeleteDrawing(projectId: number | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteDrawing(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drawings', projectId] }),
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to delete drawing — please try again'),
  })
}
