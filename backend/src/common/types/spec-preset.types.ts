export type PaintType = 'primer' | 'intermediate' | 'fireproof' | 'topcoat'

// Raw spec stored on products (material_code only — no DB id)
export interface PaintLayerPreset {
  paint_type: PaintType
  layers: number
  material_code: string
  microns?: number
}

export interface PaintSpecPreset {
  layers: PaintLayerPreset[]
}

export interface WeldingSpecPreset {
  material_code: string
  fillet_mm: number
  sides: number
  weld_layers: number
}

// Resolved spec returned by mBOM config GET (material_id resolved for direct use in save)
export interface ResolvedPaintLayer extends PaintLayerPreset {
  material_id: number | null
}

export interface ResolvedPaintSpec {
  layers: ResolvedPaintLayer[]
}

export interface ResolvedWeldingSpec extends WeldingSpecPreset {
  material_id: number | null
}

export interface ProductSpecPreset {
  product_id: number
  product_code: string
  product_name: string
  paint_spec: ResolvedPaintSpec | null
  welding_spec: ResolvedWeldingSpec | null
}
