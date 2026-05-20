import { apiClient } from './client'
import type { ProductSpecPreset } from './paint'

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
  fillet_mm: number | null
  sides: number | null
  weld_layers: number | null
}

export interface WeldingConfigPartDto {
  part_id: number
  part_mark: string
  profile: string | null
  part_type: WeldingPartType
  length_mm: number | null
  material_id: number | null
}

export interface WeldingConfigResponseDto {
  dispatch_id: number
  assemblies: WeldingConfigAssemblyDto[]
  parts: WeldingConfigPartDto[]
  available_presets: ProductSpecPreset[]
}

export interface WeldingSpecValues {
  fillet_mm: number | null
  sides: number | null
  weld_layers: number | null
}

export interface SaveWeldingConfigPayload {
  configs: ({ assembly_id: number; material_id: number | null } & WeldingSpecValues)[]
}

export interface SaveWirePartConfigPayload {
  configs: { part_id: number; material_id: number | null }[]
}

export interface WeldingAssemblyBreakdownDto {
  assembly_id: number
  assembly_mark: string
  asm_qty: number
  fillet_mm: number
  sides: number
  weld_layers: number
  rate_kg_per_m: number
}

export interface WeldingMbomItemDto {
  material_id: number
  material_name: string
  default_code: string
  uom: string | null
  total_path_m: number
  total_consumption_kg: number
  total_packages: number
  assembly_breakdown: WeldingAssemblyBreakdownDto[]
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
    return apiClient.get(`/dispatches/${dispatchId}/welding-config`).then(r => ({
      ...r.data,
      parts: r.data.parts ?? [],
    }))
  },

  saveConfig(dispatchId: number, payload: SaveWeldingConfigPayload): Promise<WeldingMbomSummaryDto> {
    return apiClient.post(`/dispatches/${dispatchId}/welding-config`, payload).then(r => r.data)
  },

  savePartConfig(dispatchId: number, payload: SaveWirePartConfigPayload): Promise<void> {
    return apiClient.post(`/dispatches/${dispatchId}/wire-part-config`, payload).then(() => void 0)
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
