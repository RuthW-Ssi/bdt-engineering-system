import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { dispatchesApi } from '../api/dispatches'
import type { RevEdit, RevReviewDto, UploadPreviewDto, RenamePairInput } from '../api/dispatches'

export function useDispatches(params?: Parameters<typeof dispatchesApi.list>[0]) {
  return useQuery({
    queryKey: ['dispatches', params],
    queryFn: () => dispatchesApi.list(params),
  })
}

export function useDispatchDetail(id: number | undefined, opts?: { skipGlobalErrorToast?: boolean }) {
  return useQuery({
    queryKey: ['dispatch', id],
    queryFn: () => dispatchesApi.get(id!),
    enabled: !!id,
    meta: { skipGlobalErrorToast: opts?.skipGlobalErrorToast },
  })
}

export function useDispatchDiff(id: number | undefined) {
  return useQuery({
    queryKey: ['dispatch-diff', id],
    queryFn: () => dispatchesApi.getDiff(id!),
    enabled: !!id,
    staleTime: 60_000,
    meta: { skipGlobalErrorToast: true },
  })
}

export function useDispatchDiffBimModels(
  id: number | undefined,
  opts?: { oldModelId?: number; newModelId?: number },
) {
  return useQuery({
    queryKey: ['dispatch-diff-bim-models', id, opts?.oldModelId ?? null, opts?.newModelId ?? null],
    queryFn: () => dispatchesApi.getDiffBimModels(id!, opts),
    enabled: !!id,
    staleTime: 60_000,
    meta: { skipGlobalErrorToast: true },
  })
}

export function useZoneUploadMode(projectId: number | null, zoneId: number | null) {
  return useQuery({
    queryKey: ['zone-upload-mode', projectId, zoneId],
    queryFn: () => dispatchesApi.getZoneUploadMode(projectId!, zoneId!),
    enabled: !!projectId && !!zoneId,
    staleTime: 30_000,
  })
}

// ── BOM mark/part rename pairing ────────────────────────────────
export function useRenameCandidates(id: number | undefined) {
  return useQuery({
    queryKey: ['rename-candidates', id],
    queryFn: () => dispatchesApi.getRenameCandidates(id!),
    enabled: !!id,
    meta: { skipGlobalErrorToast: true },
  })
}

export function useDispatchRenames(id: number | undefined) {
  return useQuery({
    queryKey: ['dispatch-renames', id],
    queryFn: () => dispatchesApi.getRenames(id!),
    enabled: !!id,
    meta: { skipGlobalErrorToast: true },
  })
}

function useRenameInvalidate(id: number) {
  const qc = useQueryClient()
  return () => {
    for (const k of ['rename-candidates', 'dispatch-renames', 'dispatch-diff', 'dispatch']) {
      qc.invalidateQueries({ queryKey: [k, id] })
    }
    // a pair / undo also changes what other pages show (final review): MO BOM
    // compare + drawing notice ('mo'), WO version status / Visual ('wo'),
    // carried paint ('paint-config', 'mbom') and progress ('project-progress')
    for (const k of ['mo', 'wo', 'paint-config', 'mbom', 'project-progress']) {
      qc.invalidateQueries({ queryKey: [k] })
    }
  }
}

export function useSaveRenames(id: number) {
  const invalidate = useRenameInvalidate(id)
  return useMutation({
    mutationFn: (renames: RenamePairInput[]) => dispatchesApi.saveRenames(id, renames),
    onSuccess: invalidate,
  })
}

export function useUndoRename(id: number) {
  const invalidate = useRenameInvalidate(id)
  return useMutation({
    mutationFn: (renameId: number) => dispatchesApi.undoRename(id, renameId),
    onSuccess: invalidate,
  })
}

function useUploadBom() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      formData,
      onProgress,
    }: {
      formData: FormData
      onProgress?: (pct: number) => void
    }) => dispatchesApi.upload(formData, onProgress),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dispatches'] }),
  })
}

function usePreviewBomUpload() {
  return useMutation({
    mutationFn: (formData: FormData) => dispatchesApi.previewUpload(formData),
  })
}

function buildPreviewFormData(formData: FormData): FormData {
  const preview = new FormData()
  // the review compares with the zone's current BOM, using NC-merged parts (2026-10-26)
  for (const k of ['project_id', 'zone_id', 'sub_zone_id', 'upload_mode']) {
    const v = formData.get(k)
    if (v != null) preview.append(k, v)
  }
  for (const k of ['bom_files', 'doc_types', 'nc_files']) for (const v of formData.getAll(k)) preview.append(k, v)
  return preview
}

/** preview → (junction mismatch?) → (Rev review?) → upload with the confirmed revs. */
export function useUploadBomWithPreview() {
  const uploadMutation = useUploadBom()
  const previewMutation = usePreviewBomUpload()
  const [pendingMismatch, setPendingMismatch] = useState<UploadPreviewDto | null>(null)
  const [pendingReview, setPendingReview] = useState<RevReviewDto | null>(null)
  const pending = useRef<{ formData: FormData; onProgress?: (pct: number) => void; review: RevReviewDto } | null>(null)

  function clear() {
    pending.current = null
    setPendingMismatch(null)
    setPendingReview(null)
  }

  async function save(revs: RevEdit[]) {
    const p = pending.current!
    const fd = new FormData()
    for (const [k, v] of p.formData.entries()) fd.append(k, v)
    fd.append('revs', JSON.stringify(revs))
    fd.append('base_dispatch_id', p.review.base_dispatch_id == null ? 'null' : String(p.review.base_dispatch_id))
    const res = await uploadMutation.mutateAsync({ formData: fd, onProgress: p.onProgress })
    clear() // after success only — a failed save keeps the review open to retry or cancel
    return res
  }

  function next() {
    const review = pending.current!.review
    if (review.rows.length > 0 || review.dn_only_marks.length > 0) {
      setPendingReview(review)
      return null
    }
    return save([])
  }

  async function submit(formData: FormData, onProgress?: (pct: number) => void) {
    const result = await previewMutation.mutateAsync(buildPreviewFormData(formData))
    pending.current = { formData, onProgress, review: result.review }
    setPendingReview(null)
    if (result.unmatchedAssemblyMarks.length + result.unmatchedPartMarks.length > 0) {
      setPendingMismatch(result)
      return null
    }
    setPendingMismatch(null)
    return next()
  }

  async function confirm() {
    if (!pending.current) return null
    setPendingMismatch(null)
    return next()
  }

  async function confirmReview(revs: RevEdit[]) {
    if (!pending.current) return null
    return save(revs)
  }

  return { submit, confirm, confirmReview, cancel: clear, pendingMismatch, pendingReview, isPreviewing: previewMutation.isPending, uploadMutation }
}
