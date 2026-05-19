import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { productDerivationApi } from '../api/productDerivation'
import type { VariantAttributes } from '../api/productDerivation'

export function useReviewQueue(dispatchId: number | undefined) {
  return useQuery({
    queryKey: ['review-queue', dispatchId],
    queryFn: () => productDerivationApi.getReviewQueue(dispatchId!),
    enabled: !!dispatchId,
  })
}

export function useConfirmAssembly(dispatchId: number | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (assemblyId: number) => productDerivationApi.confirmAssembly(assemblyId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['review-queue', dispatchId] })
    },
  })
}

export function usePatchVariantAttrs(dispatchId: number | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ productId, attrs }: { productId: number; attrs: VariantAttributes }) =>
      productDerivationApi.patchVariantAttrs(productId, attrs),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['review-queue', dispatchId] })
    },
  })
}
