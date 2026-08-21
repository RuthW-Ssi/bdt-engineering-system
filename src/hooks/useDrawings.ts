import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getDrawingsByProduct, uploadDrawing, deleteDrawing } from '../api/drawings'

export function useProductDrawings(productId: number | undefined) {
  return useQuery({
    queryKey: ['drawings', productId],
    queryFn: () => getDrawingsByProduct(productId!),
    enabled: productId != null,
  })
}

export function useUploadDrawing(productId: number | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => uploadDrawing(productId!, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drawings', productId] }),
  })
}

export function useDeleteDrawing(productId: number | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteDrawing(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drawings', productId] }),
  })
}
