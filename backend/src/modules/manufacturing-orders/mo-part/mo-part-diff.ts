import { lineKey, PartLineInput, PartMarkInput } from './part-lines'

// Field-level change log for MO Part saves (round 3 R2). Marks are keyed by
// mark name, lines by mark|part mark|size; added/removed rows use field '*'.

export interface MoPartChange {
  entity: 'header' | 'mark' | 'line'
  key: string
  field: string
  old: unknown
  new: unknown
}

export interface MoPartSnapshot {
  header: Record<string, unknown>
  marks: PartMarkInput[]
  lines: PartLineInput[]
}

const MARK_FIELDS = ['set_qty', 'length_mm', 'width_mm', 'height_mm', 'weight_kg', 'tw_mm', 'tf_mm'] as const
const LINE_FIELDS = ['qty', 'unit_weight_kg', 'cut_length_mm', 'holes', 'bom_part_ids'] as const

// Decimals arrive as strings from Prisma; dates as Date or ISO strings.
function norm(v: unknown): unknown {
  if (v === undefined || v === null || v === '') return null
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  if (Array.isArray(v)) return v.length ? JSON.stringify(v) : null
  return v
}

function fieldChanges(entity: MoPartChange['entity'], key: string, before: Record<string, unknown>, after: Record<string, unknown>, fields: readonly string[]) {
  const out: MoPartChange[] = []
  for (const f of fields) {
    const a = norm(before[f])
    const b = norm(after[f])
    if (a !== b) out.push({ entity, key, field: f, old: a, new: b })
  }
  return out
}

export function diffMoPart(before: MoPartSnapshot, after: MoPartSnapshot): MoPartChange[] {
  const changes = fieldChanges('header', 'header', before.header, after.header, Object.keys(after.header))

  const beforeMarks = new Map(before.marks.map(m => [m.mark, m]))
  const afterMarks = new Set(after.marks.map(m => m.mark))
  for (const m of after.marks) {
    const b = beforeMarks.get(m.mark)
    if (!b) changes.push({ entity: 'mark', key: m.mark, field: '*', old: null, new: 'added' })
    else changes.push(...fieldChanges('mark', m.mark, b as never, m as never, MARK_FIELDS))
  }
  for (const m of before.marks) if (!afterMarks.has(m.mark)) changes.push({ entity: 'mark', key: m.mark, field: '*', old: 'removed', new: null })

  const beforeLines = new Map(before.lines.map(l => [lineKey(l), l]))
  const afterKeys = new Set(after.lines.map(lineKey))
  for (const l of after.lines) {
    const k = lineKey(l)
    const b = beforeLines.get(k)
    if (!b) changes.push({ entity: 'line', key: k, field: '*', old: null, new: 'added' })
    else changes.push(...fieldChanges('line', k, b as never, l as never, LINE_FIELDS))
  }
  for (const l of before.lines) if (!afterKeys.has(lineKey(l))) changes.push({ entity: 'line', key: lineKey(l), field: '*', old: 'removed', new: null })
  return changes
}
