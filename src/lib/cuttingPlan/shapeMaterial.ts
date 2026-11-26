// User test report 2026-11-26 (Shape tab — the production side; CP-Shape-Test has its own helpers on purpose, Tao:
// the two share nothing until Shape is stable). From a stored CutLogic plan: weight per profile (section area ×
// 7.85 g/cm³, no corner radii: a few % light on boxes and rolled shapes), and where the stock goes —
// parts + scrap (CutLogic's Rest: every piece is kept in the remnant register, Tao "เหลือเท่าไหร่เก็บเท่านั้น") +
// loss (the kerf: what is left once parts and rests are taken out).
import type { CuttingPlanShapeLayout, CuttingPlanShapeSize } from '../../api/cutting-plan'

const STEEL = 0.00785 // kg per metre per mm² of section
const nums = (s: string) => (s.match(/\d+(?:\.\d+)?/g) ?? []).map(Number)

export function shapeKgPerM(profile: string): number | null {
  const p = profile.toUpperCase().replace(/\s+/g, '').replace(/Ø/g, '')
  const n = nums(p.replace(/^[A-Z□-]+/, ''))
  let area: number | null = null
  if (/^PIPE/.test(p) && n.length >= 2) { const ro = n[0] / 2, ri = Math.max(0, ro - n[1]); area = Math.PI * (ro * ro - ri * ri) }
  else if (/^(ROD)?(RB|DB)\d/.test(p) && n.length >= 1) area = Math.PI * (n[0] / 2) ** 2
  else if (/^(SHS|RHS|BOX|□)/.test(p) && n.length >= 2) { const [h, b, t] = n.length >= 3 ? n : [n[0], n[0], n[1]]; area = h * b - Math.max(0, h - 2 * t) * Math.max(0, b - 2 * t) }
  else if (/^L\d/.test(p) && n.length >= 2) { const [a, b, t] = n.length >= 3 ? n : [n[0], n[0], n[1]]; area = t * (a + b - t) }
  else if (/^(H|WF|IH|I|C|U|CH)-?\d/.test(p) && n.length >= 3) { const [h, b, tw] = n, tf = n[3] ?? tw; area = 2 * b * tf + (h - 2 * tf) * tw }
  return area == null ? null : Math.round(area * STEEL * 1000) / 1000
}

export interface ShapeSizeBalance { stockMm: number; partsMm: number; scrapMm: number; lossMm: number; remnantPcs: number; kgPerM: number | null; stockKg: number | null; partsKg: number | null; scrapKg: number | null; lossKg: number | null }
export function shapeSizeBalance(size: Pick<CuttingPlanShapeSize, 'profile' | 'parts_length_mm'> & { layouts: Pick<CuttingPlanShapeLayout, 'stock_length_mm' | 'rest_mm' | 'repeat'>[] }): ShapeSizeBalance {
  const stockMm = size.layouts.reduce((s, l) => s + Number(l.stock_length_mm) * l.repeat, 0)
  const scrapMm = size.layouts.reduce((s, l) => s + Number(l.rest_mm) * l.repeat, 0)
  const partsMm = Number(size.parts_length_mm)
  const lossMm = Math.max(0, stockMm - partsMm - scrapMm)
  const remnantPcs = size.layouts.reduce((s, l) => s + (Number(l.rest_mm) > 0 ? l.repeat : 0), 0)
  const kgPerM = shapeKgPerM(size.profile)
  const kg = (mm: number) => (kgPerM == null ? null : (mm / 1000) * kgPerM)
  return { stockMm, partsMm, scrapMm, lossMm, remnantPcs, kgPerM, stockKg: kg(stockMm), partsKg: kg(partsMm), scrapKg: kg(scrapMm), lossKg: kg(lossMm) }
}
