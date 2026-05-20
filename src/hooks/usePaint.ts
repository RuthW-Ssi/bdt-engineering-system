import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { paintApi } from '../api/paint'
import type { PaintType, SavePaintConfigPayload } from '../api/paint'

export function usePaintConfig(dispatchId: number | undefined) {
  return useQuery({
    queryKey: ['paint-config', dispatchId],
    queryFn: () => paintApi.getConfig(dispatchId!),
    enabled: !!dispatchId,
  })
}

export function useMbom(dispatchId: number | undefined, enabled = true) {
  return useQuery({
    queryKey: ['mbom', dispatchId],
    queryFn: () => paintApi.getMbom(dispatchId!),
    enabled: !!dispatchId && enabled,
  })
}

export function usePaintMaterials(paintType?: PaintType) {
  return useQuery({
    queryKey: ['paint-materials', paintType ?? 'all'],
    queryFn: () => paintApi.getPaintMaterials(paintType),
    staleTime: 5 * 60_000,
  })
}

export function useSavePaintConfig(dispatchId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: SavePaintConfigPayload) => paintApi.saveConfig(dispatchId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mbom', dispatchId] })
      qc.invalidateQueries({ queryKey: ['paint-config', dispatchId] })
    },
  })
}
