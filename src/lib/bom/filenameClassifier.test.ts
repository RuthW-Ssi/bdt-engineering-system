import { classifyFilename, DOC_TYPE_LABELS } from './filenameClassifier'

describe('classifyFilename', () => {
  it('a Dispatch Note filename is recognized before the assembly/part rules', () => {
    expect(classifyFilename('Dispatch Note.xlsx')).toBe('DISPATCH_NOTE')
    expect(classifyFilename('dispatch_note.xls')).toBe('DISPATCH_NOTE')
    expect(classifyFilename('DISPATCH-NOTE.xlsx')).toBe('DISPATCH_NOTE')
    expect(classifyFilename('dispatchnote.xlsx')).toBe('DISPATCH_NOTE')
    // even if the name also happens to contain "list" wording, DN wins
    expect(classifyFilename('MAIN Dispatch Note Part List.xlsx')).toBe('MAIN_DISPATCH_NOTE')
  })

  it('a Dispatch Note gets the same MAIN/ACC prefix branch as the Tekla lists (mirrors backend)', () => {
    expect(classifyFilename('MAIN Dispatch Note.xlsx')).toBe('MAIN_DISPATCH_NOTE')
    expect(classifyFilename('ACC Dispatch Note.xlsx')).toBe('ACC_DISPATCH_NOTE')
    expect(classifyFilename('Dispatch Note.xlsx')).toBe('DISPATCH_NOTE')
  })

  it('still classifies the Tekla lists when there is no Dispatch Note wording', () => {
    expect(classifyFilename('Assembly List.xlsx')).toBe('ASSEMBLY_LIST')
    expect(classifyFilename('Assembly Part List.xlsx')).toBe('ASSEMBLY_PART_LIST')
    expect(classifyFilename('Part List.xlsx')).toBe('PART_LIST')
    expect(classifyFilename('MAIN Assembly List.xlsx')).toBe('MAIN_ASSEMBLY_LIST')
    expect(classifyFilename('MAIN Assembly Part List.xlsx')).toBe('MAIN_ASSEMBLY_PART_LIST')
    expect(classifyFilename('MAIN Part List.xlsx')).toBe('MAIN_PART_LIST')
    expect(classifyFilename('ACC Assembly List.xlsx')).toBe('ACC_ASSEMBLY_LIST')
    expect(classifyFilename('ACC Assembly Part List.xlsx')).toBe('ACC_ASSEMBLY_PART_LIST')
    expect(classifyFilename('ACC Part List.xlsx')).toBe('ACC_PART_LIST')
  })

  it('unrecognized filenames return null', () => {
    expect(classifyFilename('random.xlsx')).toBeNull()
  })

  it('Dispatch Note labels are marked optional, Thai, no "แบบ"', () => {
    for (const key of ['DISPATCH_NOTE', 'MAIN_DISPATCH_NOTE', 'ACC_DISPATCH_NOTE'] as const) {
      expect(DOC_TYPE_LABELS[key]).toContain('ไม่ใส่ก็ได้')
      expect(DOC_TYPE_LABELS[key]).not.toContain('แบบ')
    }
  })
})
