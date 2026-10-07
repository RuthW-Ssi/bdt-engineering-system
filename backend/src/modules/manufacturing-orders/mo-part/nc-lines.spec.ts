import { ncDetailsToLines } from './nc-lines'

const plate = (o: Record<string, unknown> = {}) => ({
  partMark: 'DBN-A-px9', grade: 'HY370', qty: 1, profileBase: 'PL10', lengthMm: 358.77, weightKg: 78.5,
  orderNo: '00X222-3', code: 'B', widthMm: 357.48, thicknessMm: 10, unitWeight: 78.5, areaM2: 0.0894,
  pieceWeightKg: 7.02, cutLengthMm: 1731.2, holes: [{ diameter_mm: 22, count: 4 }], ...o,
})

describe('ncDetailsToLines', () => {
  it('one line per part mark; plates get PL<t>x<width>, piece weight, holes and cut length', () => {
    const r = ncDetailsToLines([plate()])
    expect(r.lines).toEqual([{
      mark: null, part_mark: 'DBN-A-px9', profile: 'PL10x357.48', grade: 'HY370', length_mm: 358.77, qty: 1,
      unit_weight_kg: 7.02, holes: [{ diameter_mm: 22, count: 4 }], cut_length_mm: 1731.2,
    }])
    expect(r.warnings).toEqual([])
  })
  it('sections keep the NC profile', () => {
    const r = ncDetailsToLines([plate({ partMark: 'X-c1', code: 'I', profileBase: 'H200X100X5.5X8', widthMm: null, thicknessMm: null, pieceWeightKg: 184.2, cutLengthMm: null, holes: [] })])
    expect(r.lines[0]).toMatchObject({ profile: 'H200X100X5.5X8', unit_weight_kg: 184.2, cut_length_mm: null })
  })
  it('warns on files from another job, missing weight, and duplicate part marks (keeps the first)', () => {
    const r = ncDetailsToLines([plate(), plate({ partMark: 'B-1', orderNo: '00X999-1' }), plate({ partMark: 'C-1', pieceWeightKg: null }), plate()])
    expect(r.lines.map(l => l.part_mark)).toEqual(['DBN-A-px9', 'B-1', 'C-1'])
    expect(r.warnings).toEqual([
      'B-1: job 00X999-1 differs from 00X222-3 (most files)',
      'C-1: weight could not be computed — type it',
      'DBN-A-px9: appears twice — kept the first file',
    ])
  })
  it('skips a file with no qty or length', () => {
    const r = ncDetailsToLines([plate({ partMark: 'Z', qty: 0 })])
    expect(r.lines).toEqual([])
    expect(r.warnings).toEqual(['Z: missing qty or length — skipped'])
  })
})
