import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { projectsApi } from '../api/projects'
import type { CreateProjectPayload } from '../api/projects'

export function useProjects(params?: Parameters<typeof projectsApi.list>[0]) {
  return useQuery({
    queryKey: ['projects', params],
    queryFn: () => projectsApi.list(params),
  })
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateProjectPayload) => projectsApi.create(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
    meta: { showGlobalErrorToast: true },
  })
}
