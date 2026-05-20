import { apiClient } from './client'

export type PaintType = 'primer' | 'intermediate' | 'fireproof' | 'topcoat'
export const PAINT_TYPES: PaintType[] = ['primer', 'intermediate', 'fireproof', 'topcoat']

export interface PaintMaterialDto {
  id: number
  default_code: string
  name: string
  attributes: {
    material_type: string
    paint_type: PaintType
    paint_micron: number
    coverage_sqm_per_gallon: number
  }
}

export interface PaintConfigRowPayload {
  assembly_id: number
  paint_type: PaintType
  material_id: number | null
  layers: number
}

export interface SavePaintConfigPayload {
  configs: PaintConfigRowPayload[]
}

export interface PaintConfigEntryDto {
  paint_type: PaintType
  material_id: number | null
  layers: number
  material_name: string | null
}

export interface PaintConfigAssemblyDto {
  assembly_id: number
  assembly_mark: string
  name: string | null
  surface_area_m2: number | null
  assembly_qty: number
  configs: PaintConfigEntryDto[]
}

export interface ResolvedPaintLayer {
  paint_type: PaintType
  layers: number
  material_code: string
  microns?: number
  material_id: number | null
}

export interface ResolvedPaintSpec {
  layers: ResolvedPaintLayer[]
}

export interface ResolvedWeldingSpec {
  material_code: string
  fillet_mm: number
  sides: number
  weld_layers: number
  material_id: number | null
}

export interface ProductSpecPreset {
  product_id: number
  product_code: string
  product_name: string
  paint_spec: ResolvedPaintSpec | null
  welding_spec: ResolvedWeldingSpec | null
}

export interface PaintConfigResponseDto {
  dispatch_id: number
  assemblies: PaintConfigAssemblyDto[]
  available_presets: ProductSpecPreset[]
}

export interface PaintAssemblyBreakdownDto {
  assembly_id: number
  assembly_mark: string
  area_m2: number
  qty: number
  layers: number
  gallons: number
}

export interface MbomMaterialItemDto {
  material_id: number
  material_name: string
  paint_type: PaintType
  total_area_m2: number
  total_qty_gallon: number
  micron: number
  coverage_sqm_per_gallon: number
  assembly_breakdown: PaintAssemblyBreakdownDto[]
}

export interface MbomByTypeDto {
  paint_type: PaintType
  items: MbomMaterialItemDto[]
  subtotal_gallon: number
}

export interface MbomSummaryDto {
  dispatch_id: number
  computed_at: string | null
  by_paint_type: MbomByTypeDto[]
  grand_total_gallon: number
}

export const paintApi = {
  getConfig(dispatchId: number): Promise<PaintConfigResponseDto> {
    return apiClient.get(`/dispatches/${dispatchId}/paint-config`).then(r => r.data)
  },

  saveConfig(dispatchId: number, payload: SavePaintConfigPayload): Promise<MbomSummaryDto> {
    return apiClient.post(`/dispatches/${dispatchId}/paint-config`, payload).then(r => r.data)
  },

  getMbom(dispatchId: number): Promise<MbomSummaryDto> {
    return apiClient.get(`/dispatches/${dispatchId}/mbom`).then(r => r.data)
  },

  getPaintMaterials(paintType?: PaintType): Promise<PaintMaterialDto[]> {
    return apiClient
      .get('/materials', { params: { state: 'confirmed', limit: 100 } })
      .then(r =>
        (r.data.items as PaintMaterialDto[]).filter(m => {
          const attrs = m.attributes as Record<string, unknown>
          if (attrs?.['material_type'] !== 'paint') return false
          if (paintType && attrs?.['paint_type'] !== paintType) return false
          return true
        }),
      )
  },
}
