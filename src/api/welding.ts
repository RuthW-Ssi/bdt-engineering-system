import { apiClient } from './client'

export type WeldingPartType = 'TA-w' | 'TA-f' | 'TA-m' | 'TA-p' | 'unknown'

export interface WireMaterialDto {
  id: number
  default_code: string
  name: string
  attributes: {
    material_type: 'welding_wire'
    wire_diameter_mm: number
    kg_per_meter: number
    pkg_kg: number
  }
}

export interface WeldingConfigAssemblyDto {
  assembly_id: number
  assembly_mark: string
  material_id: number | null
  material_name: string | null
}

export interface WeldingConfigResponseDto {
  dispatch_id: number
  assemblies: WeldingConfigAssemblyDto[]
}

export interface SaveWeldingConfigPayload {
  configs: { assembly_id: number; material_id: number | null }[]
}

export interface WeldingMbomItemDto {
  material_id: number
  material_name: string
  default_code: string
  uom: string | null
  total_path_m: number
  total_consumption_kg: number
  total_packages: number
}

export interface WeldingMbomSummaryDto {
  dispatch_id: number
  computed_at: string | null
  items: WeldingMbomItemDto[]
  grand_total_consumption_kg: number
  grand_total_packages: number
}

export const weldingApi = {
  getConfig(dispatchId: number): Promise<WeldingConfigResponseDto> {
    return apiClient.get(`/dispatches/${dispatchId}/welding-config`).then(r => r.data)
  },

  saveConfig(dispatchId: number, payload: SaveWeldingConfigPayload): Promise<WeldingMbomSummaryDto> {
    return apiClient.post(`/dispatches/${dispatchId}/welding-config`, payload).then(r => r.data)
  },

  getMbom(dispatchId: number): Promise<WeldingMbomSummaryDto> {
    return apiClient.get(`/dispatches/${dispatchId}/welding-mbom`).then(r => r.data)
  },

  getWireMaterials(): Promise<WireMaterialDto[]> {
    return apiClient
      .get('/materials', { params: { state: 'confirmed', limit: 50 } })
      .then(r =>
        (r.data.items as WireMaterialDto[]).filter(
          m => (m.attributes as Record<string, unknown>)?.['material_type'] === 'welding_wire',
        ),
      )
  },
}
