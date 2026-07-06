import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { dispatchesApi } from '../api/dispatches'
import type { MatchStatus, PreviewJunctionsResult } from '../api/dispatches'

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

export function useDispatchHistory(id: number | undefined) {
  return useQuery({
    queryKey: ['dispatch-history', id],
    queryFn: () => dispatchesApi.getHistory(id!),
    enabled: !!id,
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

export function useDispatchMapping(id: number | undefined) {
  return useQuery({
    queryKey: ['dispatch-mapping', id],
    queryFn: () => dispatchesApi.getMapping(id!),
    enabled: !!id,
    staleTime: 60_000,
  })
}

export function useSaveAssemblyMatch(dispatchId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (assignments: { assembly_id: number; match_status: MatchStatus | null; product_id?: number | null }[]) =>
      dispatchesApi.saveAssemblyMatch(dispatchId, assignments),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dispatch', dispatchId] }),
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

export function useLatestRevision(projectId: number | undefined, zoneId: number | undefined, subZoneId: number | null | undefined) {
  return useQuery({
    queryKey: ['latest-revision', projectId, zoneId, subZoneId],
    queryFn: () => dispatchesApi.getLatestRevision(projectId!, zoneId!, subZoneId ?? null),
    enabled: !!projectId && !!zoneId,
  })
}

export function useUploadBom() {
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

export function usePreviewBomJunctions() {
  return useMutation({
    mutationFn: (formData: FormData) => dispatchesApi.previewUpload(formData),
  })
}

function buildPreviewFormData(formData: FormData): FormData {
  const preview = new FormData()
  for (const file of formData.getAll('bom_files')) preview.append('bom_files', file)
  for (const docType of formData.getAll('doc_types')) preview.append('doc_types', docType)
  const uploadMode = formData.get('upload_mode')
  if (uploadMode != null) preview.append('upload_mode', uploadMode)
  return preview
}

export function useUploadBomWithPreview() {
  const uploadMutation = useUploadBom()
  const previewMutation = usePreviewBomJunctions()
  const [pendingMismatch, setPendingMismatch] = useState<PreviewJunctionsResult | null>(null)
  const pendingFormDataRef = useRef<FormData | null>(null)
  const pendingOnProgressRef = useRef<((pct: number) => void) | undefined>(undefined)

  async function submit(formData: FormData, onProgress?: (pct: number) => void) {
    const result = await previewMutation.mutateAsync(buildPreviewFormData(formData))
    const hasMismatch = result.unmatchedAssemblyMarks.length + result.unmatchedPartMarks.length > 0
    if (hasMismatch) {
      pendingFormDataRef.current = formData
      pendingOnProgressRef.current = onProgress
      setPendingMismatch(result)
      return null
    }
    return uploadMutation.mutateAsync({ formData, onProgress })
  }

  async function confirm() {
    const formData = pendingFormDataRef.current
    if (!formData) return null
    setPendingMismatch(null)
    return uploadMutation.mutateAsync({ formData, onProgress: pendingOnProgressRef.current })
  }

  function cancel() {
    setPendingMismatch(null)
    pendingFormDataRef.current = null
  }

  return {
    submit,
    confirm,
    cancel,
    pendingMismatch,
    isPreviewing: previewMutation.isPending,
    uploadMutation,
  }
}
