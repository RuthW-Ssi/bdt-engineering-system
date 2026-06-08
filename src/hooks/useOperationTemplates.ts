import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { operationTemplatesApi } from '../api/operationTemplates'

export function useOperationTemplate(id: number | null, staleCheck = false) {
  return useQuery({
    queryKey: ['op-template-detail', id, staleCheck],
    queryFn:  () => operationTemplatesApi.getOne(id!, staleCheck),
    enabled:  id !== null,
  })
}

export function useAddFromLibrary(templateId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (activityId: number) =>
      operationTemplatesApi.addFromLibrary(templateId, activityId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['op-template-detail', templateId] })
    },
  })
}

export function useUpdateFromLibrary(templateId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (opActId: number) =>
      operationTemplatesApi.updateFromLibrary(templateId, opActId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['op-template-detail', templateId] })
    },
  })
}
