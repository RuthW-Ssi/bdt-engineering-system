import { describe, expect, it } from 'vitest'
import { historyView } from './moHistory'

const row = (reason: string, from = 'DRAFT', to = 'DRAFT') => ({ from_status: from, to_status: to, reason })

describe('historyView', () => {
  it('an upload: new marks with their values and parts, changes to an existing mark grouped by mark', () => {
    const v = historyView(row('เพิ่มข้อมูลจาก Pre-shop drawing (lot2.pdf): เพิ่ม BUH9 (ชุด 1, L 6000, kg/ชุด 900) · BUH9 part C-x1 PL20x300 SM520 L6000 ×2/ชุด 282.6 kg/ชิ้น · BUH1-3 ชุด 2 → 5 · BUH1-3 C-f1 profile PL25x400 → PL28x400 (มีผลกับ BUH1A-12 ด้วย) · BUH1-3 เพิ่ม C-p99 PL12x150 SS400 L300 ×4/ชุด 4.24 kg/ชิ้น · BUH1-3 ลบ test part · คำเตือนตอนอ่านไฟล์: b.pdf: skipped'))
    expect(v.kind).toBe('upload')
    expect(v.title).toBe('เพิ่มข้อมูลจาก Pre-shop drawing (lot2.pdf)')
    expect(v.warnings).toEqual(['b.pdf: skipped'])
    expect(v.groups).toEqual([
      { mark: 'BUH9', isNew: true, values: [{ field: 'ชุด', to: '1' }, { field: 'L', to: '6000' }, { field: 'kg/ชุด', to: '900' }],
        parts: [{ action: 'add', part_mark: 'C-x1', part: { part_mark: 'C-x1', profile: 'PL20x300', grade: 'SM520', length_mm: '6000', per_set: '2', kg: '282.6' }, changes: [] }] },
      { mark: 'BUH1-3', isNew: false, values: [{ field: 'ชุด', from: '2', to: '5' }],
        parts: [
          { action: 'change', part_mark: 'C-f1', changes: [{ field: 'Profile', from: 'PL25x400', to: 'PL28x400' }], note: 'มีผลกับ BUH1A-12 ด้วย' },
          { action: 'add', part_mark: 'C-p99', part: { part_mark: 'C-p99', profile: 'PL12x150', grade: 'SS400', length_mm: '300', per_set: '4', kg: '4.24' }, changes: [] },
          { action: 'remove', part_mark: 'test part', changes: [] },
        ] },
    ])
  })

  it('an existing mark whose first item adds a part (Thai word right after the mark)', () => {
    const v = historyView(row('เพิ่มข้อมูลจาก Pre-shop drawing (lot2.pdf): BUH1-3 เพิ่ม C-p99 PL12x150 SS400 L300 ×4/ชุด 4.24 kg/ชิ้น · BUH1A-12 ลบ test2'))
    expect(v.lines).toEqual([])
    expect(v.groups.map(g => [g.mark, g.parts.map(p => [p.action, p.part_mark])])).toEqual([['BUH1-3', [['add', 'C-p99']]], ['BUH1A-12', [['remove', 'test2']]]])
  })

  it('a compare with the real BOM', () => {
    const v = historyView(row('เทียบกับ BOM จริง (rev 1): BUH1-3 C-f1 profile PL28x400 → PL25x400 · BUH9 เก็บค่าเดิม (ไม่มีใน BOM) · เอา BUH7 ออกจาก MO · เพิ่ม BUH1C-20 (ชุด 2) จาก BOM · BUH1C-20 part C-f40 PL25x400 SM520 L9000 ×2/ชุด 706.5 kg/ชิ้น'))
    expect(v.kind).toBe('bom')
    expect(v.groups.map(g => [g.mark, g.isNew, g.values, g.parts.map(p => [p.action, p.part_mark])])).toEqual([
      ['BUH1-3', false, [], [['change', 'C-f1']]],
      ['BUH1C-20', true, [{ field: 'ชุด', to: '2' }], [['add', 'C-f40']]],
    ])
    expect(v.lines).toEqual(['BUH9 เก็บค่าเดิม (ไม่มีใน BOM)', 'เอา BUH7 ออกจาก MO'])
  })

  it('a mark renamed to its BOM name, linked, with a renamed part and the Rev bump', () => {
    const v = historyView(row('เทียบกับ BOM จริง (rev 1): C1-BUH1-3 ชื่อ mark BUH1-3 → C1-BUH1-3 · C1-BUH1-3 ผูกกับ BOM จริง · C1-BUH1-3 C-f1 ชื่อ C-f1 → P100 · Rev.1 → Rev.2'))
    expect(v.groups).toEqual([{ mark: 'C1-BUH1-3', isNew: false, values: [{ field: 'ชื่อ mark', from: 'BUH1-3', to: 'C1-BUH1-3' }],
      parts: [{ action: 'change', part_mark: 'C-f1', changes: [{ field: 'ชื่อ', from: 'C-f1', to: 'P100' }] }] }])
    expect(v.lines).toEqual(['C1-BUH1-3 ผูกกับ BOM จริง', 'Rev.1 → Rev.2'])
  })

  // every value (2026-10-09): name / W / H / area, a name may have spaces
  it('a new mark with every value, and value edits whose text has spaces', () => {
    const v = historyView(row('เพิ่มข้อมูลจาก Dispatch Note (DN.xls): เพิ่ม BUH9 (ชุด 4, Name BUILT-UP H, L 10550, W 400, H 1200, kg/ชุด 3561.15, area/ชุด 42.708) · BUH1-3 Name WEB → BUILT-UP H · BUH1-3 W — → 400 · BUH1-3 area/ชุด 42.708 → 43'))
    expect(v.groups).toEqual([
      { mark: 'BUH9', isNew: true, parts: [], values: [
        { field: 'ชุด', to: '4' }, { field: 'Name', to: 'BUILT-UP H' }, { field: 'L', to: '10550' }, { field: 'W', to: '400' },
        { field: 'H', to: '1200' }, { field: 'kg/ชุด', to: '3561.15' }, { field: 'area/ชุด', to: '42.708' }] },
      { mark: 'BUH1-3', isNew: false, parts: [], values: [
        { field: 'Name', from: 'WEB', to: 'BUILT-UP H' }, { field: 'W', from: '—', to: '400' }, { field: 'area/ชุด', from: '42.708', to: '43' }] },
    ])
  })

  it('a parts edit takes its mark from the title', () => {
    const v = historyView(row('แก้ part BUH1-3: C-f1 ต่อชุด 2 → 3 · C-f1 L 10550 → 10600 · ลบ C-wx58'))
    expect(v.kind).toBe('parts')
    expect(v.groups[0].mark).toBe('BUH1-3')
    expect(v.groups[0].parts).toEqual([
      { action: 'change', part_mark: 'C-f1', changes: [{ field: 'ต่อชุด', from: '2', to: '3' }, { field: 'L', from: '10550', to: '10600' }] },
      { action: 'remove', part_mark: 'C-wx58', changes: [] },
    ])
  })

  it('MO edits, status changes and old short upload lines', () => {
    expect(historyView(row('แก้ไข MO: Routing — → RT-0018'))).toMatchObject({ kind: 'edit', lines: ['Routing — → RT-0018'], groups: [] })
    expect(historyView(row('ok', 'DRAFT', 'CONFIRMED'))).toMatchObject({ kind: 'status', title: 'DRAFT → CONFIRMED', lines: ['ok'] })
    expect(historyView(row('เพิ่มข้อมูลจาก Dispatch Note: เพิ่ม BUH1-3 (2)')).groups).toEqual([{ mark: 'BUH1-3', isNew: true, values: [{ field: 'ชุด', to: '2' }], parts: [] }])
    expect(historyView(row('สร้าง MO (Pre-shop)'))).toMatchObject({ kind: 'create', title: 'สร้าง MO (Pre-shop)' })
    expect(historyView(row('สร้าง WO-IN-26000009 (Operation 000 · 1 mark: BUH1-3 ×2)'))).toMatchObject({ kind: 'wo', title: 'สร้าง WO-IN-26000009 (Operation 000 · 1 mark: BUH1-3 ×2)', lines: [] })
  })
})
