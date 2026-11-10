import type { CuttingPlanShapeLayout, CuttingPlanShapeSize } from '../../api/cutting-plan'

// Figures for the Shape detail page (2026-11-10). Everything comes from the saved CutLogic report rows.
const n = (v: string | number | null | undefined) => Number(v ?? 0)

export function shapeSummary(sizes: Pick<CuttingPlanShapeSize, 'stocks' | 'parts' | 'parts_length_mm' | 'layouts'>[]) {
  const stockMm = sizes.reduce((t, s) => t + s.layouts.reduce((u, l) => u + n(l.stock_length_mm) * l.repeat, 0), 0)
  const partsMm = sizes.reduce((t, s) => t + n(s.parts_length_mm), 0)
  return {
    stocks: sizes.reduce((t, s) => t + s.stocks, 0),
    stockLengthM: stockMm / 1000,
    parts: sizes.reduce((t, s) => t + s.parts, 0),
    yieldPct: stockMm ? (partsMm / stockMm) * 100 : 0,
  }
}

/** "12,500 × 12 + 6,013 × 170": stock pieces per stock length, longest first. */
export function stockMix(layouts: Pick<CuttingPlanShapeLayout, 'stock_length_mm' | 'repeat'>[]): string {
  const byLen = new Map<number, number>()
  for (const l of layouts) byLen.set(n(l.stock_length_mm), (byLen.get(n(l.stock_length_mm)) ?? 0) + l.repeat)
  return [...byLen].sort((a, b) => b[0] - a[0]).map(([len, count]) => `${len.toLocaleString('en-US')} × ${count}`).join(' + ')
}

export interface BarSegment { kind: 'part' | 'kerf' | 'rest'; mark?: string; fromMm: number; toMm: number }

/** One stock piece drawn to scale: each part (count expanded) followed by a kerf, the rest at the end. */
export function barSegments(layout: Pick<CuttingPlanShapeLayout, 'stock_length_mm' | 'parts'>, kerfMm: number): BarSegment[] {
  const stock = n(layout.stock_length_mm)
  const segs: BarSegment[] = []
  let at = 0
  for (const p of layout.parts) {
    for (let i = 0; i < p.count; i++) {
      const to = Math.min(stock, at + n(p.length_mm))
      segs.push({ kind: 'part', mark: p.mark, fromMm: at, toMm: to })
      at = to
      const k = Math.min(stock, at + kerfMm)
      if (k > at) segs.push({ kind: 'kerf', fromMm: at, toMm: k })
      at = k
    }
  }
  if (segs.length && segs[segs.length - 1].kind === 'kerf' && at >= stock) segs.pop()
  if (at < stock) segs.push({ kind: 'rest', fromMm: at, toMm: stock })
  return segs
}
