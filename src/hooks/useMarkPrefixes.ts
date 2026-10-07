import { useQuery } from '@tanstack/react-query'
import { libraryApi } from '../api/library'

export function useMarkPrefixes() {
  return useQuery({
    queryKey: ['library-mark-prefixes'],
    queryFn: () => libraryApi.markPrefixes(),
  })
}

/** Active mark_prefix_master registry — for binding routing templates to a prefix. */
export function useMarkPrefixMaster() {
  return useQuery({
    queryKey: ['mark-prefix-master', 'active'],
    queryFn: () => libraryApi.markPrefixMaster(),
  })
}
