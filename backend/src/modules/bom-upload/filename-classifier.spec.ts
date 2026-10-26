import { classifyFilename } from './filename-classifier'

describe('classifyFilename', () => {
  describe('ASSEMBLY_PART_LIST', () => {
    it.each([
      'assembly_part_list.xlsx',
      'Assembly Part List.xlsx',
      'ASSEMBLY-PART-LIST.xls',
      'BOM_Assembly Part_List_v2.xlsx',
    ])('classifies "%s" correctly', (name) => {
      expect(classifyFilename(name)).toBe('ASSEMBLY_PART_LIST')
    })
  })

  describe('ASSEMBLY_LIST', () => {
    it.each([
      'assembly_list.xlsx',
      'Assembly List.xlsx',
      'ASSEMBLY-LIST.xls',
      'WH-CO_assembly_list_rev3.xlsx',
    ])('classifies "%s" correctly', (name) => {
      expect(classifyFilename(name)).toBe('ASSEMBLY_LIST')
    })
  })

  describe('PART_LIST', () => {
    it.each([
      'part_list.xlsx',
      'Part List.xlsx',
      'PART-LIST.xls',
      'structure_part_list_final.xlsx',
    ])('classifies "%s" correctly', (name) => {
      expect(classifyFilename(name)).toBe('PART_LIST')
    })
  })

  it('returns null for unrecognised filenames', () => {
    expect(classifyFilename('drawing.pdf')).toBeNull()
    expect(classifyFilename('bom.xlsx')).toBeNull()
    expect(classifyFilename('')).toBeNull()
  })

  it('prefers ASSEMBLY_PART_LIST over ASSEMBLY_LIST when both match', () => {
    // "assembly_part_list" contains "assembly_list" as substring — must pick the more specific one
    expect(classifyFilename('assembly_part_list.xlsx')).toBe('ASSEMBLY_PART_LIST')
  })

  it('classifies a Dispatch Note (optional 4th BOM file, 2026-10-26)', () => {
    expect(classifyFilename('1. DRIVING RANGE BANGNA ZONE 1 Dispatch Note Rev.2.xls')).toBe('DISPATCH_NOTE')
    expect(classifyFilename('dispatch_note.xlsx')).toBe('DISPATCH_NOTE')
  })

  it('a Dispatch Note with a MAIN/ACC prefix goes to that slot (separate mode, 2026-10-26)', () => {
    expect(classifyFilename('MAIN Z1 Dispatch Note.xls')).toBe('MAIN_DISPATCH_NOTE')
    expect(classifyFilename('main_dispatch_note.xlsx')).toBe('MAIN_DISPATCH_NOTE')
    expect(classifyFilename('ACC Z1 Dispatch-Note Rev.1.xls')).toBe('ACC_DISPATCH_NOTE')
    expect(classifyFilename('acc_dispatch_note.xlsx')).toBe('ACC_DISPATCH_NOTE')
  })
})
