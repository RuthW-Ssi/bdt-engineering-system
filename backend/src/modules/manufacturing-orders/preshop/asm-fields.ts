// Every value of an assembly that an MO compares, picks and logs (2026-10-09,
// user: "ต้องเปรียบเทียบกันทุกค่า"). One list, so an upload, the compare with
// the real BOM, a BOM version switch and History all see the same fields.
// Sets (qty) are per MO line and handled apart; parts have their own diff.

export const ASM_FIELDS = [
  { key: 'name', label: 'Name' },
  { key: 'length_mm', label: 'L' },
  { key: 'width_mm', label: 'W' },
  { key: 'height_mm', label: 'H' },
  { key: 'weight_kg', label: 'kg/ชุด' },
  { key: 'surface_area_m2', label: 'area/ชุด' },
] as const

export type AsmKey = (typeof ASM_FIELDS)[number]['key']
export interface AsmValues {
  name: string | null
  length_mm: number | null
  width_mm: number | null
  height_mm: number | null
  weight_kg: number | null // per set
  surface_area_m2: number | null // per set
}

/** Prisma select for the values. */
export const ASM_SELECT = { name: true, length_mm: true, width_mm: true, height_mm: true, weight_kg: true, surface_area_m2: true } as const

const num = (v: unknown) => (v == null || v === '' ? null : Number(v))
const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** A DB row (Decimals) or a request body → plain values. */
export function asmValues(r: { name?: unknown; length_mm?: unknown; width_mm?: unknown; height_mm?: unknown; weight_kg?: unknown; surface_area_m2?: unknown }): AsmValues {
  return {
    name: text(r.name),
    length_mm: num(r.length_mm), width_mm: num(r.width_mm), height_mm: num(r.height_mm),
    weight_kg: num(r.weight_kg), surface_area_m2: num(r.surface_area_m2),
  }
}

export interface ValueChange { key: AsmKey; label: string; from: string | number | null; to: string | number | null }

/** Every value that differs. `onlyGiven`: a value the incoming side doesn't
 *  carry (null — e.g. a PDF has no name or W/H) is not a change. */
export function valueChanges(was: Partial<AsmValues>, now: Partial<AsmValues>, opts: { onlyGiven?: boolean } = {}): ValueChange[] {
  const a = asmValues(was)
  const b = asmValues(now)
  return ASM_FIELDS.flatMap(({ key, label }) => {
    if (a[key] === b[key]) return []
    if (opts.onlyGiven && b[key] == null) return []
    return [{ key, label, from: a[key], to: b[key] }]
  })
}

/** A value as History writes it. */
export const valueText = (v: string | number | null | undefined) => (v == null ? '—' : String(v))
