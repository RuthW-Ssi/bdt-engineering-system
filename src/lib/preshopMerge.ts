import type { PreshopAssembly, PreshopMergeRow, PreshopPart } from '../api/mo'
import { ASM_FIELDS, norm, type AsmValues } from './asmFields'

// Upload onto a mark the MO already has (2026-10-08, user: "ค่าทุกอย่างที่อัพเดต
// เข้ามา … เปรียบเทียบค่าเก่าและค่าใหม่ … ให้ user ตัดสินใจเอง หรือปรับเพิ่มได้"):
// each value — sets, name, L, W, H, kg/set, area/set, parts (every value since
// 2026-10-09: "ต้องเปรียบเทียบกันทุกค่า") — is picked old / new or typed. Undefined
// = not chosen yet; values equal on both sides are chosen for the user, except
// sets, which always need a decision (a new lot or only a data update).

export type Existing = NonNullable<PreshopMergeRow['existing']>
export type PickKind = 'old' | 'new' | 'lot' | 'own'
export interface MergeChoice extends AsmValues {
  qty?: number
  parts?: PreshopPart[]
  // which card the user clicked, per field — two cards can hold the same value
  // (the BOM's sets = the MO's), so the value alone can't tell (2026-10-09). Screen only.
  from?: Partial<Record<string, PickKind>>
}

/** The card shown as selected for a field: the one clicked, else the first whose value matches. */
export function pickedKind(c: MergeChoice, field: string, values: { old: unknown; new?: unknown; lot?: unknown }): PickKind | null {
  const v = (c as Record<string, unknown>)[field]
  if (v === undefined) return null
  if (c.from?.[field]) return c.from[field]!
  if (v === values.old) return 'old'
  if (values.new !== undefined && v === values.new) return 'new'
  if (values.lot !== undefined && v === values.lot) return 'lot'
  return 'own'
}

const partKey = (p: PreshopPart) => `${p.part_mark.trim()}|${p.profile.trim()}|${p.length_mm}|${p.qty}|${p.unit_weight_kg}|${p.grade.trim()}`
export const sameParts = (a: PreshopPart[], b: PreshopPart[]) =>
  a.length === b.length && [...a].map(partKey).sort().join('\n') === [...b].map(partKey).sort().join('\n')

/** `against` 'file' (an upload): a value the file doesn't carry keeps the MO's
 *  (a Dispatch Note has no parts, a PDF no name / W / H) · 'bom': the real BOM's
 *  missing value is still a difference to pick. */
export function autoChoice(existing: Existing, incoming: PreshopAssembly, against: 'file' | 'bom' = 'file'): MergeChoice {
  const c: MergeChoice = {}
  for (const { key } of ASM_FIELDS) {
    const was = norm(existing, key)
    const now = norm(incoming, key)
    if (was === now || (against === 'file' && now == null)) (c as Record<string, unknown>)[key] = was
  }
  if ((against === 'file' && !incoming.parts.length) || sameParts(existing.parts, incoming.parts)) c.parts = existing.parts
  return c
}

/** What still needs a decision, as labels for the user. */
export function unchosen(c: MergeChoice): string[] {
  const out: string[] = []
  if (c.qty === undefined) out.push('ชุด')
  for (const f of ASM_FIELDS) if (c[f.key] === undefined) out.push(f.label)
  if (c.parts === undefined) out.push('part')
  return out
}

/** Choices the server would refuse: sets under what WOs planned, a part on a WO dropped. */
export function choiceErrors(mark: string, existing: Existing, c: MergeChoice): string[] {
  const out: string[] = []
  if (c.qty !== undefined && !(c.qty > 0)) out.push(`${mark}: จำนวนชุดต้องมากกว่า 0`)
  else if (c.qty !== undefined && c.qty < existing.wo_qty) out.push(`${mark}: ออก WO ไปแล้ว ${existing.wo_qty} ชุด — ต่ำกว่านี้ไม่ได้`)
  if (c.parts) {
    const kept = new Set(c.parts.map(p => p.part_mark.trim()))
    const dropped = existing.wo_parts.filter(m => !kept.has(m))
    if (dropped.length) out.push(`${mark}: ${dropped.join(', ')} มีใน WO แล้ว — เอาออกไม่ได้`)
  }
  return out
}

/** The assembly as it will be saved: the chosen values over the file's row. */
export function finalAssembly(incoming: PreshopAssembly, c: MergeChoice): PreshopAssembly {
  const out: PreshopAssembly = { ...incoming, qty: c.qty ?? incoming.qty, parts: c.parts ?? incoming.parts }
  delete (out as { from?: unknown }).from
  for (const { key } of ASM_FIELDS) if (c[key] !== undefined) (out as unknown as Record<string, unknown>)[key] = c[key]
  return out
}

/** What differs between two versions of an assembly, one line per field —
 *  shown before the user takes a new BOM version (2026-10-09). */
export function versionDiff(
  was: AsmValues & { parts: PreshopPart[] },
  now: AsmValues & { parts: PreshopPart[] },
): { kind: 'change' | 'add' | 'remove'; text: string }[] {
  const out: { kind: 'change' | 'add' | 'remove'; text: string }[] = []
  const v = (x: string | number | null) => (x == null ? '—' : String(x))
  for (const { key, label } of ASM_FIELDS) {
    const a = norm(was, key)
    const b = norm(now, key)
    if (a !== b) out.push({ kind: 'change', text: `${label} ${v(a)} → ${v(b)}` })
  }
  const after = new Map(now.parts.map(p => [p.part_mark, p]))
  const before = new Set(was.parts.map(p => p.part_mark))
  for (const p of was.parts) {
    const q = after.get(p.part_mark)
    if (!q) { out.push({ kind: 'remove', text: `${p.part_mark} ไม่มีใน version ใหม่` }); continue }
    const f: string[] = []
    if (p.qty !== q.qty) f.push(`ต่อชุด ${p.qty} → ${q.qty}`)
    if (p.profile !== q.profile) f.push(`profile ${p.profile} → ${q.profile}`)
    if (p.grade !== q.grade) f.push(`grade ${p.grade || '—'} → ${q.grade || '—'}`)
    if (p.length_mm !== q.length_mm) f.push(`L ${p.length_mm} → ${q.length_mm}`)
    if (p.unit_weight_kg !== q.unit_weight_kg) f.push(`kg ${p.unit_weight_kg} → ${q.unit_weight_kg}`)
    if (f.length) out.push({ kind: 'change', text: `${p.part_mark}: ${f.join(', ')}` })
  }
  for (const q of now.parts) if (!before.has(q.part_mark)) out.push({ kind: 'add', text: `${q.part_mark} ${q.profile} L${q.length_mm} ×${q.qty}/ชุด (ใหม่)` })
  return out
}
