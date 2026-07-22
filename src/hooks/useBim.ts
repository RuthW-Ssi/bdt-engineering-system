import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listBimModels, uploadBimModel, getBimStatus, getBimElements, getBimElementProperties, getBimViewerToken, retryBimModel, getLatestBimVersion,
} from '../api/bim'
import type { BimModelFilter, UploadBimModelPayload } from '../api/bim'

export function useBimModels(filter?: BimModelFilter) {
  return useQuery({ queryKey: ['bim-models', 'list', filter], queryFn: () => listBimModels(filter) })
}

// Mirrors useBomDispatches' useLatestRevision, scoped by project only — BIM
// models are uploaded at the whole-project level (confirmed 2026-07-21).
// Gates the upload flow's minor/major version choice.
export function useLatestBimVersion(projectId: number | undefined) {
  return useQuery({
    queryKey: ['bim-models', 'latest-version', projectId],
    queryFn: () => getLatestBimVersion(projectId!),
    enabled: projectId != null,
  })
}

export function useUploadBimModel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ onProgress, ...payload }: UploadBimModelPayload & { onProgress?: (pct: number) => void }) =>
      uploadBimModel(payload, onProgress),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bim-models'] }),
    meta: { showGlobalErrorToast: true },
  })
}

// Polls while translation is still running; stops once complete/failed so we
// don't keep hitting Autodesk's manifest endpoint after we have an answer.
export function useBimStatus(id: number | null) {
  return useQuery({
    queryKey: ['bim-models', 'status', id],
    queryFn: () => getBimStatus(id!),
    enabled: id != null,
    refetchInterval: query => {
      const status = query.state.data?.status
      return status === 'processing' || status === 'pending' || status === 'extracting' ? 2500 : false
    },
    meta: { skipGlobalErrorToast: true },
  })
}

export function useRetryBimModel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => retryBimModel(id),
    onSuccess: (_data, id) => qc.invalidateQueries({ queryKey: ['bim-models', 'status', id] }),
    meta: { showGlobalErrorToast: true },
  })
}

export function useBimElements(id: number | null) {
  return useQuery({
    queryKey: ['bim-models', 'elements', id],
    queryFn: () => getBimElements(id!),
    enabled: id != null,
  })
}

// Raw property groups for one element, fetched only once it's selected in
// the property panel — the list above deliberately excludes these (see
// getBimElements' doc comment).
export function useBimElementProperties(modelId: number | null, elementId: number | null) {
  return useQuery({
    queryKey: ['bim-models', 'element-properties', modelId, elementId],
    queryFn: () => getBimElementProperties(modelId!, elementId!),
    enabled: modelId != null && elementId != null,
  })
}

export function useBimViewerToken(id: number | null) {
  return useQuery({
    queryKey: ['bim-models', 'viewer-token', id],
    queryFn: () => getBimViewerToken(id!),
    enabled: id != null,
    staleTime: 50 * 60 * 1000, // APS 2-legged tokens are valid ~1h
  })
}
