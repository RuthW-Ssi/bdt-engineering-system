import { useQuery } from '@tanstack/react-query'
import { getOperators } from '../api/laborSkills'

export function useLaborSkills() {
  return useQuery({
    queryKey: ['operators'],
    queryFn: getOperators,
  })
}
