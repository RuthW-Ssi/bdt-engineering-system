import * as fs from 'fs'
import * as path from 'path'
import { BadRequestException } from '@nestjs/common'
import { CuttingPlanTestService } from './cutting-plan-test.service'
import * as optimizer from './shape-optimizer'

const svc = new CuttingPlanTestService()

describe('CuttingPlanTestService', () => {
  it('no file / not a part list → 400', () => {
    expect(() => svc.parse(undefined)).toThrow(new BadRequestException('A part list (.xls / .xlsx) is required'))
    expect(() => svc.parse(Buffer.from('nope'))).toThrow(BadRequestException)
  })

  it('reads the real part list', () => {
    expect(svc.parse(fs.readFileSync(path.join(__dirname, '__fixtures__', 'part-list-0x222-np-zone3.xls'))).pieces).toBe(1578)
  })

  it('optimizer refusals and the piece limit are 400s', async () => {
    await expect(svc.optimize({ kerfMm: 12, parts: [{ mark: 'X', lengthMm: 13000, count: 1 }], stock: [{ lengthMm: 12500 }] }))
      .rejects.toThrow(new BadRequestException('X (13,000 mm) is longer than every stock length'))
    await expect(svc.optimize({ kerfMm: 12, parts: [{ mark: 'X', lengthMm: 100, count: 20001 }], stock: [{ lengthMm: 6000 }] }))
      .rejects.toThrow(new BadRequestException('More than 20000 pieces in one size'))
  })

  it('a layout for a small size', async () => {
    const r = await svc.optimize({ kerfMm: 12, parts: [{ mark: 'A', lengthMm: 3000, count: 4 }], stock: [{ lengthMm: 6013, qty: null }] })
    // 2 × 3,000 + 12 ends 1 mm short of the bar: that stub is still a cut (audit 2026-11-12), so 2 cuts per bar
    expect(r).toMatchObject({ stocks: 2, cuts: 4, layouts: [{ stockLengthMm: 6013, repeat: 2, pieces: [{ lengthMm: 3000, count: 2 }], marks: [{ mark: 'A', lengthMm: 3000, pcs: 4 }] }] })
  })

  // live 2026-11-11: five BOM zones together gave PIPE 113.5X2.4 > 300 marks; the optimizer works on distinct lengths
  it('many marks are fine; the limit is on distinct lengths', async () => {
    const parts = Array.from({ length: 400 }, (_, i) => ({ mark: `M${i}`, lengthMm: 1000 + (i % 5), count: 1 }))
    await expect(svc.optimize({ kerfMm: 12, parts, stock: [{ lengthMm: 6013 }] })).resolves.toMatchObject({ partsLengthMm: expect.any(Number) })
    const many = Array.from({ length: 301 }, (_, i) => ({ mark: `M${i}`, lengthMm: 1000 + i, count: 1 }))
    await expect(svc.optimize({ kerfMm: 12, parts: many, stock: [{ lengthMm: 6013 }] }))
      .rejects.toThrow(new BadRequestException('More than 300 different part lengths in one size'))
  })

  // Tao 2026-11-12 POC: saddle nesting / model length from the project's end cuts
  describe('saddle options', () => {
    const deg = Array.from({ length: 361 }, (_, i) => (i * Math.PI) / 180)
    const left = deg.map(t => 50 * (1 + Math.cos(t))), right = deg.map(t => 1000 - 50 * (1 + Math.cos(t)))
    const cut = { L: 'saddle', R: 'saddle', depthLMm: 100, depthRMm: 100, instances: 1, variants: 1, spreadMm: 0, cutLengthMm: 1000, grids: { LW: left, LN: left, RW: right, RN: right } }
    const ends = { endCuts: jest.fn(async () => ({ source: 'X.ifc', marks: { S1: cut } })) }
    const withEnds = new CuttingPlanTestService(ends as never)
    const body = { kerfMm: 12, parts: [{ mark: 'S1', lengthMm: 1000, count: 3 }], stock: [{ lengthMm: 2900 }] }

    // Tao 2026-11-12: lengths as BdtPipeCut cuts them (its NC is drawn from the model's end cuts, tested on the machine),
    // in both modes; a mark not in the model keeps its BOM length
    const inset = { ...cut, grids: { LW: left.map(v => v + 20), LN: left.map(v => v + 20), RW: right.map(v => v - 20), RN: right.map(v => v - 20) } }
    const insetEnds = { endCuts: jest.fn(async () => ({ source: 'X.ifc', marks: { S2: { ...inset, cutLengthMm: 960 }, P1: null } })) }
    const bdt = new CuttingPlanTestService(insetEnds as never)

    it('tip to tip: a saddle piece is laid out at its cut length, not its BOM length, and the notes say so', async () => {
      const r = await bdt.optimize({ kerfMm: 12, parts: [{ mark: 'S2', lengthMm: 1000, count: 3 }, { mark: 'P1', lengthMm: 500, count: 1 }], stock: [{ lengthMm: 2910 }, { lengthMm: 6013 }], project_id: 7 })
      expect(insetEnds.endCuts).toHaveBeenCalledWith(7, ['S2', 'P1'])
      const pcs = (mark: string, len: number) => r.layouts.flatMap(l => l.marks).filter(m => m.mark === mark && m.lengthMm === len).reduce((n, m) => n + m.pcs, 0)
      expect([pcs('S2', 960), pcs('P1', 500)]).toEqual([3, 1])
      expect(r.partsLengthMm).toBe(3 * 960 + 500)
      expect(r.notes).toEqual(['End cuts from X.ifc', 'Lengths as BdtPipeCut cuts them: 1 of 2 marks, up to 40 mm shorter than the BOM', 'Not in the model, BOM length kept: P1'])
    })

    it('nest: fewer stocks, and notes say what was used', async () => {
      const r = await withEnds.optimize({ ...body, project_id: 7, saddleNest: true })
      expect(ends.endCuts).toHaveBeenCalledWith(7, ['S1'])
      expect(r.stocks).toBe(1)
      expect(r.layouts[0].nestMm).toEqual([100, 100])
      expect(r.notes).toEqual(['End cuts from X.ifc', 'Saddle nesting: 1 of 1 lengths (3 of 3 pcs) can nest, up to 100 mm per joint'])
    })

    // Tao 2026-11-13: nest is never worse than tip to tip — when the nest plan takes more steel, the tip plan is shown
    describe('nest never worse than tip to tip', () => {
      const plan = (stockLengthMm: number, timedOut = false) => ({ stocks: 1, stockLengthMm, partsLengthMm: 3000, scrapMm: 0, kerfMm: 0, nestedMm: 0, yieldPct: 0, cuts: 0, stockMix: [], layouts: [], method: 'mip' as const, timedOut })
      afterEach(() => jest.restoreAllMocks())

      it('nest takes more steel: the tip plan comes back, and the notes say so', async () => {
        const spy = jest.spyOn(optimizer, 'optimizeShape').mockImplementation(async (_p, _s, _k, opts) => (opts?.creditMm ? plan(12_500, true) : plan(12_000)))
        const r = await withEnds.optimize({ ...body, project_id: 7, saddleNest: true })
        expect(spy).toHaveBeenCalledTimes(2)
        expect(r.stockLengthMm).toBe(12_000)
        expect(r.timedOut).toBe(false)
        expect(r.notes).toContain('Nest saddles took more steel here (12.5 m vs 12 m): tip-to-tip layouts shown')
        expect(r.tipToTip).toBeUndefined()
      })

      it('nest takes less or the same: the nest plan stays', async () => {
        jest.spyOn(optimizer, 'optimizeShape').mockImplementation(async (_p, _s, _k, opts) => (opts?.creditMm ? plan(12_000) : plan(12_000)))
        const r = await withEnds.optimize({ ...body, project_id: 7, saddleNest: true })
        expect(r.notes?.some(n => n.startsWith('Nest saddles took more steel'))).toBe(false)
        expect(r.tipToTip).toEqual({ stocks: 1, stockLengthMm: 12_000 }) // what tip to tip would take, for the screen
      })

      it('both runs share one deadline', async () => {
        const spy = jest.spyOn(optimizer, 'optimizeShape').mockImplementation(async () => plan(12_000))
        const t = Date.now()
        await withEnds.optimize({ ...body, project_id: 7, saddleNest: true })
        const [nest, tip] = spy.mock.calls.map(c => c[3]!.deadline!)
        expect(nest).toBeLessThan(tip)
        expect(tip - t).toBeLessThanOrEqual(120_000 + 1_000)
      })
    })

    it('a part list (no project): BOM lengths, the end cuts are not asked for', async () => {
      ends.endCuts.mockClear()
      const r = await withEnds.optimize(body)
      expect(r.stocks).toBe(2)
      expect(ends.endCuts).not.toHaveBeenCalled()
    })

    it('no end-cut data for the project: BOM lengths, and said so', async () => {
      const none = new CuttingPlanTestService({ endCuts: async () => ({ source: null, marks: { S1: null } }) } as never)
      const r = await none.optimize({ ...body, project_id: 7, saddleNest: true })
      expect(r.stocks).toBe(2)
      expect(r.notes).toEqual(['No end-cut data for this project: BOM lengths, no saddle nesting'])
    })
  })
})
