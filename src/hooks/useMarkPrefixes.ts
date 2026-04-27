import { useQuery } from '@tanstack/react-query'
import { markPrefixApi } from '../api/mark-prefix-master'

export function useMarkPrefixes(category?: string) {
  return useQuery({
    queryKey: ['mark-prefixes', category],
    queryFn: () => markPrefixApi.list(category ? { category } : undefined),
  })
}
