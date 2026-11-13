import { describe, expect, it } from 'vitest'
import { classifyShapeFiles } from './shapeFiles'

// The user's folder "Cutting plan shape - 0X222 Driving Bangna BIF-Colum zone 3 revise 17 June 2026"
const ZONE3 = [
  'BIF PIPE COLUMN ZONE 3 Part List.xls',
  'CP-0X222 Driving Bangna - BIF Column zone 3 revise - PIPE 101.6X2.6-HSS550.pdf',
  'CP-0X222 Driving Bangna - BIF Column zone 3 revise -PIPE 113.5X2.4-HSS550.pdf',
  'CP-0X222 Driving Bangna - BIF Column zone 3 revise -PIPE 139.8X3.2-HSS550.pdf',
  'CP-0X222 Driving Bangna - BIF Column zone 3 revise -PIPE 165.2x4.5-HSS500.pdf',
  'PS-0X222 Driving Bangna - BIF Column zone 3 revise - PIPE 101.6X2.6-HSS550.pdf',
  'PS-0X222 Driving Bangna - BIF Column zone 3 revise -PIPE 113.5X2.4-HSS550.pdf',
  'PS-0X222 Driving Bangna - BIF Column zone 3 revise -PIPE 139.8X3.2-HSS550.pdf',
  'PS-0X222 Driving Bangna - BIF Column zone 3 revise -PIPE 165.2x4.5-HSS500.pdf',
]

describe('classifyShapeFiles', () => {
  it('keeps the CP PDFs and leaves PS PDFs and Part Lists out', () => {
    const r = classifyShapeFiles(ZONE3)
    expect(r.cp).toHaveLength(4)
    expect(r.notUsed).toHaveLength(5)
    expect(r.rejected).toEqual([])
  })
  it('rejects any other file', () => {
    expect(classifyShapeFiles(['Z1.dxf', 'notes.txt']).rejected).toEqual(['Z1.dxf', 'notes.txt'])
  })
  it('names a CP file by its size', () => {
    expect(classifyShapeFiles(ZONE3).cp[3]).toEqual({ name: ZONE3[4], size: 'PIPE 165.2X4.5' })
  })
})
