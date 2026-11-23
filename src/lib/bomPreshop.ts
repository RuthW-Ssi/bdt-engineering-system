import type { PreshopAssembly, PreshopListPart } from '../api/bomPreshop'

// Pre-shop editor at the BOM page (2026-11-23, wiki features/bom-preshop-upload-plan).
// Assemblies, parts and the links between them are kept apart so one part can
// sit in many assemblies (real BOMs do this — 20% of parts in DRIVING RANGE
// BANGNA Z1). A new file merges into what is there: new marks are added, a
// changed value becomes a Conflict the Engineer picks, marks gone from a
// Dispatch Note are listed so the Engineer keeps or removes them. Links never
// change on a merge.

export type AsmField = 'qty' | 'name' | 'length_mm' | 'width_mm' | 'height_mm' | 'weight_kg' | 'surface_area_m2'
export type PartField = 'profile' | 'grade' | 'length_mm' | 'unit_weight_kg' | 'no'
export interface EdAsm { key: string; src: 'saved' | 'dn' | 'own'; mark: string; qty: number; name: string | null; length_mm: number | null; width_mm: number | null; height_mm: number | null; weight_kg: number | null; surface_area_m2: number | null }
export interface EdPart { key: string; src: 'saved' | 'pl' | 'own'; part_mark: string; profile: string; grade: string; length_mm: number | null; unit_weight_kg: number | null; no: number | null }
export interface EdLink { asmKey: string; partKey: string; qty: number } // qty per set
export interface EditorState { asm: EdAsm[]; parts: EdPart[]; links: EdLink[] }
export interface Conflict { id: string; kind: 'asm' | 'part'; key: string; mark: string; field: AsmField | PartField; old: string | number | null; new: string | number | null }
export interface MergeResult { state: EditorState; conflicts: Conflict[]; missing: string[] }
export type Pick = 'old' | 'new' | { own: string | number | null } // own = typed by the Engineer (กำหนดเอง)

export const ASM_FIELDS: AsmField[] = ['qty', 'name', 'length_mm', 'width_mm', 'height_mm', 'weight_kg', 'surface_area_m2']
export const PART_FIELDS: PartField[] = ['profile', 'grade', 'length_mm', 'unit_weight_kg', 'no']
export const EMPTY_STATE: EditorState = { asm: [], parts: [], links: [] }

let seq = 0
export const newKey = (prefix: string) => `${prefix}${++seq}`

const blank = (v: unknown) => v == null || (typeof v === 'string' && v.trim() === '')
const same = (a: unknown, b: unknown) => (blank(a) && blank(b)) || (typeof a === 'string' && typeof b === 'string' ? a.trim() === b.trim() : a === b)

function asmRow(a: PreshopAssembly, src: EdAsm['src']): EdAsm {
  return {
    key: newKey('a'), src, mark: a.assembly_mark.trim(), qty: a.qty, name: a.name ?? null,
    length_mm: a.length_mm ?? null, width_mm: a.width_mm ?? null, height_mm: a.height_mm ?? null,
    weight_kg: a.weight_kg ?? null, surface_area_m2: a.surface_area_m2 ?? null,
  }
}

export function fromSaved(assemblies: PreshopAssembly[]): EditorState {
  const asm: EdAsm[] = []
  const parts: EdPart[] = []
  const links: EdLink[] = []
  const byMark = new Map<string, EdPart>()
  for (const a of assemblies) {
    const row = asmRow(a, 'saved')
    asm.push(row)
    for (const p of a.parts) {
      let part = byMark.get(p.part_mark)
      if (!part) {
        part = { key: newKey('p'), src: 'saved', part_mark: p.part_mark, profile: p.profile, grade: p.grade, length_mm: p.length_mm, unit_weight_kg: p.unit_weight_kg, no: null }
        byMark.set(p.part_mark, part)
        parts.push(part)
      }
      links.push({ asmKey: row.key, partKey: part.key, qty: p.qty })
    }
  }
  return { asm, parts, links }
}

export function mergeDispatchNote(s: EditorState, incoming: PreshopAssembly[]): MergeResult {
  const conflicts: Conflict[] = []
  const asm = [...s.asm]
  const inFile = new Set<string>()
  for (const a of incoming) {
    const mark = a.assembly_mark.trim()
    inFile.add(mark)
    const cur = asm.find(x => x.mark === mark)
    if (!cur) { asm.push(asmRow(a, 'dn')); continue }
    const next = asmRow(a, 'dn')
    for (const f of ASM_FIELDS) {
      if (blank(next[f]) || same(cur[f], next[f])) continue
      conflicts.push({ id: `asm:${cur.key}:${f}`, kind: 'asm', key: cur.key, mark, field: f, old: cur[f], new: next[f] })
    }
  }
  const missing = s.asm.filter(a => a.src !== 'own' && !inFile.has(a.mark)).map(a => a.mark)
  return { state: { ...s, asm }, conflicts, missing }
}

export function mergePartList(s: EditorState, incoming: PreshopListPart[]): MergeResult {
  const conflicts: Conflict[] = []
  const parts = s.parts.map(p => ({ ...p })) // copies — a cancelled dialog must leave the current state as it was
  for (const p of incoming) {
    const mark = p.part_mark.trim()
    const cur = parts.find(x => x.part_mark === mark)
    if (!cur) {
      parts.push({ key: newKey('p'), src: 'pl', part_mark: mark, profile: p.profile, grade: p.grade, length_mm: p.length_mm, unit_weight_kg: p.unit_weight_kg, no: p.no })
      continue
    }
    for (const f of PART_FIELDS) {
      const v = p[f]
      if (blank(v) || same(cur[f], v)) continue
      // a saved part has no Part List count yet — take it, it is not a change
      if (f === 'no' && cur.no == null) { cur.no = v as number; continue }
      conflicts.push({ id: `part:${cur.key}:${f}`, kind: 'part', key: cur.key, mark, field: f, old: cur[f], new: v })
    }
  }
  return { state: { ...s, parts }, conflicts, missing: [] }
}

export function applyMerge(r: MergeResult, picks: Record<string, Pick>, remove: string[]): EditorState {
  const pick = (c: Conflict) => picks[c.id]
  const take = (c: Conflict) => { const p = pick(c); return p === 'new' || (typeof p === 'object' && p != null) }
  const valueOf = (c: Conflict) => { const p = pick(c); return typeof p === 'object' && p != null ? p.own : c.new }
  const asm = r.state.asm
    .filter(a => !(a.src !== 'own' && remove.includes(a.mark)))
    .map(a => {
      const mine = r.conflicts.filter(c => c.kind === 'asm' && c.key === a.key && take(c))
      return mine.length ? mine.reduce((acc, c) => ({ ...acc, [c.field]: valueOf(c) }), a) : a
    })
  const parts = r.state.parts.map(p => {
    const mine = r.conflicts.filter(c => c.kind === 'part' && c.key === p.key && take(c))
    return mine.length ? mine.reduce((acc, c) => ({ ...acc, [c.field]: valueOf(c) }), p) : p
  })
  const keep = new Set(asm.map(a => a.key))
  return { asm, parts, links: r.state.links.filter(l => keep.has(l.asmKey)) }
}

export function removeFileRows(s: EditorState, src: 'dn' | 'pl'): EditorState {
  const asm = src === 'dn' ? s.asm.filter(a => a.src !== 'dn') : s.asm
  const parts = src === 'pl' ? s.parts.filter(p => p.src !== 'pl') : s.parts
  const a = new Set(asm.map(x => x.key))
  const p = new Set(parts.map(x => x.key))
  return { asm, parts, links: s.links.filter(l => a.has(l.asmKey) && p.has(l.partKey)) }
}

export function addLink(s: EditorState, partKey: string, asmKey: string): EditorState {
  if (s.links.some(l => l.partKey === partKey && l.asmKey === asmKey)) return s
  return { ...s, links: [...s.links, { asmKey, partKey, qty: 1 }] }
}

export function usage(s: EditorState, partKey: string): { asmMarks: string[]; pcs: number; over: boolean } {
  const part = s.parts.find(p => p.key === partKey)
  const asmMarks: string[] = []
  let pcs = 0
  for (const l of s.links) {
    if (l.partKey !== partKey) continue
    const a = s.asm.find(x => x.key === l.asmKey)
    if (!a) continue
    asmMarks.push(a.mark || '?')
    pcs += (l.qty || 0) * (a.qty || 0)
  }
  return { asmMarks, pcs, over: part?.no != null && pcs > part.no }
}

export interface SaveErrors { needsParts: string[]; badSets: string[]; blankMarks: number; dupMarks: string[]; badQty: string[]; incompleteParts: string[]; dupPartMarks: string[] }

export function saveErrors(s: EditorState): SaveErrors {
  const label = (a: EdAsm) => a.mark.trim() || '(no mark)'
  const marks = s.asm.map(a => a.mark.trim()).filter(Boolean)
  const linked = (a: EdAsm) => s.links.filter(l => l.asmKey === a.key && s.parts.some(p => p.key === l.partKey))
  const usedParts = new Set(s.links.filter(l => s.asm.some(a => a.key === l.asmKey)).map(l => l.partKey))
  return {
    needsParts: s.asm.filter(a => linked(a).length === 0).map(label),
    badSets: s.asm.filter(a => !(a.qty > 0)).map(label),
    blankMarks: s.asm.filter(a => !a.mark.trim()).length,
    dupMarks: [...new Set(marks.filter((m, i) => marks.indexOf(m) !== i))],
    badQty: s.asm.flatMap(a => linked(a).filter(l => !(l.qty > 0)).map(l => `${label(a)} / ${s.parts.find(p => p.key === l.partKey)!.part_mark || '?'}`)),
    incompleteParts: s.parts
      .filter(p => usedParts.has(p.key) && (blank(p.part_mark) || blank(p.profile) || !(Number(p.length_mm) > 0) || p.unit_weight_kg == null))
      .map(p => p.part_mark.trim() || '(no mark)'),
    // two different parts under one mark would be merged on save (one bom_part per mark)
    dupPartMarks: (() => {
      const marks = s.parts.filter(p => usedParts.has(p.key)).map(p => p.part_mark.trim()).filter(Boolean)
      return [...new Set(marks.filter((m, i) => marks.indexOf(m) !== i))]
    })(),
  }
}

export function canSave(e: SaveErrors, s: EditorState): boolean {
  return s.asm.length > 0 && !e.needsParts.length && !e.badSets.length && e.blankMarks === 0 && !e.dupMarks.length && !e.badQty.length && !e.incompleteParts.length && !e.dupPartMarks.length
}

export function toPayload(s: EditorState): PreshopAssembly[] {
  return s.asm.map(a => ({
    assembly_mark: a.mark.trim(), name: a.name?.trim() || null, qty: a.qty,
    length_mm: a.length_mm, width_mm: a.width_mm, height_mm: a.height_mm, weight_kg: a.weight_kg, surface_area_m2: a.surface_area_m2,
    parts: s.links.filter(l => l.asmKey === a.key).flatMap(l => {
      const p = s.parts.find(x => x.key === l.partKey)
      return p ? [{ part_mark: p.part_mark.trim(), profile: p.profile.trim(), grade: p.grade.trim(), length_mm: Number(p.length_mm), unit_weight_kg: Number(p.unit_weight_kg), qty: l.qty }] : []
    }),
  }))
}
