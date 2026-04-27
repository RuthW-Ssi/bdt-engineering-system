import { useQuery } from '@tanstack/react-query'
import { projectsApi } from '../api/projects'

export function useProjects(params?: Parameters<typeof projectsApi.list>[0]) {
  return useQuery({
    queryKey: ['projects', params],
    queryFn: () => projectsApi.list(params),
  })
}
