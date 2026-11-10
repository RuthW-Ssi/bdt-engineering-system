import * as fs from 'fs'
import * as path from 'path'
import {
  normaliseProfile, parseCutLogic, pdfLines, planProblems, profileFromFileName, shapeFingerprint, ShapeReportError,
} from './cutlogic-parser'

// Real CutLogic 1D cutting-layout PDFs from the supply-chain folders (0X222 Driving Bangna, June 2026)
const fixture = (name: string) => fs.readFileSync(path.join(__dirname, '__fixtures__', name))
const parse = async (name: string) => parseCutLogic(await pdfLines(fixture(name)))

describe('parseCutLogic', () => {
  it('reads plan #668 (PIPE 113.5X2.4, zone 3): totals and the first layouts', async () => {
    const p = await parse('cp-pipe-113.5x2.4-zone3.pdf')
    expect(p).toMatchObject({ planNo: 668, profile: 'PIPE 113.5X2.4', grade: 'HSS550', kerfMm: 12, yieldPct: 93.77, stocks: 22, parts: 47, layoutsCount: 5 })
    expect(p.layouts).toHaveLength(5)
    expect(p.layouts[0]).toMatchObject({ seq: 1, stockNo: 1, stockLengthMm: 6013, restMm: 0, repeat: 10 })
    expect(p.layouts[0].parts).toEqual([
      { partNo: 4, mark: 'DBN-A3-m76', lengthMm: 3400.71, count: 1 },
      { partNo: 2, mark: 'DBN-A3-m72', lengthMm: 2598.78, count: 1 },
    ])
    expect(p.layouts[1]).toMatchObject({ restMm: 227.72, repeat: 6 })
  })

  it('keeps both stock lengths of plan #667 (PIPE 101.6X2.6)', async () => {
    const p = await parse('cp-pipe-101.6x2.6-zone3.pdf')
    expect([...new Set(p.layouts.map(l => l.stockLengthMm))].sort((a, b) => a - b)).toEqual([6013, 12500])
    expect(p.layouts.some(l => l.stockNo === 2)).toBe(true)
  })

  it('reads a ROD plan (#679, 7 pages) and its grade from the title-less Note 2', async () => {
    const p = await parse('cp-rod-rb25-all.pdf')
    expect(p).toMatchObject({ planNo: 679, profile: 'ROD RB25', grade: 'SS400', kerfMm: 10, stocks: 389, parts: 588 })
    expect(p.layouts).toHaveLength(38)
    expect(p.layouts[0].repeat).toBe(252)
  })

  it('normalises PIPEØ139.8X3.2 in the title of plan #669', async () => {
    expect((await parse('cp-pipe-139.8x3.2-zone3.pdf')).profile).toBe('PIPE 139.8X3.2')
  })

  it('strips the meaningless * around marks', async () => {
    const p = await parse('cp-pipe-113.5x2.4-zone3.pdf')
    expect(p.layouts.flatMap(l => l.parts).every(x => !x.mark.includes('*'))).toBe(true)
  })

  it('refuses text that is not a CutLogic cutting layout', () => {
    expect(() => parseCutLogic(['hello'])).toThrow(ShapeReportError)
    try { parseCutLogic(['hello']) } catch (e) { expect((e as ShapeReportError).problems).toEqual(['Not a CutLogic 1D cutting layout']) }
  })
})

describe('planProblems', () => {
  it('finds nothing wrong in the real plans', async () => {
    for (const f of ['cp-pipe-113.5x2.4-zone3.pdf', 'cp-pipe-101.6x2.6-zone3.pdf', 'cp-rod-rb25-all.pdf', 'cp-pipe-139.8x3.2-zone3.pdf']) {
      expect(planProblems(await parse(f))).toEqual([])
    }
  })

  it('reports stocks that do not add up', async () => {
    const p = await parse('cp-pipe-113.5x2.4-zone3.pdf')
    p.layouts[0].repeat = 11
    expect(planProblems(p)).toContain('Stocks: layouts add up to 23, the report says 22')
  })
})

describe('profiles', () => {
  it('normalises case, Ø and spaces', () => {
    expect(normaliseProfile('PIPEØ139.8X3.2')).toBe('PIPE 139.8X3.2')
    expect(normaliseProfile('PIPE 165.2x4.5')).toBe('PIPE 165.2X4.5')
    expect(normaliseProfile('ROD  RB25')).toBe('ROD RB25')
  })

  it('profile mismatch only on real difference: file name and title agree after normalising', () => {
    const fromName = profileFromFileName('CP-0X222 Driving Bangna - BIF Column zone 3 revise -PIPE 139.8X3.2-HSS550.pdf')
    expect(fromName).toBe('PIPE 139.8X3.2')
    expect(normaliseProfile('PIPEØ139.8X3.2')).toBe(fromName)
    expect(profileFromFileName('CP-0X222 DRIVING BANGNA - BIF column zone1 revise - PIPE 113.5X2.4 -HSS550.pdf')).toBe('PIPE 113.5X2.4')
    expect(profileFromFileName('CP-0X222 Driving Range Bangna - BIF all rod 25 -  ROD RB25-SS400.pdf')).toBe('ROD RB25')
  })
})

describe('shapeFingerprint', () => {
  it('ignores the printed footer date', () => {
    const a = ['Cutting layouts', 'Plan #1 - PIPE 1X1', '6/17/2026 11:01 AM CutLogic 1D, www.tmachines.com Page 1 of 1']
    const b = ['Cutting layouts', 'Plan #1 - PIPE 1X1', '7/01/2026 09:00 AM CutLogic 1D, www.tmachines.com Page 1 of 1']
    expect(shapeFingerprint(a)).toBe(shapeFingerprint(b))
    expect(shapeFingerprint(a)).not.toBe(shapeFingerprint(['Cutting layouts', 'Plan #2 - PIPE 1X1']))
  })
})
