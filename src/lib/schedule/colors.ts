// Op-family colours, family order and legend for the Production Schedule page
// (tokens exactly as backend-schedule/docs/prod-scheduler-mockup.html +
// cockpit/sched-design-system.css).

export type OpFamily = 'cut' | 'fit' | 'weld' | 'blast' | 'paint' | 'assy' | 'mach'

export const FAMILY_COLOR: Record<OpFamily, string> = {
  cut: '#2f6f9f',
  fit: '#2a9d8f',
  weld: '#e8731a',
  blast: '#7a828c',
  paint: '#3a9d5d',
  assy: '#6f5bd0',
  mach: '#9c7b4a',
}

export const LATE_COLOR = { fill: 'rgba(220,38,38,.16)', border: '#dc2626', ink: '#b91c1c' } as const

/** Non-family tokens the page needs (mockup :root). */
export const UI_COLOR = {
  accent: '#e8590c',
  accent2: '#fd7e14',
  green: '#1f9d57',
  ink: '#1f2733',
  muted: '#6b7682',
  line: '#d8dde3',
  /** Due diamond / order-list dot of an on-time MO. */
  neutralDot: '#9aa3ad',
} as const

/** Full legend, in toolbar order. Late is drawn separately (fill + red outline). */
export const LEGEND: ReadonlyArray<{ family: OpFamily; label: string }> = [
  { family: 'cut', label: 'ตัด' },
  { family: 'mach', label: 'แปรรูป/อื่นๆ' },
  { family: 'fit', label: 'ประกอบ' },
  { family: 'weld', label: 'เชื่อม' },
  { family: 'blast', label: 'พ่นทราย' },
  { family: 'paint', label: 'พ่นสี' },
  { family: 'assy', label: 'ประกอบรวม' },
]
export const LATE_LABEL = 'งานสาย'

/** Family of a work center code. */
export function wcColor(code: string | null | undefined): OpFamily {
  const c = (code || '').toUpperCase()
  if (c.includes('PAINT')) return 'paint'
  if (c.includes('BLAST') || c.includes('SURFACE')) return 'blast'
  if (c.includes('FIT')) return 'fit'
  if (c.includes('WELD')) return 'weld'
  if (c.includes('CUT') || c.includes('CNC') || c.includes('SAW') || c.includes('PLASMA') || c.includes('BAND')) return 'cut'
  if (c.includes('ASSEMBL') || c === 'WC-AS') return 'assy'
  return 'mach' // drill / punch / press / thread / straighten / grind / other
}

/** Family of an op (mrp_op_type label), falling back to its work center. */
export function opColor(label: string | null | undefined, wcCode: string | null | undefined): OpFamily {
  const c = (label || '').toUpperCase()
  if (c.includes('PAINT') || c.includes('PRIMER') || c.includes('TOP') || c.includes('COAT')) return 'paint'
  if (c.includes('BLAST')) return 'blast'
  if (c.includes('WELD')) return 'weld'
  if (c.includes('FIT')) return 'fit'
  if (c.includes('CUT')) return 'cut'
  if (c.includes('ASSEMBL') || c.includes('FINAL')) return 'assy'
  return wcColor(wcCode)
}

/** Process-family order (top → bottom): CUT · Machining · Build/Straighten · Gab(Grind)/Fit/Weld · Paint. */
export function familyRank(code: string | null | undefined): number {
  const c = (code || '').toUpperCase()
  if (c.includes('CUT') || c.includes('SAW')) return 1
  if (c.includes('DRILL') || c.includes('PRESS') || c.includes('PUNCH') || c.includes('THREAD') || c.includes('TAP') || c.includes('BEND')) return 2
  if (c.includes('HBEAM') || c.includes('H-BEAM') || c.includes('BUILD') || c.includes('STRAIGHT')) return 3
  if (c.includes('FIT') || c.includes('WELD') || c.includes('GRIND') || c.includes('GAB') || c.includes('GAP')) return 4
  if (c.includes('SURFACE') || c.includes('BLAST') || c.includes('PAINT') || c.includes('PRIMER') || c.includes('COAT')) return 5
  return 9
}

/** Comparator of work center codes: family rank, then code. */
export function byFamily(a: string, b: string): number {
  return familyRank(a) - familyRank(b) || (a < b ? -1 : a > b ? 1 : 0)
}

// Heatmap ramp (load ÷ available·OEE) — sched-design-system.css --heat-*.
export const HEAT_COLORS = ['#eef1f4', '#cfe0ef', '#8fbce0', '#4a90c4', '#2f6f9f', '#e8731a'] as const

export function heatBand(u: number): string {
  return u <= 0 ? HEAT_COLORS[0] : u < 0.4 ? HEAT_COLORS[1] : u < 0.7 ? HEAT_COLORS[2] : u < 0.92 ? HEAT_COLORS[3] : u < 1 ? HEAT_COLORS[4] : HEAT_COLORS[5]
}
