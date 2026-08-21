import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
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
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to upload drawing — please try again'),
  })
}

export function useDeleteDrawing(productId: number | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteDrawing(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drawings', productId] }),
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to delete drawing — please try again'),
  })
}
