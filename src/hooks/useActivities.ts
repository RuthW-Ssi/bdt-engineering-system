import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { activitiesApi, CreateActivityPayload } from '../api/activities'

export function useActivities(params?: Parameters<typeof activitiesApi.list>[0]) {
  return useQuery({
    queryKey: ['activities', params],
    queryFn: () => activitiesApi.list(params),
  })
}

export function useActivity(id: number | undefined) {
  return useQuery({
    queryKey: ['activities', id],
    queryFn: () => activitiesApi.getOne(id!),
    enabled: id !== undefined,
  })
}

export function useCreateActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateActivityPayload) => activitiesApi.create(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['activities'] }),
  })
}

export function useUpdateActivity(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<CreateActivityPayload>) => activitiesApi.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activities'] })
    },
  })
}

export function useDeleteActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => activitiesApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['activities'] }),
  })
}
