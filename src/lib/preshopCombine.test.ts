import { describe, expect, it } from 'vitest'
import { combine, notInDispatchNote, removeFile, resolve } from './preshopCombine'

const P = { part_mark: 'C-f1', profile: 'PL25x400', length_mm: 10550, grade: 'SM520', qty: 2, unit_weight_kg: 828.17 }
const row = (m: string, qty: number, L: number | null, kg: number | null, parts = [] as typeof P[]) => ({ assembly_mark: m, qty, length_mm: L, weight_kg: kg, surface_area_m2: null, parts })
const DN = [row('BUH1-3', 2, 10550, 3561.15), row('BUH1A-14', 5, 8550, 2629.5)]
const PDF = [row('BUH1-3', 0, 10550, 3561.15, [P]), row('BUH1A-14', 0, 8550, 2617.58, [P]), row('BUH1B-18', 0, 13975, 5454.93, [P])]
const fDN = () => 'DN.xls'
const fPDF = () => 'pre.pdf'

describe('Dispatch Note + pre-shop drawing combined', () => {
  it('sets from the Dispatch Note, parts from the drawing, disagreeing kg as a conflict; drawing-only marks come in', () => {
    const rows = combine(combine([], DN, 'DN', fDN), PDF, 'PDF', fPDF)
    expect(rows.map(r => [r.assembly_mark, r.qty, r.weight_kg, r.parts.length, r.conflicts])).toEqual([
      ['BUH1-3', 2, 3561.15, 1, []],
      ['BUH1A-14', 5, 2629.5, 1, ['weight_kg']],
      ['BUH1B-18', 0, 5454.93, 1, []],
    ])
    expect(notInDispatchNote(rows)).toEqual(new Set(['BUH1B-18']))
  })

  it('the same in the other order', () => {
    const rows = combine(combine([], PDF, 'PDF', fPDF), DN, 'DN', fDN)
    expect(rows.map(r => [r.assembly_mark, r.qty, r.parts.length, r.conflicts])).toEqual([
      ['BUH1-3', 2, 1, []], ['BUH1A-14', 5, 1, ['weight_kg']], ['BUH1B-18', 0, 1, []],
    ])
  })

  // bug 2026-10-09: the Dispatch Note's Name was lost when it came after the drawing
  it('the name comes from the Dispatch Note, in either order', () => {
    const named = DN.map(r => ({ ...r, name: 'WEB' }))
    const pdfFirst = combine(combine([], PDF, 'PDF', fPDF), named, 'DN', fDN)
    const dnFirst = combine(combine([], named, 'DN', fDN), PDF, 'PDF', fPDF)
    for (const rows of [pdfFirst, dnFirst]) expect(rows.find(r => r.assembly_mark === 'BUH1-3')?.name).toBe('WEB')
  })

  it('W / H / area from the Dispatch Note; an area the drawing disagrees on is a conflict', () => {
    const dn = DN.map(r => ({ ...r, width_mm: 400, height_mm: 1200, surface_area_m2: 42.708 }))
    const pdf = PDF.map(r => ({ ...r, surface_area_m2: r.assembly_mark === 'BUH1-3' ? 42.5 : null }))
    const rows = combine(combine([], pdf, 'PDF', fPDF), dn, 'DN', fDN)
    const b = rows.find(r => r.assembly_mark === 'BUH1-3')!
    expect([b.width_mm, b.height_mm]).toEqual([400, 1200])
    expect(b.conflicts).toContain('surface_area_m2')
    expect(rows.find(r => r.assembly_mark === 'BUH1A-14')!.surface_area_m2).toBe(42.708)
  })

  it('a pick clears the conflict', () => {
    const rows = combine(combine([], DN, 'DN', fDN), PDF, 'PDF', fPDF)
    const r = resolve(rows[1], 'weight_kg', 2617.58)
    expect([r.weight_kg, r.conflicts]).toEqual([2617.58, []])
  })

  it('removing a file leaves what the other file says', () => {
    const rows = combine(combine([], DN, 'DN', fDN), PDF, 'PDF', fPDF)
    expect(removeFile(rows, 'pre.pdf').map(r => [r.assembly_mark, r.qty, r.weight_kg, r.parts.length, r.conflicts])).toEqual([
      ['BUH1-3', 2, 3561.15, 0, []], ['BUH1A-14', 5, 2629.5, 0, []],
    ])
    expect(removeFile(rows, 'DN.xls').map(r => [r.assembly_mark, r.qty, r.weight_kg, r.parts.length])).toEqual([
      ['BUH1-3', 0, 3561.15, 1], ['BUH1A-14', 0, 2617.58, 1], ['BUH1B-18', 0, 5454.93, 1],
    ])
  })
})
