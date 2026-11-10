import { groupPlateFiles, plateFileProblems, plateFileWarnings } from './cutting-plan-file-set'

const set = (base: string) => ['txt', 'xls', 'pdf', 'dxf'].map(e => `${base}.${e}`)

describe('groupPlateFiles', () => {
  it('groups four files per plate and sorts plates naturally (5 before 12)', () => {
    const g = groupPlateFiles([...set('222-B5-12-3'), ...set('222-B5-5-1')])
    expect(g.plates.map(p => p.plate)).toEqual(['222-B5-5-1', '222-B5-12-3'])
    expect(g.plates.every(p => p.missing.length === 0)).toBe(true)
    expect(plateFileProblems(g)).toEqual([])
  })

  it('pairs names that differ only by case or spaces (real Drive uploads)', () => {
    const g = groupPlateFiles(['222-A4-20-1 rev1.dxf', '222-A4-20-1rev1.pdf', '222-A4-20-1rev1.txt', '222-A4-20-1rev1.xls',
      'x190-z1-40-1.dxf', 'x190-z1-40-1.pdf', 'x190-z1-40-1.xls', 'X190-Z1-40-1.txt'])
    expect(g.plates).toHaveLength(2)
    expect(g.plates.map(p => p.plate)).toEqual(['222-A4-20-1rev1', 'X190-Z1-40-1']) // named after the .txt
    expect(plateFileProblems(g)).toEqual([])
  })

  // 2026-11-09 (Tao, option 1): only the .txt is required. Old uploads have real plates whose .pdf / .dxf
  // came out empty from CutLogic; they are saved, they just can't be opened in 3D / as PDF.
  it('blocks a wrong extension and a duplicate kind, but only warns about a missing .pdf', () => {
    const g = groupPlateFiles(['Z100-5-2.txt', 'Z100-5-2.xls', 'Z100-5-2.dxf', 'CP_2026.zip', 'WHA31-2 Part List.xlsx', ...set('A-1'), 'a-1.TXT'])
    expect(plateFileWarnings(g)).toEqual(['Plate Z100-5-2 has no .pdf (it can be saved, but that file cannot be opened)'])
    expect(plateFileProblems(g)).toEqual([
      'CP_2026.zip is not a .txt / .xls / .pdf / .dxf file',
      'WHA31-2 Part List.xlsx is not a .txt / .xls / .pdf / .dxf file',
      'a-1.TXT duplicates another file of the same type for the same plate',
    ])
  })

  it('a plate without its .txt is blocked: the .txt is the report the parser reads', () => {
    expect(plateFileProblems(groupPlateFiles(['lonely.pdf']))).toEqual(['Plate lonely has no .txt (every plate needs its .txt)'])
  })
})
