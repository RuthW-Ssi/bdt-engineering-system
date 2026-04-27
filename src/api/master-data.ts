import { apiClient } from './client'
import type { UomDTO, CategoryDTO } from './types'

export const masterDataApi = {
  getUoms(): Promise<UomDTO[]> {
    return apiClient.get('/uoms').then(r => r.data)
  },

  getCategories(): Promise<CategoryDTO[]> {
    return apiClient.get('/product-categories').then(r => r.data)
  },
}
