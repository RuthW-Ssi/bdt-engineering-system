// Every assembly value an MO compares and picks (2026-10-09, user: "ต้องเปรียบ
// เทียบกันทุกค่า") — the same list as backend preshop/asm-fields.ts. `label`
// is the History / short form, `title` the heading on screen.

export const ASM_FIELDS = [
  { key: 'name', label: 'Name', title: 'Name', text: true },
  { key: 'length_mm', label: 'L', title: 'L (mm)', text: false },
  { key: 'width_mm', label: 'W', title: 'W (mm)', text: false },
  { key: 'height_mm', label: 'H', title: 'H (mm)', text: false },
  { key: 'weight_kg', label: 'kg/ชุด', title: 'kg / ชุด', text: false },
  { key: 'surface_area_m2', label: 'area/ชุด', title: 'area / ชุด (m²)', text: false },
] as const

export type AsmKey = (typeof ASM_FIELDS)[number]['key']
export interface AsmValues {
  name?: string | null
  length_mm?: number | null
  width_mm?: number | null
  height_mm?: number | null
  weight_kg?: number | null
  surface_area_m2?: number | null
}

/** One value, normalised for comparing: missing / blank → null, names trimmed. */
export function norm(v: AsmValues, k: AsmKey): string | number | null {
  const x = v[k]
  if (x == null) return null
  if (typeof x === 'string') return x.trim() || null
  return x
}

export const showValue = (x: string | number | null | undefined) =>
  x == null || x === '' ? '—' : typeof x === 'number' ? x.toLocaleString('en-US', { maximumFractionDigits: 4 }) : x
