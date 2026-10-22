import { describe, expect, it } from 'vitest'
import type { PreshopAssembly } from '../api/mo'
import { candidateFor, finalRenamedAssembly, pairedLineIds, withRenameFrom, type RenameCandidate } from './preshopRename'

// MO Pre-shop upload — pair a renamed mark (2026-10-22, frontend T3): pure
// state/payload helpers for the pairing select + 1:1 + the saved `rename_from`.

const existing = { qty: 2, length_mm: 1000, width_mm: null, height_mm: null, weight_kg: 50, surface_area_m2: null, parts: [], wo_qty: 0, wo_parts: [] as string[] }
const candidates: RenameCandidate[] = [
  { line_id: 10, assembly_mark: '2BUH1B-4', existing },
  { line_id: 20, assembly_mark: 'OTHER-1', existing: { ...existing, qty: 5 } },
]
const incoming: PreshopAssembly = { assembly_mark: '9BUH1B-4', qty: 1, weight_kg: null, surface_area_m2: null, length_mm: null, parts: [] }

describe('pairedLineIds', () => {
  it('every chosen line, skipping unpaired rows', () => {
    expect(pairedLineIds({ A: 10, B: undefined, C: 20 })).toEqual(new Set([10, 20]))
    expect(pairedLineIds({})).toEqual(new Set())
  })
})

describe('candidateFor', () => {
  it('finds the chosen candidate; undefined when unpaired, not found, or no candidates', () => {
    expect(candidateFor(candidates, 10)).toEqual(candidates[0])
    expect(candidateFor(candidates, undefined)).toBeUndefined()
    expect(candidateFor(candidates, 999)).toBeUndefined()
    expect(candidateFor(undefined, 10)).toBeUndefined()
  })
})

describe('withRenameFrom', () => {
  it('sets rename_from when paired, strips it when not', () => {
    expect(withRenameFrom(incoming, '2BUH1B-4')).toEqual({ ...incoming, rename_from: '2BUH1B-4' })
    expect(withRenameFrom({ ...incoming, rename_from: '2BUH1B-4' }, undefined)).toEqual(incoming)
  })
})

describe('finalRenamedAssembly', () => {
  it('the chosen final values plus rename_from, once paired', () => {
    const out = finalRenamedAssembly(incoming, { qty: 2, parts: [] }, '2BUH1B-4')
    expect(out).toMatchObject({ assembly_mark: '9BUH1B-4', qty: 2, rename_from: '2BUH1B-4' })
  })

  it('no pairing (still "ไม่ใช่ — เพิ่มเป็น mark ใหม่") → no rename_from', () => {
    expect(finalRenamedAssembly(incoming, { qty: 1 }, undefined)).not.toHaveProperty('rename_from')
  })
})
