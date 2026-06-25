import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { materialsApi } from '../api/materials'
import type { CreateMaterialPayload } from '../api/types'

export function useMaterials(params?: Parameters<typeof materialsApi.list>[0]) {
  return useQuery({
    queryKey: ['materials', params],
    queryFn: () => materialsApi.list(params),
  })
}

export function useMaterial(default_code: string) {
  return useQuery({
    queryKey: ['material', default_code],
    queryFn: () => materialsApi.get(default_code),
    enabled: !!default_code,
  })
}

export function useCreateMaterial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateMaterialPayload) => materialsApi.create(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['materials'] }),
  })
}

export function useUpdateMaterial(default_code: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<CreateMaterialPayload>) => materialsApi.update(default_code, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['materials'] })
      qc.invalidateQueries({ queryKey: ['material', default_code] })
    },
  })
}

export function useActionSubmit(default_code: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => materialsApi.actionSubmit(default_code),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['materials'] })
      qc.invalidateQueries({ queryKey: ['material', default_code] })
    },
  })
}

export function useMaterialAction(default_code: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (action: string) => materialsApi.doAction(default_code, action),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['materials'] })
      qc.invalidateQueries({ queryKey: ['material', default_code] })
      qc.invalidateQueries({ queryKey: ['material-messages', default_code] })
    },
  })
}

export function useMaterialMessages(default_code: string) {
  return useQuery({
    queryKey: ['material-messages', default_code],
    queryFn: () => materialsApi.getMessages(default_code),
    enabled: !!default_code,
  })
}
