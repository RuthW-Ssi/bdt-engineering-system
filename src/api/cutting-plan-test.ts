import { apiClient } from './client'

// CP-Shape-Test (2026-11-11): test bench, nothing is stored
export interface ShapeTestPart { mark: string; lengthMm: number; count: number }
export interface ShapeTestStock { lengthMm: number; qty: number | null } // null = unlimited
export interface ShapeTestSize { profile: string; grade: string | null; parts: ShapeTestPart[]; zone?: string } // zone: set when laid out per zone
export interface ShapeTestPartList { sizes: ShapeTestSize[]; pieces: number; warnings: string[] }
// One layout = one cutting pattern; marks = which marks its pieces are, in total over the repeats
export interface ShapeTestLayout {
  stockLengthMm: number; repeat: number; restMm: number; cuts: number
  pieces: { lengthMm: number; count: number }[]
  marks: { mark: string; lengthMm: number; pcs: number }[]
  nestMm?: number[] // saddle nesting: how much earlier each next piece starts, joint by joint
}
export interface ShapeTestResult {
  stocks: number; stockLengthMm: number; partsLengthMm: number; scrapMm: number; kerfMm: number; yieldPct: number
  nestedMm?: number // saddle nesting: BOM length that tucked into other pieces (yield already counts it)
  cuts: number; stockMix: { lengthMm: number; pieces: number }[]; layouts: ShapeTestLayout[]; method: string
  timedOut?: boolean // the server's work budget cut the search short: valid layouts, maybe not the fewest stocks
  notes?: string[] // saddle options: what was used
  tipToTip?: { stocks: number; stockLengthMm: number } // with saddle nesting: what tip to tip would take
}

export function readShapePartList(file: File): Promise<ShapeTestPartList> {
  const form = new FormData()
  form.append('file', file)
  return apiClient.post('/cutting-plan-test/shape/part-list', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data)
}

export function optimizeShapeTest(body: { kerfMm: number; parts: ShapeTestPart[]; stock: ShapeTestStock[]; project_id?: number; saddleNest?: boolean }): Promise<ShapeTestResult> {
  return apiClient.post('/cutting-plan-test/shape/optimize', body, { timeout: 120_000 }).then(r => r.data)
}

export interface ShapeBomZone { id: number; code: string; label: string; pieces: number; groups: { group: string; pieces: number }[] }

export function getShapeBomSources(projectId: number): Promise<{ zones: ShapeBomZone[] }> {
  return apiClient.get('/cutting-plan-test/shape/bom-sources', { params: { project_id: projectId } }).then(r => r.data)
}

export function readShapeBomParts(body: { project_id: number; zone_ids: number[]; groups: string[] }): Promise<ShapeTestPartList> {
  return apiClient.post('/cutting-plan-test/shape/bom-parts', body).then(r => r.data)
}

// Real pipe end cuts of a mark, from the project's IFC model (3D step 2); null = not found in the model
export interface ShapeEndCut {
  L: string; R: string; depthLMm: number; depthRMm: number; instances: number; variants: number; spreadMm: number
  grids: { LW: number[]; LN: number[]; RW: number[]; RN: number[] } // axial mm at each degree, outer (W) / inner (N) wall
}
export function getShapeEndCuts(body: { project_id: number; marks: string[] }): Promise<{ source: string | null; marks: Record<string, ShapeEndCut | null> }> {
  return apiClient.post('/cutting-plan-test/shape/end-cuts', body).then(r => r.data)
}
