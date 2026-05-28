import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { productsApi } from '../api/products'
import type { CreateProductPayload } from '../api/types'

export function useProducts(params?: Parameters<typeof productsApi.list>[0], enabled = true) {
  return useQuery({
    queryKey: ['products', params],
    queryFn: () => productsApi.list(params),
    enabled,
  })
}

export function useProduct(product_code: string) {
  return useQuery({
    queryKey: ['product', product_code],
    queryFn: () => productsApi.get(product_code),
    enabled: !!product_code,
  })
}

export function useCreateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateProductPayload) => productsApi.create(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })
}

export function useProductAction(product_code: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (action: string) => productsApi.doAction(product_code, action),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['product', product_code] })
    },
  })
}

export function useProductMessages(product_code: string) {
  return useQuery({
    queryKey: ['product-messages', product_code],
    queryFn: () => productsApi.getMessages(product_code),
    enabled: !!product_code,
  })
}

export function useUpdateProductSpec(product_code: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Parameters<typeof productsApi.updateSpec>[1]) =>
      productsApi.updateSpec(product_code, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product', product_code] })
    },
  })
}
