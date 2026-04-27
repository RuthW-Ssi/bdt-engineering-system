import { useQuery } from '@tanstack/react-query'
import { masterDataApi } from '../api/master-data'

export function useUoms() {
  return useQuery({
    queryKey: ['uoms'],
    queryFn: () => masterDataApi.getUoms(),
    staleTime: 10 * 60 * 1000, // 10 min
  })
}

export function useCategories() {
  return useQuery({
    queryKey: ['product-categories'],
    queryFn: () => masterDataApi.getCategories(),
    staleTime: 10 * 60 * 1000,
  })
}
