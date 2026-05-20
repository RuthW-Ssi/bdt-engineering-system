import { apiClient } from './client'

export interface VariantAttributes {
  shape: string
  method: string
  profile?: string
  grade?: string
  height_mm?: number
  width_mm?: number
  web_thickness_mm?: number
  flange_thickness_mm?: number
  thickness_mm?: number
  diameter_mm?: number
  outer_diameter_mm?: number
  leg_a_mm?: number
  leg_b_mm?: number
}

export interface ReviewQueueItem {
  assembly_id: number
  assembly_mark: string
  match_status: string
  product_id: number
  product_code: string
  derived_attrs: VariantAttributes
  derivation_flags: string[]
  confidence: 'medium' | 'low'
}

export interface DeriveSummary {
  high: number
  medium: number
  low: number
  total: number
}

export const productDerivationApi = {
  getReviewQueue: (dispatchId: number) =>
    apiClient.get<ReviewQueueItem[]>(`/dispatches/${dispatchId}/review-queue`).then(r => r.data),

  deriveForDispatch: (dispatchId: number) =>
    apiClient.post<DeriveSummary>(`/dispatches/${dispatchId}/derive`).then(r => r.data),

  confirmAssembly: (assemblyId: number) =>
    apiClient.post(`/assemblies/${assemblyId}/confirm`),

  patchVariantAttrs: (productId: number, attrs: VariantAttributes) =>
    apiClient.patch(`/products/${productId}/variant-attributes`, attrs),
}
