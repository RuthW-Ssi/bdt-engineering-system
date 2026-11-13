import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getCuttingPlans, getCuttingPlan, getPlateView, previewCuttingPlan, saveCuttingPlan, getStagingUrls, putStagedFile,
  previewShapeCuttingPlan, saveShapeCuttingPlan,
  bulkAssignOrderPartProjectCode, deleteCuttingPlan,
  type CuttingPlanPreviewResult, type BulkAssignOrderPartProjectCodePayload, type SaveCuttingPlanPayload, type CuttingPlanDetail,
} from '../api/cutting-plan'

export function useCuttingPlans(params?: Parameters<typeof getCuttingPlans>[0]) {
  return useQuery({ queryKey: ['cutting-plan', 'list', params], queryFn: () => getCuttingPlans(params) })
}

export function useCuttingPlan(id: number) {
  return useQuery({ queryKey: ['cutting-plan', 'detail', id], queryFn: () => getCuttingPlan(id), enabled: !!id })
}

export function usePlateView(id: number, plate: string | null) {
  return useQuery({ queryKey: ['cutting-plan', 'plate-view', id, plate], queryFn: () => getPlateView(id, plate!), enabled: !!id && !!plate, staleTime: Infinity })
}

function usePreviewCuttingPlan() {
  return useMutation({ mutationFn: (formData: FormData) => previewCuttingPlan(formData) })
}

export interface CuttingPlanUploadInput {
  previewForm: FormData // .txt files + fields + file_names
  files: File[] // all four files of every plate
  fields: Omit<SaveCuttingPlanPayload, 'staged'>
}

// Save = one call for all staging URLs, put every file into storage, then post the keys.
// Straight-to-GCS PUTs are not API calls, so 8 run at once. With the local dev driver each
// "PUT" is an API call, so it is paced under the API's 600/min limit instead.
async function stageAndSave(
  input: CuttingPlanUploadInput, save: (p: SaveCuttingPlanPayload) => Promise<CuttingPlanDetail>, onProgress?: (pct: number) => void,
) {
  const urls = await getStagingUrls(input.fields.project_id, input.files.map(f => f.name))
  const byName = new Map(input.files.map(f => [f.name, f]))
  const viaApi = urls[0]?.method === 'POST'
  let done = 0, next = 0
  const worker = async () => {
    while (next < urls.length) {
      const u = urls[next++]
      const started = Date.now()
      await putStagedFile(u, byName.get(u.file_name)!)
      onProgress?.(Math.round((++done / urls.length) * 95))
      if (viaApi) await new Promise(r => setTimeout(r, Math.max(0, 1000 - (Date.now() - started)))) // ≤ 1/s per worker → 8 workers ≈ 480/min
    }
  }
  await Promise.all(Array.from({ length: Math.min(8, urls.length) }, worker))
  const saved = await save({ ...input.fields, staged: urls.map(u => ({ upload_key: u.upload_key, file_name: u.file_name })) })
  onProgress?.(100)
  return saved
}

function useSaveCuttingPlan(save: (p: SaveCuttingPlanPayload) => Promise<CuttingPlanDetail> = saveCuttingPlan) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ input, onProgress }: { input: CuttingPlanUploadInput; onProgress?: (pct: number) => void }) => stageAndSave(input, save, onProgress),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cutting-plan'] }),
  })
}

// Shape (2026-11-10): same staged save, CutLogic CP PDFs only; preview reads the PDFs on the server.
export function useUploadShapeWithPreview() {
  const uploadMutation = useSaveCuttingPlan(saveShapeCuttingPlan)
  const previewMutation = useMutation({ mutationFn: (formData: FormData) => previewShapeCuttingPlan(formData) })
  return { preview: previewMutation, upload: uploadMutation }
}

// Cutting Plan always shows the parsed summary + any problems before saving.
// submit() previews (only the .txt files travel); confirm() stores all files and saves.
export function useUploadCuttingPlanWithPreview() {
  const uploadMutation = useSaveCuttingPlan()
  const previewMutation = usePreviewCuttingPlan()
  const [pendingPreview, setPendingPreview] = useState<CuttingPlanPreviewResult | null>(null)
  const pendingRef = useRef<CuttingPlanUploadInput | null>(null)
  const pendingOnProgressRef = useRef<((pct: number) => void) | undefined>(undefined)

  async function submit(input: CuttingPlanUploadInput, onProgress?: (pct: number) => void) {
    const result = await previewMutation.mutateAsync(input.previewForm)
    pendingRef.current = input
    pendingOnProgressRef.current = onProgress
    setPendingPreview(result)
    return result
  }

  async function confirm() {
    const input = pendingRef.current
    if (!input) return null
    const onProgress = pendingOnProgressRef.current
    setPendingPreview(null)
    pendingRef.current = null
    pendingOnProgressRef.current = undefined
    return uploadMutation.mutateAsync({ input, onProgress })
  }

  function cancel() {
    setPendingPreview(null)
    pendingRef.current = null
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
