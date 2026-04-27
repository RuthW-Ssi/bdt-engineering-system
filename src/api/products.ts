import { apiClient } from './client'
import type { ProductDTO, ProductListResponse, CreateProductPayload } from './types'

export const productsApi = {
  list(params?: {
    product_type?: string
    state?: string
    categ_id?: number
    project_id?: number
    q?: string
    page?: number
    limit?: number
  }): Promise<ProductListResponse> {
    return apiClient.get('/products', { params }).then(r => r.data)
  },

  get(product_code: string): Promise<ProductDTO> {
    return apiClient.get(`/products/${product_code}`).then(r => r.data)
  },

  create(payload: CreateProductPayload): Promise<ProductDTO> {
    return apiClient.post('/products', payload).then(r => r.data)
  },

  update(product_code: string, payload: Record<string, unknown>): Promise<ProductDTO> {
    return apiClient.patch(`/products/${product_code}`, payload).then(r => r.data)
  },

  doAction(product_code: string, action: string): Promise<ProductDTO> {
    return apiClient.post(`/products/${product_code}/${action}`).then(r => r.data)
  },

  getMessages(product_code: string) {
    return apiClient.get(`/products/${product_code}/messages`).then(r => r.data)
  },
}
