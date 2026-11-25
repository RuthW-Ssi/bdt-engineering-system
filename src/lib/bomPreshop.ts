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
export type Slot = 'MAIN' | 'ACC'
// slot: Separate pre-shop only (2026-11-25) — the Dispatch Note it came from, or picked for a hand-added row
export interface EdAsm { slot?: Slot | null; key: string; src: 'saved' | 'dn' | 'own'; mark: string; qty: number; name: string | null; length_mm: number | null; width_mm: number | null; height_mm: number | null; weight_kg: number | null; surface_area_m2: number | null }
// plSlot: the Part List box it came from (Separate); null = hand-added / saved / combined
export interface EdPart { plSlot?: Slot | null; key: string; src: 'saved' | 'pl' | 'own'; part_mark: string; profile: string; grade: string; length_mm: number | null; unit_weight_kg: number | null; no: number | null }
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

function asmRow(a: PreshopAssembly, src: EdAsm['src'], slot: Slot | null = a.slot ?? null): EdAsm {
  return {
    key: newKey('a'), src, slot, mark: a.assembly_mark.trim(), qty: a.qty, name: a.name ?? null,
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

/** `slot` = the Dispatch Note box (Separate); its marks take that slot, and only that slot's rows can go missing. */
export function mergeDispatchNote(s: EditorState, incoming: PreshopAssembly[], slot: Slot | null = null): MergeResult {
  const conflicts: Conflict[] = []
  const asm = [...s.asm]
  const inFile = new Set<string>()
  for (const a of incoming) {
    const mark = a.assembly_mark.trim()
    inFile.add(mark)
    const i = asm.findIndex(x => x.mark === mark)
    if (i < 0) { asm.push(asmRow(a, 'dn', slot)); continue }
    if (slot) asm[i] = { ...asm[i], slot } // the file is the truth for its slot
    const cur = asm[i]
    const next = asmRow(a, 'dn')
    for (const f of ASM_FIELDS) {
      if (blank(next[f]) || same(cur[f], next[f])) continue
      conflicts.push({ id: `asm:${cur.key}:${f}`, kind: 'asm', key: cur.key, mark, field: f, old: cur[f], new: next[f] })
    }
  }
  const missing = s.asm.filter(a => a.src !== 'own' && !inFile.has(a.mark) && (slot == null || a.slot === slot)).map(a => a.mark)
  return { state: { ...s, asm }, conflicts, missing }
}

/** `slot` = the Part List box (Separate). */
export function mergePartList(s: EditorState, incoming: PreshopListPart[], slot: Slot | null = null): MergeResult {
  const conflicts: Conflict[] = []
  const parts = s.parts.map(p => ({ ...p })) // copies — a cancelled dialog must leave the current state as it was
  for (const p of incoming) {
    const mark = p.part_mark.trim()
    const cur = parts.find(x => x.part_mark === mark)
    if (!cur) {
      parts.push({ key: newKey('p'), src: 'pl', plSlot: slot, part_mark: mark, profile: p.profile, grade: p.grade, length_mm: p.length_mm, unit_weight_kg: p.unit_weight_kg, no: p.no })
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

/** `slot` (Separate): only the rows that came from that box. */
export function removeFileRows(s: EditorState, src: 'dn' | 'pl', slot: Slot | null = null): EditorState {
  const asm = src === 'dn' ? s.asm.filter(a => a.src !== 'dn' || (slot != null && a.slot !== slot)) : s.asm
  const parts = src === 'pl' ? s.parts.filter(p => p.src !== 'pl' || (slot != null && p.plSlot !== slot)) : s.parts
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

export interface SaveErrors { noSlot: string[]; needsParts: string[]; badSets: string[]; blankMarks: number; dupMarks: string[]; badQty: string[]; incompleteParts: string[]; dupPartMarks: string[] }

export function saveErrors(s: EditorState, mode: 'combined' | 'separate' = 'combined'): SaveErrors {
  const label = (a: EdAsm) => a.mark.trim() || '(no mark)'
  const marks = s.asm.map(a => a.mark.trim()).filter(Boolean)
  const linked = (a: EdAsm) => s.links.filter(l => l.asmKey === a.key && s.parts.some(p => p.key === l.partKey))
  const usedParts = new Set(s.links.filter(l => s.asm.some(a => a.key === l.asmKey)).map(l => l.partKey))
  return {
    noSlot: mode === 'separate' ? s.asm.filter(a => a.slot !== 'MAIN' && a.slot !== 'ACC').map(label) : [],
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
  return s.asm.length > 0 && !e.noSlot.length && !e.needsParts.length && !e.badSets.length && e.blankMarks === 0 && !e.dupMarks.length && !e.badQty.length && !e.incompleteParts.length && !e.dupPartMarks.length
}

/** Separate: each assembly's slot; a part's box slot only when both Part Lists were loaded (else the server
 *  derives it from the assemblies using it — the Full shop's shared Part List rule). */
export function toPayload(s: EditorState, opts: { mode: 'combined' | 'separate'; bothPartLists: boolean } = { mode: 'combined', bothPartLists: false }): PreshopAssembly[] {
  const sep = opts.mode === 'separate'
  return s.asm.map(a => ({
    slot: sep ? a.slot ?? null : null,
    assembly_mark: a.mark.trim(), name: a.name?.trim() || null, qty: a.qty,
    length_mm: a.length_mm, width_mm: a.width_mm, height_mm: a.height_mm, weight_kg: a.weight_kg, surface_area_m2: a.surface_area_m2,
    parts: s.links.filter(l => l.asmKey === a.key).flatMap(l => {
      const p = s.parts.find(x => x.key === l.partKey)
      return p ? [{ part_mark: p.part_mark.trim(), profile: p.profile.trim(), grade: p.grade.trim(), length_mm: Number(p.length_mm), unit_weight_kg: Number(p.unit_weight_kg), qty: l.qty, slot: sep && opts.bothPartLists ? p.plSlot ?? null : null }] : []
    }),
  }))
}

// ── Someone saved first (2026-11-23, Tao): latest saved revision → what I am about to save ──
const ASM_LABEL: Record<AsmField, string> = { qty: 'ชุด', name: 'Name', length_mm: 'L', width_mm: 'W', height_mm: 'H', weight_kg: 'kg/ชุด', surface_area_m2: 'area/ชุด' }
const show = (v: unknown) => (v == null || v === '' ? '—' : String(v))

export interface AsmDiff { mark: string; kind: 'changed' | 'removed' | 'added'; changes: string[] }

export function diffAssemblies(theirs: PreshopAssembly[], mine: PreshopAssembly[]): AsmDiff[] {
  const out: AsmDiff[] = []
  const mineBy = new Map(mine.map(a => [a.assembly_mark, a]))
  const theirsBy = new Map(theirs.map(a => [a.assembly_mark, a]))
  for (const t of theirs) {
    const m = mineBy.get(t.assembly_mark)
    if (!m) { out.push({ mark: t.assembly_mark, kind: 'removed', changes: [] }); continue }
    const changes: string[] = []
    for (const f of ASM_FIELDS) {
      const a = (t as unknown as Record<string, unknown>)[f] ?? null
      const b = (m as unknown as Record<string, unknown>)[f] ?? null
      if (!same(a, b)) changes.push(`${ASM_LABEL[f]} ${show(a)} → ${show(b)}`)
    }
    const tp = new Map(t.parts.map(p => [p.part_mark, p]))
    const mp = new Map(m.parts.map(p => [p.part_mark, p]))
    for (const [mark, p] of tp) {
      const q = mp.get(mark)
      if (!q) { changes.push(`ไม่มี part ${mark}`); continue }
      if (p.qty !== q.qty) changes.push(`${mark} ต่อชุด ${p.qty} → ${q.qty}`)
      if (p.profile !== q.profile) changes.push(`${mark} Profile ${p.profile} → ${q.profile}`)
      if (p.grade !== q.grade) changes.push(`${mark} Grade ${show(p.grade)} → ${show(q.grade)}`)
      if (p.length_mm !== q.length_mm) changes.push(`${mark} L ${p.length_mm} → ${q.length_mm}`)
      if (p.unit_weight_kg !== q.unit_weight_kg) changes.push(`${mark} kg/ชิ้น ${p.unit_weight_kg} → ${q.unit_weight_kg}`)
    }
    for (const mark of mp.keys()) if (!tp.has(mark)) changes.push(`part ใหม่ ${mark}`)
    if (changes.length) out.push({ mark: t.assembly_mark, kind: 'changed', changes })
  }
  for (const m of mine) if (!theirsBy.has(m.assembly_mark)) out.push({ mark: m.assembly_mark, kind: 'added', changes: [] })
  return out
}
