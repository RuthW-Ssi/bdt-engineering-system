import { useQuery } from '@tanstack/react-query'
import { libraryApi } from '../api/library'

export function useMarkPrefixes() {
  return useQuery({
    queryKey: ['library-mark-prefixes'],
    queryFn: () => libraryApi.markPrefixes(),
  })
}
