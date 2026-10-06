// MO Part line helpers (wiki features/mo-part-import-plan, D5). Pure — no DB.
// One line = one size: profile + grade + length + qty.

export type PartSource = 'MATERIAL_LIST' | 'BOM_PART_LIST' | 'MANUAL'
export const PART_SOURCES: PartSource[] = ['MATERIAL_LIST', 'BOM_PART_LIST', 'MANUAL']

export interface PartLineInput {
  profile: string
  grade: string
  length_mm: number
  qty: number
  unit_weight_kg?: number | null
  part_mark?: string | null
  bom_part_ids?: number[]
}

export function sizeKey(l: Pick<PartLineInput, 'profile' | 'grade' | 'length_mm'>): string {
  return `${l.profile.trim().toUpperCase()}|${l.grade.trim().toUpperCase()}|${Number(l.length_mm)}`
}

export function validatePartLines(lines: PartLineInput[]): string[] {
  if (!lines.length) return ['At least one line is required']
  const errors: string[] = []
  const firstRowBySize = new Map<string, number>()
  lines.forEach((l, i) => {
    const row = i + 1
    if (!l.profile?.trim()) errors.push(`Row ${row}: profile is required`)
    if (!l.grade?.trim()) errors.push(`Row ${row}: grade is required`)
    if (!(Number(l.length_mm) > 0)) errors.push(`Row ${row}: length must be > 0`)
    if (!Number.isInteger(Number(l.qty)) || Number(l.qty) <= 0) errors.push(`Row ${row}: qty must be a whole number > 0`)
    if (l.unit_weight_kg != null && Number(l.unit_weight_kg) < 0) errors.push(`Row ${row}: weight must be ≥ 0`)
    if (l.profile?.trim() && l.grade?.trim() && Number(l.length_mm) > 0) {
      const key = sizeKey(l)
      const first = firstRowBySize.get(key)
      if (first) errors.push(`Rows ${first} and ${row} are the same size (${lines[first - 1].profile.trim()} ${l.grade.trim()} ${Number(l.length_mm)}) — merge them`)
      else firstRowBySize.set(key, row)
    }
  })
  return errors
}

// Source ② (Q3, spec §9): qty comes from bom_part.qty — the Part List total
// Tekla exported — never from Σ bom_assembly_part.qty × bom_assembly.qty,
// which undercounts when an assembly lists the same part twice
// (BomUploadService.upload keeps only the first junction row).
export function groupBomPartsBySize(
  parts: { id: number; part_mark: string; profile: string | null; grade: string | null; length_mm: number | null; qty: number | null; weight_kg: number | null }[],
): { lines: PartLineInput[]; skipped: string[] } {
  const skipped: string[] = []
  const bySize = new Map<string, { line: PartLineInput; marks: string[]; weights: Set<number | null> }>()
  for (const p of parts) {
    if (!p.profile?.trim() || !p.grade?.trim() || !(Number(p.length_mm) > 0) || !(Number(p.qty) > 0)) {
      skipped.push(p.part_mark)
      continue
    }
    const base = { profile: p.profile.trim(), grade: p.grade.trim(), length_mm: Number(p.length_mm) }
    const key = sizeKey(base)
    const entry = bySize.get(key) ?? { line: { ...base, qty: 0, bom_part_ids: [] }, marks: [], weights: new Set() }
    entry.line.qty += Number(p.qty)
    entry.line.bom_part_ids!.push(p.id)
    entry.marks.push(p.part_mark)
    entry.weights.add(p.weight_kg == null ? null : Number(p.weight_kg))
    bySize.set(key, entry)
  }
  const lines = [...bySize.values()].map(({ line, marks, weights }) => ({
    ...line,
    unit_weight_kg: weights.size === 1 ? [...weights][0] : null,
    part_mark: marks.join(', '),
  }))
  return { lines, skipped }
}
