import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getCuttingPlans, getCuttingPlan, previewCuttingPlan, uploadCuttingPlan,
  bulkAssignOrderPartProjectCode, deleteCuttingPlan,
  type CuttingPlanPreviewResult, type BulkAssignOrderPartProjectCodePayload,
} from '../api/cutting-plan'

export function useCuttingPlans(params?: Parameters<typeof getCuttingPlans>[0]) {
  return useQuery({ queryKey: ['cutting-plan', 'list', params], queryFn: () => getCuttingPlans(params) })
}

export function useCuttingPlan(id: number) {
  return useQuery({ queryKey: ['cutting-plan', 'detail', id], queryFn: () => getCuttingPlan(id), enabled: !!id })
}

function usePreviewCuttingPlan() {
  return useMutation({ mutationFn: (formData: FormData) => previewCuttingPlan(formData) })
}

function useUploadCuttingPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ formData, onProgress }: { formData: FormData; onProgress?: (pct: number) => void }) =>
      uploadCuttingPlan(formData, onProgress),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cutting-plan'] }),
  })
}

// Cutting Plan always shows the parsed summary + any warnings before saving
// (unlike BOM's useUploadBomWithPreview, which only interrupts on an actual
// mismatch) — submit() always stashes the FormData and surfaces the preview.
export function useUploadCuttingPlanWithPreview() {
  const uploadMutation = useUploadCuttingPlan()
  const previewMutation = usePreviewCuttingPlan()
  const [pendingPreview, setPendingPreview] = useState<CuttingPlanPreviewResult | null>(null)
  const pendingFormDataRef = useRef<FormData | null>(null)
  const pendingOnProgressRef = useRef<((pct: number) => void) | undefined>(undefined)

  async function submit(formData: FormData, onProgress?: (pct: number) => void) {
    const result = await previewMutation.mutateAsync(formData)
    pendingFormDataRef.current = formData
    pendingOnProgressRef.current = onProgress
    setPendingPreview(result)
    return result
  }

  async function confirm() {
    const formData = pendingFormDataRef.current
    if (!formData) return null
    const onProgress = pendingOnProgressRef.current
    setPendingPreview(null)
    pendingFormDataRef.current = null
    pendingOnProgressRef.current = undefined
    return uploadMutation.mutateAsync({ formData, onProgress })
  }

  function cancel() {
    setPendingPreview(null)
    pendingFormDataRef.current = null
    pendingOnProgressRef.current = undefined
  }

  return {
    submit,
    confirm,
    cancel,
    pendingPreview,
    isPreviewing: previewMutation.isPending,
    uploadMutation,
  }
}

export function useBulkAssignOrderPartProjectCode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: BulkAssignOrderPartProjectCodePayload) => bulkAssignOrderPartProjectCode(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cutting-plan'] }),
  })
}

export function useDeleteCuttingPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteCuttingPlan(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cutting-plan'] }),
  })
}
