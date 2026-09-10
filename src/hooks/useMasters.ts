import { useQuery } from '@tanstack/react-query'
import { masterDataApi } from '../api/master-data'
import { materialsApi } from '../api/materials'

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

export function useMaterialsByPrefix(prefix5: string) {
  const { data: categories = [] } = useCategories()
  const categ = categories.find(c => c.prefix_5 === prefix5)
  return useQuery({
    queryKey: ['materials-by-prefix', prefix5, categ?.id],
    queryFn: () => materialsApi.list({ categ_id: categ!.id, state: 'confirmed', limit: 100 }).then(r => r.items),
    enabled: !!categ,
    staleTime: 10 * 60 * 1000,
  })
}
