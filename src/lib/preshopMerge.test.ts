import { describe, expect, it } from 'vitest'
import { autoChoice, choiceErrors, finalAssembly, pickedKind, unchosen, versionDiff } from './preshopMerge'

const P = { part_mark: 'C-f1', profile: 'PL25x400', length_mm: 10550, grade: 'SM520', qty: 2, unit_weight_kg: 828.17 }
const OLD = { qty: 2, length_mm: 10550, weight_kg: 3561.15, parts: [{ ...P, part_mark: 'test part' }], wo_qty: 1, wo_parts: [] as string[] }
const NEW = { assembly_mark: 'BUH1-3', qty: 1, length_mm: 10550, weight_kg: 3561.15, surface_area_m2: null, parts: [P] }

describe('preshop merge choices', () => {
  it('pre-picks values that match; sets always wait for the user', () => {
    const c = autoChoice(OLD, NEW)
    expect(c).toEqual({ name: null, length_mm: 10550, width_mm: null, height_mm: null, weight_kg: 3561.15, surface_area_m2: null })
    expect(unchosen(c)).toEqual(['ชุด', 'part'])
    // a Dispatch Note (no parts) keeps the MO's parts
    expect(autoChoice(OLD, { ...NEW, parts: [] }).parts).toEqual(OLD.parts)
  })

  // every value is compared (2026-10-09, user: "ต้องเปรียบเทียบกันทุกค่า")
  it('name, W, H and area are picked like L and kg', () => {
    const was = { ...OLD, name: 'WEB', width_mm: 400, height_mm: 1200, surface_area_m2: 42.708 }
    const c = autoChoice(was, { ...NEW, parts: OLD.parts, name: 'BUILT-UP H', width_mm: 400, height_mm: 1250, surface_area_m2: 42.708 })
    expect(c).toMatchObject({ width_mm: 400, surface_area_m2: 42.708 })
    expect(unchosen(c)).toEqual(['ชุด', 'Name', 'H'])
  })

  it('a file without a value keeps the MO\'s (a PDF has no name / W / H) · the real BOM must be picked', () => {
    const was = { ...OLD, name: 'WEB', width_mm: 400, height_mm: 1200, surface_area_m2: 42.708 }
    const pdf = { ...NEW, parts: OLD.parts, name: null, width_mm: null, height_mm: null, surface_area_m2: 42.708 }
    expect(unchosen(autoChoice(was, pdf))).toEqual(['ชุด'])
    expect(unchosen(autoChoice(was, pdf, 'bom'))).toEqual(['ชุด', 'Name', 'W', 'H'])
  })

  // bug 2026-10-09: with the BOM's sets equal to the MO's, "BOM จริง" could never be selected
  it('the card the user clicked stays selected even when two cards hold the same value', () => {
    expect(pickedKind({ qty: 1, from: { qty: 'new' } }, 'qty', { old: 1, new: 1 })).toBe('new')
    expect(pickedKind({ qty: 1 }, 'qty', { old: 1, new: 1 })).toBe('old') // pre-picked: the MO's
    expect(pickedKind({ qty: 7 }, 'qty', { old: 1, new: 2, lot: 3 })).toBe('own')
    expect(pickedKind({}, 'qty', { old: 1, new: 1 })).toBeNull()
    expect(finalAssembly(NEW, { qty: 1, from: { qty: 'new' } })).not.toHaveProperty('from')
  })

  it('refuses sets under the WO floor and dropping a part on a WO', () => {
    expect(choiceErrors('BUH1-3', OLD, { qty: 0 })).toEqual(['BUH1-3: จำนวนชุดต้องมากกว่า 0'])
    expect(choiceErrors('BUH1-3', { ...OLD, wo_qty: 2 }, { qty: 1 })).toEqual(['BUH1-3: ออก WO ไปแล้ว 2 ชุด — ต่ำกว่านี้ไม่ได้'])
    expect(choiceErrors('BUH1-3', { ...OLD, wo_parts: ['test part'] }, { parts: [P] })).toEqual(['BUH1-3: test part มีใน WO แล้ว — เอาออกไม่ได้'])
  })

  it('builds the saved assembly from the choices', () => {
    expect(finalAssembly(NEW, { qty: 3, length_mm: 9000, weight_kg: 3561.15, parts: OLD.parts })).toEqual({ ...NEW, qty: 3, length_mm: 9000, parts: OLD.parts })
    expect(finalAssembly({ ...NEW, name: 'X', width_mm: 1 }, { name: 'WEB', width_mm: 400, height_mm: 1200, surface_area_m2: 42.708 }))
      .toMatchObject({ name: 'WEB', width_mm: 400, height_mm: 1200, surface_area_m2: 42.708 })
  })
})

describe('versionDiff', () => {
  it('lists every value that differs', () => {
    expect(versionDiff({ name: 'WEB', width_mm: 400, parts: [] }, { name: 'BUILT-UP H', width_mm: 450, surface_area_m2: 42.7, parts: [] })).toEqual([
      { kind: 'change', text: 'Name WEB → BUILT-UP H' },
      { kind: 'change', text: 'W 400 → 450' },
      { kind: 'change', text: 'area/ชุด — → 42.7' },
    ])
  })

  it('lists L / kg, changed, removed and added parts', () => {
    const was = { length_mm: 10550, weight_kg: 3561.15, parts: [P, { ...P, part_mark: 'C-x' }] }
    const now = { length_mm: 10600, weight_kg: 3561.15, parts: [{ ...P, length_mm: 10600 }, { ...P, part_mark: 'C-st5', profile: 'PL12x150', length_mm: 300, qty: 4 }] }
    expect(versionDiff(was, now)).toEqual([
      { kind: 'change', text: 'L 10550 → 10600' },
      { kind: 'change', text: 'C-f1: L 10550 → 10600' },
      { kind: 'remove', text: 'C-x ไม่มีใน version ใหม่' },
      { kind: 'add', text: 'C-st5 PL12x150 L300 ×4/ชุด (ใหม่)' },
    ])
  })
})
