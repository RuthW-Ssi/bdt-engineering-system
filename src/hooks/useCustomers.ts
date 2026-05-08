import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  type CreateCustomerPayload,
} from '../api/customers'

export function useCustomers(params?: Parameters<typeof getCustomers>[0]) {
  return useQuery({
    queryKey: ['customers', params],
    queryFn: () => getCustomers(params),
  })
}

export function useCreateCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateCustomerPayload) => createCustomer(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  })
}

export function useUpdateCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<CreateCustomerPayload> }) =>
      updateCustomer(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  })
}

export function useDeleteCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteCustomer(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  })
}
