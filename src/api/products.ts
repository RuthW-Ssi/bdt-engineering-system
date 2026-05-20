import { apiClient } from './client'
import type { ProductDTO, ProductListResponse, CreateProductPayload, PaintSpecPreset, WeldingSpecPreset } from './types'

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

  getSpec(product_code: string): Promise<{ product_code: string; name: string; default_paint_spec: PaintSpecPreset | null; default_welding_spec: WeldingSpecPreset | null }> {
    return apiClient.get(`/products/${product_code}/spec`).then(r => r.data)
  },

  updateSpec(product_code: string, payload: { default_paint_spec?: PaintSpecPreset | null; default_welding_spec?: WeldingSpecPreset | null }) {
    return apiClient.patch(`/products/${product_code}/spec`, payload).then(r => r.data)
  },
}
