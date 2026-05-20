import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { weldingApi } from '../api/welding'
import type { SaveWeldingConfigPayload, SaveWirePartConfigPayload } from '../api/welding'

export function useWeldingConfig(dispatchId: number | undefined) {
  return useQuery({
    queryKey: ['welding-config', dispatchId],
    queryFn: () => weldingApi.getConfig(dispatchId!),
    enabled: !!dispatchId,
  })
}

export function useWeldingMbom(dispatchId: number | undefined, enabled = true) {
  return useQuery({
    queryKey: ['welding-mbom', dispatchId],
    queryFn: () => weldingApi.getMbom(dispatchId!),
    enabled: !!dispatchId && enabled,
  })
}

export function useWireMaterials() {
  return useQuery({
    queryKey: ['wire-materials'],
    queryFn: () => weldingApi.getWireMaterials(),
    staleTime: 5 * 60_000,
  })
}

export function useSaveWeldingConfig(dispatchId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: SaveWeldingConfigPayload) => weldingApi.saveConfig(dispatchId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['welding-mbom', dispatchId] })
      qc.invalidateQueries({ queryKey: ['welding-config', dispatchId] })
    },
  })
}

export function useSaveWirePartConfig(dispatchId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: SaveWirePartConfigPayload) => weldingApi.savePartConfig(dispatchId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['welding-config', dispatchId] })
    },
  })
}
