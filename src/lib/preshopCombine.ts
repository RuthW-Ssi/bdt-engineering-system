import type { PreshopAssembly, PreshopConflictField } from '../api/mo'
import { sameParts } from './preshopMerge'

// A Dispatch Note and pre-shop drawings read together into one list
// (2026-10-08, user: "อัพได้ทั้ง dispatch note + preshop จะได้เป็นข้อมูลที่
// สมบูรณ์มากสุดรองลงมาจาก bom"). Rows are matched by mark: sets come from the
// Dispatch Note, parts from the drawing; L / kg per set that disagree become
// conflicts the user picks (decision 1ก). A mark only in the drawing still
// comes in — sets typed by the user, removable (decision 2ข).

export type FileKind = 'DN' | 'PDF'
export interface UploadedFile { name: string; kind: FileKind; warnings?: string[] } // warnings: what the reader said, logged with the save

const mark = (a: PreshopAssembly) => a.assembly_mark.trim()
// every number both files can carry (2026-10-09: W / H / area too — a PDF has area, no W / H)
const SIZE = ['length_mm', 'width_mm', 'height_mm', 'weight_kg', 'surface_area_m2'] as const

/** Adds one file's (or one PDF batch's) rows to the list. */
export function combine(rows: PreshopAssembly[], incoming: PreshopAssembly[], kind: FileKind, file: (a: PreshopAssembly) => string): PreshopAssembly[] {
  const out = rows.map(r => ({ ...r }))
  for (const inc of incoming) {
    const snap = { file: file(inc), qty: inc.qty, name: inc.name ?? null, length_mm: inc.length_mm, width_mm: inc.width_mm ?? null, height_mm: inc.height_mm ?? null, weight_kg: inc.weight_kg, surface_area_m2: inc.surface_area_m2 ?? null, parts: inc.parts }
    const i = out.findIndex(r => mark(r) === mark(inc))
    if (i < 0) {
      out.push({ ...inc, qty: kind === 'DN' ? inc.qty : 0, parts: kind === 'PDF' ? inc.parts : [], sources: { [kind]: snap }, conflicts: [] })
      continue
    }
    const r = out[i]
    const conflicts = new Set<PreshopConflictField>(r.conflicts ?? [])
    const next: PreshopAssembly = { ...r, sources: { ...r.sources, [kind]: snap } }
    if (kind === 'DN') { next.qty = inc.qty; if (inc.name) next.name = inc.name } // sets + name are the Dispatch Note's
    if (kind === 'PDF' && inc.parts.length) {
      if (!r.parts.length) next.parts = inc.parts
      else if (!sameParts(r.parts, inc.parts)) conflicts.add('parts')
    }
    for (const f of SIZE) {
      if (r[f] == null) next[f] = inc[f] ?? null
      else if (inc[f] != null && r[f] !== inc[f]) conflicts.add(f)
    }
    next.conflicts = [...conflicts]
    out[i] = next
  }
  return out
}

/** The user picked a value for a conflicting field. */
export function resolve<F extends PreshopConflictField>(row: PreshopAssembly, field: F, value: PreshopAssembly[F]): PreshopAssembly {
  return { ...row, [field]: value, conflicts: (row.conflicts ?? []).filter(c => c !== field) }
}

/** Takes a wrong file out: its rows go, or — where the other kind of file
 *  also has the mark — the row goes back to what that file says. */
export function removeFile(rows: PreshopAssembly[], name: string): PreshopAssembly[] {
  return rows.flatMap(r => {
    const s = r.sources
    if (!s || (s.DN?.file !== name && s.PDF?.file !== name)) return [r]
    const left = s.DN?.file === name ? s.PDF : s.DN
    const kind: FileKind | null = !left ? null : left === s.DN ? 'DN' : 'PDF'
    if (!left || !kind) return []
    return [{ ...r, qty: kind === 'DN' ? left.qty : 0, name: kind === 'DN' ? left.name : null, length_mm: left.length_mm, width_mm: left.width_mm, height_mm: left.height_mm, weight_kg: left.weight_kg, surface_area_m2: left.surface_area_m2, parts: kind === 'PDF' ? left.parts : [], sources: { [kind]: left }, conflicts: [] }]
  })
}

/** Marks read from a drawing that the Dispatch Note doesn't list — only once a Dispatch Note is in. */
export function notInDispatchNote(rows: PreshopAssembly[]): Set<string> {
  if (!rows.some(r => r.sources?.DN)) return new Set()
  return new Set(rows.filter(r => r.sources?.PDF && !r.sources.DN).map(mark))
}

export const CONFLICT_LABEL: Record<PreshopConflictField, string> = { length_mm: 'L', width_mm: 'W', height_mm: 'H', weight_kg: 'kg/ชุด', surface_area_m2: 'area/ชุด', parts: 'part' }
