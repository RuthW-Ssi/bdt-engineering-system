import { describe, expect, it } from 'vitest'
import type { PreshopAssembly, PreshopListPart } from '../api/bomPreshop'
import {
  addLink, applyMerge, canSave, diffAssemblies, fromSaved, mergeDispatchNote, mergePartList, removeFileRows, saveErrors, toPayload, usage,
  type EditorState,
} from './bomPreshop'

const asm = (mark: string, qty: number, extra: Partial<PreshopAssembly> = {}): PreshopAssembly => ({
  assembly_mark: mark, name: 'COLUMN', qty, weight_kg: 1265.4, surface_area_m2: 24.6, length_mm: 8450, width_mm: 300, height_mm: 300, parts: [], ...extra,
})
const P101 = { part_mark: 'P101', profile: 'H300x300x10x15', length_mm: 8400, grade: 'SS400', qty: 1, unit_weight_kg: 789.6 }
const P102 = { part_mark: 'P102', profile: 'PL25x400', length_mm: 400, grade: 'SS400', qty: 2, unit_weight_kg: 31.4 }
const SAVED: PreshopAssembly[] = [asm('C-01', 4, { parts: [P101, P102] }), asm('C-02', 2, { parts: [P102] }), asm('B-01', 6, { name: 'BEAM', parts: [P101] })]
const DN: PreshopAssembly[] = [asm('C-01', 4), asm('C-02', 2), asm('B-01', 6, { name: 'BEAM' }), asm('BR-01', 8, { name: 'BRACE' })]
const empty: EditorState = { asm: [], parts: [], links: [] }
const listPart = (part_mark: string, extra: Partial<PreshopListPart> = {}): PreshopListPart => ({ part_mark, profile: 'PL12x150', grade: 'SS400', length_mm: 280, unit_weight_kg: 4, no: 24, ...extra })

const keyOf = (s: EditorState, mark: string) => s.asm.find(a => a.mark === mark)!.key
const partKey = (s: EditorState, mark: string) => s.parts.find(p => p.part_mark === mark)!.key

describe('fromSaved', () => {
  it('turns saved assemblies into rows, one part per mark and a link per assembly', () => {
    const s = fromSaved(SAVED)
    expect(s.asm.map(a => [a.mark, a.qty, a.src])).toEqual([['C-01', 4, 'saved'], ['C-02', 2, 'saved'], ['B-01', 6, 'saved']])
    expect(s.parts.map(p => p.part_mark)).toEqual(['P101', 'P102'])
    expect(s.links).toHaveLength(4)
  })
})

describe('mergeDispatchNote', () => {
  it('adds every assembly to an empty editor without conflicts', () => {
    const r = mergeDispatchNote(empty, DN)
    expect(r.state.asm.map(a => [a.mark, a.src])).toEqual([['C-01', 'dn'], ['C-02', 'dn'], ['B-01', 'dn'], ['BR-01', 'dn']])
    expect(r.conflicts).toEqual([])
    expect(r.missing).toEqual([])
  })

  it('reports a changed value as a conflict and applies the pick', () => {
    const r = mergeDispatchNote(fromSaved(SAVED), [asm('C-01', 6), asm('C-02', 2), asm('B-01', 6, { name: 'BEAM' })])
    expect(r.conflicts.map(c => ({ mark: c.mark, field: c.field, old: c.old, new: c.new }))).toEqual([{ mark: 'C-01', field: 'qty', old: 4, new: 6 }])
    const id = r.conflicts[0].id
    expect(applyMerge(r, { [id]: 'new' }, []).asm.find(a => a.mark === 'C-01')!.qty).toBe(6)
    expect(applyMerge(r, { [id]: 'old' }, []).asm.find(a => a.mark === 'C-01')!.qty).toBe(4)
  })

  it('lists marks gone from the file and removes them with their links when asked', () => {
    const s = fromSaved(SAVED)
    const withOwn: EditorState = { ...s, asm: [...s.asm, { key: 'own1', src: 'own', mark: 'X-01', qty: 1, name: null, length_mm: null, width_mm: null, height_mm: null, weight_kg: null, surface_area_m2: null }] }
    const r = mergeDispatchNote(withOwn, [asm('C-01', 4), asm('C-02', 2)])
    expect(r.missing).toEqual(['B-01'])
    const out = applyMerge(r, {}, ['B-01'])
    expect(out.asm.map(a => a.mark)).toEqual(['C-01', 'C-02', 'X-01'])
    expect(out.links.some(l => l.asmKey === keyOf(s, 'B-01'))).toBe(false)
  })

  it('does not treat a value the file leaves empty as a change', () => {
    const r = mergeDispatchNote(fromSaved(SAVED), [asm('C-01', 4, { width_mm: null }), asm('C-02', 2), asm('B-01', 6, { name: 'BEAM' })])
    expect(r.conflicts).toEqual([])
  })

  it('keeps existing links', () => {
    const s = fromSaved(SAVED)
    expect(mergeDispatchNote(s, [asm('C-01', 6)]).state.links).toEqual(s.links)
  })
})

describe('mergePartList', () => {
  it('adds new parts, flags changed part values and keeps links', () => {
    const s = fromSaved(SAVED)
    const r = mergePartList(s, [listPart('P103'), listPart('P102', { profile: 'PL25x400', length_mm: 400, unit_weight_kg: 32.0, no: 12 })])
    expect(r.state.parts.map(p => [p.part_mark, p.src])).toEqual([['P101', 'saved'], ['P102', 'saved'], ['P103', 'pl']])
    expect(r.conflicts.map(c => [c.mark, c.field, c.old, c.new])).toEqual([['P102', 'unit_weight_kg', 31.4, 32]])
    expect(r.missing).toEqual([])
    expect(r.state.links).toEqual(s.links)
  })
})

describe('merge leaves the current state untouched', () => {
  it('a cancelled Part List merge does not change saved parts', () => {
    const s = fromSaved(SAVED)
    const before = JSON.stringify(s)
    mergePartList(s, [listPart('P102', { profile: 'PL25x400', length_mm: 400, unit_weight_kg: 31.4, no: 12 })])
    expect(JSON.stringify(s)).toBe(before)
  })
})

describe('applyMerge with a typed value', () => {
  it('uses the value the Engineer typed (กำหนดเอง)', () => {
    const r = mergeDispatchNote(fromSaved(SAVED), [asm('C-01', 6), asm('C-02', 2), asm('B-01', 6, { name: 'BEAM' })])
    expect(applyMerge(r, { [r.conflicts[0].id]: { own: 5 } }, []).asm.find(a => a.mark === 'C-01')!.qty).toBe(5)
  })
})

describe('addLink and usage', () => {
  it('links a part once per assembly', () => {
    const s = mergePartList(mergeDispatchNote(empty, DN).state, [listPart('P103')]).state
    const once = addLink(s, partKey(s, 'P103'), keyOf(s, 'B-01'))
    expect(addLink(once, partKey(s, 'P103'), keyOf(s, 'B-01')).links).toHaveLength(1)
  })

  it('counts pieces over every assembly and flags more than the Part List has', () => {
    let s = mergePartList(mergeDispatchNote(empty, DN).state, [listPart('P102', { no: 12 })]).state
    s = addLink(s, partKey(s, 'P102'), keyOf(s, 'C-01'))
    s = addLink(s, partKey(s, 'P102'), keyOf(s, 'C-02'))
    s = { ...s, links: s.links.map(l => ({ ...l, qty: 2 })) }
    expect(usage(s, partKey(s, 'P102'))).toEqual({ asmMarks: ['C-01', 'C-02'], pcs: 12, over: false })
    const fewer = { ...s, parts: s.parts.map(p => ({ ...p, no: 10 })) }
    expect(usage(fewer, partKey(s, 'P102')).over).toBe(true)
  })
})

describe('removeFileRows', () => {
  it('drops the rows of that file and their links, keeps saved and hand-added rows', () => {
    const base = fromSaved(SAVED)
    let s = mergeDispatchNote(base, [...DN]).state
    s = addLink(s, partKey(s, 'P101'), keyOf(s, 'BR-01'))
    s = { ...s, asm: [...s.asm, { key: 'own1', src: 'own', mark: 'X-01', qty: 1, name: null, length_mm: null, width_mm: null, height_mm: null, weight_kg: null, surface_area_m2: null }] }
    const out = removeFileRows(s, 'dn')
    expect(out.asm.map(a => a.mark)).toEqual(['C-01', 'C-02', 'B-01', 'X-01'])
    expect(out.links).toHaveLength(4)
  })
})

describe('saveErrors', () => {
  it('lists assemblies without parts, duplicate and blank marks, and bad sets', () => {
    const base = mergeDispatchNote(empty, [asm('C-01', 4), asm('B-01', 0)]).state
    const own = (mark: string) => ({ ...base.asm[0], key: `own-${mark}`, src: 'own' as const, mark, qty: 1 })
    const s: EditorState = { ...base, asm: [...base.asm, own('B-01'), own('  ')] }
    const e = saveErrors(s)
    expect(e.needsParts).toEqual(['C-01', 'B-01', 'B-01', '(no mark)'])
    expect(e.dupMarks).toEqual(['B-01'])
    expect(e.blankMarks).toBe(1)
    expect(e.badSets).toEqual(['B-01'])
    expect(canSave(e, s)).toBe(false)
  })

  it('lists parts missing a mark, profile, L or kg', () => {
    let s = mergePartList(mergeDispatchNote(empty, [asm('C-01', 4)]).state, [listPart('P103', { unit_weight_kg: null })]).state
    s = addLink(s, partKey(s, 'P103'), keyOf(s, 'C-01'))
    expect(saveErrors(s).incompleteParts).toEqual(['P103'])
  })

  it('lists a part mark used by two different parts', () => {
    let s = mergeDispatchNote(empty, [asm('C-01', 4)]).state
    s = { ...s, parts: [
      { key: 'x1', src: 'own', part_mark: 'TMP-01', profile: 'PL10', grade: 'SS400', length_mm: 100, unit_weight_kg: 1, no: null },
      { key: 'x2', src: 'own', part_mark: 'TMP-01', profile: 'PL12', grade: 'SS400', length_mm: 200, unit_weight_kg: 2, no: null },
    ] }
    s = addLink(addLink(s, 'x1', keyOf(s, 'C-01')), 'x2', keyOf(s, 'C-01'))
    const e = saveErrors(s)
    expect(e.dupPartMarks).toEqual(['TMP-01'])
    expect(canSave(e, s)).toBe(false)
  })

  it('allows saving when every assembly has complete parts', () => {
    let s = mergePartList(mergeDispatchNote(empty, [asm('C-01', 4)]).state, [listPart('P103')]).state
    s = addLink(s, partKey(s, 'P103'), keyOf(s, 'C-01'))
    expect(canSave(saveErrors(s), s)).toBe(true)
  })
})

describe('toPayload', () => {
  it('builds assemblies with parts per set from the links', () => {
    let s = mergePartList(mergeDispatchNote(empty, [asm('C-01', 4), asm('C-02', 2)]).state, [listPart('P102', { profile: 'PL25x400', length_mm: 400, unit_weight_kg: 31.4 })]).state
    s = addLink(s, partKey(s, 'P102'), keyOf(s, 'C-01'))
    s = addLink(s, partKey(s, 'P102'), keyOf(s, 'C-02'))
    s = { ...s, links: s.links.map(l => (l.asmKey === keyOf(s, 'C-01') ? { ...l, qty: 2 } : l)) }
    const out = toPayload(s)
    expect(out.map(a => [a.assembly_mark, a.qty, a.parts.map(p => [p.part_mark, p.qty, p.unit_weight_kg])])).toEqual([
      ['C-01', 4, [['P102', 2, 31.4]]],
      ['C-02', 2, [['P102', 1, 31.4]]],
    ])
  })
})

describe('diffAssemblies (latest saved → what I am about to save)', () => {
  it('lists changed, removed and added marks and part changes', () => {
    const theirs = [asm('C-01', 6, { parts: [P101, P102] }), asm('C-02', 2, { parts: [P102] }), asm('C-03', 1, { parts: [P101] })]
    const mine = [asm('C-01', 4, { parts: [P101, P102] }), asm('C-02', 2, { parts: [{ ...P102, qty: 3 }] }), asm('B-02', 1, { parts: [P101] })]
    expect(diffAssemblies(theirs, mine)).toEqual([
      { mark: 'C-01', kind: 'changed', changes: ['ชุด 6 → 4'] },
      { mark: 'C-02', kind: 'changed', changes: ['P102 ต่อชุด 2 → 3'] },
      { mark: 'C-03', kind: 'removed', changes: [] },
      { mark: 'B-02', kind: 'added', changes: [] },
    ])
  })

  it('is empty when nothing differs', () => {
    expect(diffAssemblies(SAVED, SAVED)).toEqual([])
  })
})

// Separate MAIN + ACC pre-shop (2026-11-25): Dispatch Note and Part List per slot, Part List rule as the Full shop page
describe('pre-shop MAIN / ACC slots', () => {
  const linked = (s: EditorState) => {
    let out = s
    for (const a of s.asm) for (const p of s.parts) out = addLink(out, p.key, a.key)
    return out
  }

  it('mergeDispatchNote with slot ACC tags new rows ACC', () => {
    const s = mergeDispatchNote(empty, [asm('X1', 1)], 'ACC').state
    expect(s.asm.map(a => [a.mark, a.slot])).toEqual([['X1', 'ACC']])
  })

  it('marks missing from the ACC Dispatch Note list only ACC rows', () => {
    let s = mergeDispatchNote(empty, [asm('RF5', 1)], 'MAIN').state
    s = mergeDispatchNote(s, [asm('X1', 1), asm('X2', 1)], 'ACC').state
    expect(mergeDispatchNote(s, [asm('X1', 1)], 'ACC').missing).toEqual(['X2'])
  })

  it('fromSaved keeps each assembly slot', () => {
    expect(fromSaved([asm('RF5', 1, { slot: 'MAIN' }), asm('X1', 1, { slot: 'ACC' })]).asm.map(a => a.slot)).toEqual(['MAIN', 'ACC'])
  })

  it('saveErrors separate: own row with no slot → noSlot [mark]; combined never asks', () => {
    const s: EditorState = { ...empty, asm: [{ key: 'o1', src: 'own', mark: 'RF9', qty: 1, name: null, length_mm: null, width_mm: null, height_mm: null, weight_kg: null, surface_area_m2: null }] }
    expect(saveErrors(s, 'separate').noSlot).toEqual(['RF9'])
    expect(saveErrors(s, 'combined').noSlot).toEqual([])
  })

  it('canSave is false while an assembly has no slot in separate mode', () => {
    const s = linked({ ...mergePartList(empty, [listPart('p1')], 'MAIN').state, asm: [{ key: 'o1', src: 'own', mark: 'RF9', qty: 1, name: null, length_mm: null, width_mm: null, height_mm: null, weight_kg: null, surface_area_m2: null }] })
    expect(canSave(saveErrors(s, 'separate'), s)).toBe(false)
    expect(canSave(saveErrors(s, 'combined'), s)).toBe(true)
  })

  it('toPayload sends assembly slot in separate mode, null in combined', () => {
    const s = linked({ ...mergeDispatchNote(empty, [asm('RF5', 1)], 'MAIN').state, parts: mergePartList(empty, [listPart('p1')], 'MAIN').state.parts })
    expect(toPayload(s, { mode: 'separate', bothPartLists: false })[0].slot).toBe('MAIN')
    expect(toPayload(s, { mode: 'combined', bothPartLists: false })[0].slot).toBeNull()
  })

  it("toPayload with both Part Lists sends each part's box slot; with one Part List sends null", () => {
    let s = mergeDispatchNote(empty, [asm('RF5', 1)], 'MAIN').state
    s = mergePartList(s, [listPart('p1')], 'MAIN').state
    s = mergePartList(s, [listPart('x9')], 'ACC').state
    s = linked(s)
    const both = toPayload(s, { mode: 'separate', bothPartLists: true })[0].parts
    expect(both.map(p => [p.part_mark, p.slot])).toEqual([['p1', 'MAIN'], ['x9', 'ACC']])
    const one = toPayload(s, { mode: 'separate', bothPartLists: false })[0].parts
    expect(one.every(p => p.slot == null)).toBe(true)
  })

  it('removing the ACC Part List removes only rows from that box', () => {
    let s = mergePartList(empty, [listPart('p1')], 'MAIN').state
    s = mergePartList(s, [listPart('x9')], 'ACC').state
    expect(removeFileRows(s, 'pl', 'ACC').parts.map(p => p.part_mark)).toEqual(['p1'])
  })

  it('removing the MAIN Dispatch Note removes only MAIN rows', () => {
    let s = mergeDispatchNote(empty, [asm('RF5', 1)], 'MAIN').state
    s = mergeDispatchNote(s, [asm('X1', 1)], 'ACC').state
    expect(removeFileRows(s, 'dn', 'MAIN').asm.map(a => a.mark)).toEqual(['X1'])
  })
})
