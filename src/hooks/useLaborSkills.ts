import { useQuery } from '@tanstack/react-query'
import { getOperators, getTeams } from '../api/laborSkills'

export function useLaborSkills() {
  return useQuery({
    queryKey: ['operators'],
    queryFn: getOperators,
  })
}

export function useTeams() {
  return useQuery({
    queryKey: ['teams'],
    queryFn: getTeams,
  })
}
