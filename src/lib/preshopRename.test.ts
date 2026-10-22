import { describe, expect, it } from 'vitest'
import type { PreshopAssembly, PreshopMergeRow } from '../api/mo'
import { candidateFor, finalRenamedAssembly, pairedLineIds, reconcilePairing, withRenameFrom, type RenameCandidate } from './preshopRename'

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

describe('reconcilePairing', () => {
  const row = (over: Partial<PreshopMergeRow> = {}): PreshopMergeRow => ({ assembly_mark: '9BUH1B-4', status: 'new', existing: null, rename_candidates: candidates, ...over })

  it('a chosen candidate still offered on a fresh dry run → unchanged (same reference)', () => {
    const pairing = { '9BUH1B-4': 10 }
    const compare = new Map([['9BUH1B-4', row()]])
    const out = reconcilePairing(pairing, compare)
    expect(out).toEqual({ pairing, dropped: [] })
    expect(out.pairing).toBe(pairing) // no new object when nothing changed
  })

  it('the chosen candidate no longer offered (the old mark now appears in the batch) → dropped', () => {
    const pairing = { '9BUH1B-4': 10 }
    const compare = new Map([['9BUH1B-4', row({ rename_candidates: [] })]])
    const out = reconcilePairing(pairing, compare)
    expect(out).toEqual({ pairing: {}, dropped: ['9BUH1B-4'] })
  })

  it('only the stale row is dropped, a still-valid pairing on another row is kept', () => {
    const pairing = { '9BUH1B-4': 10, 'Q7': 20 }
    const compare = new Map([
      ['9BUH1B-4', row({ rename_candidates: [] })], // 10 no longer offered here
      ['Q7', row({ assembly_mark: 'Q7', rename_candidates: [candidates[1]] })], // 20 still offered
    ])
    expect(reconcilePairing(pairing, compare)).toEqual({ pairing: { Q7: 20 }, dropped: ['9BUH1B-4'] })
  })

  it('an unpaired row (undefined) is never reported as dropped', () => {
    expect(reconcilePairing({ '9BUH1B-4': undefined }, new Map())).toEqual({ pairing: { '9BUH1B-4': undefined }, dropped: [] })
  })

  it('once dropped, the row resolves to no existing/rename_from (the same functions the save path uses)', () => {
    const pairing = { '9BUH1B-4': 10 }
    const compare = new Map([['9BUH1B-4', row({ rename_candidates: [] })]])
    const { pairing: next } = reconcilePairing(pairing, compare)
    const chosen = candidateFor(compare.get('9BUH1B-4')?.rename_candidates, next['9BUH1B-4'])
    expect(chosen).toBeUndefined()
    const existing = compare.get('9BUH1B-4')!.existing ?? chosen?.existing
    expect(existing).toBeUndefined() // existingOf-equivalent → undefined → plain row sent as-is
    expect(finalRenamedAssembly(incoming, {}, chosen?.assembly_mark)).not.toHaveProperty('rename_from')
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
