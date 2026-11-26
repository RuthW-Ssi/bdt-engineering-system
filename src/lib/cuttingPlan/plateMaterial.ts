// User test report 2026-11-26 (Plate tab, production — CP-Shape-Test has its own code): kerf loss and value.
// Loss = the plate's cut length (its DXF CUT path) × the kerf set for its cutting technology and thickness ×
// thickness × 7.85 g/cm³; it is carved out of the scrap (gross − net of the nested area). Value = weight × the price
// per kg Materials has for the grade and thickness, read when shown so price edits flow through.
import type { CuttingPlanKerf, CuttingPlanNestingRow, CuttingPlanPrice } from '../../api/cutting-plan'

export const STEEL_KG_PER_MM3 = 7.85e-6
const n = (v: unknown) => (v == null || v === '' ? null : Number(v))

export function kerfFor(kerfs: Pick<CuttingPlanKerf, 'technology' | 'thick_mm' | 'kerf_mm'>[] | undefined, r: Pick<CuttingPlanNestingRow, 'technology' | 'thick_mm'>): number | null {
  const k = (kerfs ?? []).find(x => x.technology === r.technology && Number(x.thick_mm) === Number(r.thick_mm))
  return k ? Number(k.kerf_mm) : null
}

export function priceFor(prices: CuttingPlanPrice[] | undefined, grade: string | null | undefined, thick: number | string | null | undefined): number | null {
  const g = grade?.trim().toUpperCase()
  if (!g || thick == null) return null
  return (prices ?? []).find(p => p.grade === g && p.thick_mm === Number(thick))?.thb_per_kg ?? null
}

export function plateLossKg(r: Pick<CuttingPlanNestingRow, 'thick_mm' | 'cut_length_mm'>, kerfMm: number | null): number | null {
  const cut = n(r.cut_length_mm), t = n(r.thick_mm)
  if (kerfMm == null || cut == null || t == null) return null
  return cut * kerfMm * t * STEEL_KG_PER_MM3
}

export const thb = (v: number) => `฿${v.toLocaleString('en', { maximumFractionDigits: 0 })}`
