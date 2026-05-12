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
})
