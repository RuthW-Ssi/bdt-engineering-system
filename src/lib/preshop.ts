import { CONFLICT_LABEL } from './preshopCombine'
import type { PreshopAssembly, PreshopPart } from '../api/mo'

// Pre-shop MO form (2026-10-07): checks and totals for the uploaded/edited
// assembly list. Weight and parts are per set, so totals multiply by sets.

export function preshopTotals(list: PreshopAssembly[]) {
  const weight = list.reduce((s, a) => s + (Number(a.weight_kg) || 0) * (Number(a.qty) || 0), 0)
  return {
    assemblies: list.length,
    sets: list.reduce((s, a) => s + (Number(a.qty) || 0), 0),
    weightKg: Math.round(weight * 100) / 100,
    pieces: list.reduce((s, a) => s + a.parts.reduce((p, x) => p + x.qty, 0) * (Number(a.qty) || 0), 0),
  }
}

export function preshopErrors(list: PreshopAssembly[]): string[] {
  const errors: string[] = []
  list.forEach((a, i) => {
    if (!a.assembly_mark.trim()) errors.push(`แถว ${i + 1}: ยังไม่ใส่ assembly mark`)
    // A pre-shop PDF leaves sets at 0 — the user types them (2026-10-08).
    if (!(Number(a.qty) > 0)) errors.push(`แถว ${i + 1}${a.assembly_mark.trim() ? ` (${a.assembly_mark.trim()})` : ''}: ยังไม่ได้กรอกจำนวนชุด`)
  })
  // Dispatch Note + drawing disagreeing on a value — the user picks (2026-10-08)
  list.forEach(a => { if (a.conflicts?.length) errors.push(`${a.assembly_mark.trim()}: เลือก ${a.conflicts.map(c => CONFLICT_LABEL[c]).join(', ')} (Dispatch Note หรือ Pre-shop)`) })
  list.forEach(a => errors.push(...partErrors(a.parts).map(e => `${a.assembly_mark.trim() || 'assembly'} · ${e}`)))
  const names = list.map(a => a.assembly_mark.trim()).filter(Boolean)
  const dupes = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))]
  if (dupes.length) errors.push(`assembly ซ้ำ: ${dupes.join(', ')}`)
  return errors
}

/** Row problems that block saving a part list. */
export function partErrors(parts: PreshopPart[]): string[] {
  const out: string[] = []
  parts.forEach((p, i) => {
    if (!p.part_mark.trim()) out.push(`part แถว ${i + 1}: ยังไม่ใส่ part mark`)
    else {
      // a builder picks parts by size and weight — L and kg required (2026-10-08)
      if (!p.profile.trim()) out.push(`${p.part_mark}: ยังไม่ใส่ profile`)
      if (!(p.length_mm > 0)) out.push(`${p.part_mark}: ยังไม่ใส่ L`)
      if (!(p.unit_weight_kg > 0)) out.push(`${p.part_mark}: ยังไม่ใส่ kg/ชิ้น`)
    }
    if (!(p.qty > 0)) out.push(`${p.part_mark || `part แถว ${i + 1}`}: จำนวนต่อชุดต้องมากกว่า 0`)
  })
  const names = parts.map(p => p.part_mark.trim()).filter(Boolean)
  const dupes = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))]
  if (dupes.length) out.push(`part ซ้ำ: ${dupes.join(', ')}`)
  return out
}
