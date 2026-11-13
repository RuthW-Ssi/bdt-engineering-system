import { endLines, pairSaving, prepareSaddles } from './saddle'
import { optimizeShape } from './shape-optimizer'
import type { EndCut } from './end-cuts'

// A plane cut slanted by d across the pipe: tip at 180°. Two such ends turned 180° to each other share the slant,
// so the next piece starts d earlier than tip-to-tip (a mitre, the simplest "saddle").
const deg = Array.from({ length: 361 }, (_, i) => (i * Math.PI) / 180)
function slanted(L: number, d: number, kinds: [string, string] = ['saddle', 'saddle']): EndCut {
  const left = deg.map(t => (d * (1 + Math.cos(t))) / 2)
  const right = deg.map(t => L - (d * (1 + Math.cos(t))) / 2)
  return { L: kinds[0], R: kinds[1], depthLMm: d, depthRMm: d, instances: 1, variants: 1, spreadMm: 0, cutLengthMm: L, grids: { LW: left, LN: left, RW: right, RN: right } }
}
const square = (L: number, kinds: [string, string] = ['slot', 'slot']): EndCut => {
  const z = Array(361).fill(0), l = Array(361).fill(L)
  return { L: kinds[0], R: kinds[1], depthLMm: 0, depthRMm: 0, instances: 1, variants: 1, spreadMm: 0, cutLengthMm: L, grids: { LW: z, LN: z, RW: l, RN: l } }
}

describe('pairSaving', () => {
  it('two mitred ends turned to each other: the next piece starts d earlier, still a kerf apart', () => {
    const r = pairSaving(endLines(slanted(1000, 100)), endLines(slanted(1000, 100)), 12)
    expect(r.savingMm).toBeCloseTo(100, 6)
    expect(r.turnDeg).toBe(180)
  })
  it('square ends save nothing', () => {
    expect(pairSaving(endLines(square(500)), endLines(square(500)), 12).savingMm).toBeCloseTo(0, 6)
  })
})

describe('prepareSaddles', () => {
  const parts = [{ mark: 'S1', lengthMm: 1009.5, count: 3 }, { mark: 'S2', lengthMm: 800, count: 2 }, { mark: 'T1', lengthMm: 800, count: 1 }, { mark: 'X1', lengthMm: 300, count: 4 }]
  const ends = { S1: slanted(1000, 100), S2: slanted(800, 60), T1: square(800), X1: null }

  it('nest: a length\'s credit is the least any saddle piece gains after any saddle piece; a non-saddle mark of that length voids it', () => {
    const r = prepareSaddles(parts, ends, 12)
    expect(r.parts).toEqual(parts)
    expect(r.creditMm.get(1009.5)).toBeCloseTo(60, 0) // after S2 (slant 60) S1 can only tuck in 60
    expect(r.creditMm.has(800)).toBe(false) // T1 (slot) is also 800 mm
    expect(r.notes).toContain('Saddle nesting: 1 of 3 lengths (3 of 10 pcs) can nest, up to 60 mm per joint')
  })

  // the lengths come in already set (the service lays a mark out at BdtPipeCut's cut length); nesting never changes them
  it('lengths are passed through unchanged', () => {
    expect(prepareSaddles(parts, ends, 12).parts).toEqual(parts)
  })

  it('marks not found in the model are listed', () => {
    expect(prepareSaddles(parts, ends, 12).notes).toContain('Not in the model, laid out as before: X1')
  })
})

describe('optimizeShape with nesting credit', () => {
  it('pieces that nest share a stock they could not share tip-to-tip; the joints and the rest say so', async () => {
    const parts = [{ mark: 'S1', lengthMm: 1000, count: 3 }]
    const plain = await optimizeShape(parts, [{ lengthMm: 2900, qty: null }], 12)
    expect(plain.stocks).toBe(2)
    const nested = await optimizeShape(parts, [{ lengthMm: 2900, qty: null }], 12, { creditMm: new Map([[1000, 100]]) })
    expect(nested.stocks).toBe(1)
    expect(nested.layouts[0]).toMatchObject({ repeat: 1, nestMm: [100, 100], restMm: 64 }) // 2,900 − (3 × 1,012 − 200)
  })

  it('a pattern with nesting pieces never runs past the stock: the first piece of the chain gets no credit', async () => {
    const r = await optimizeShape([{ mark: 'S1', lengthMm: 1000, count: 2 }, { mark: 'P', lengthMm: 788, count: 1 }], [{ lengthMm: 2700, qty: null }], 12, { creditMm: new Map([[1000, 100]]) })
    for (const l of r.layouts) {
      const used = l.pieces.reduce((n, p) => n + (p.lengthMm + 12) * p.count, 0) - (l.nestMm ?? []).reduce((a, b) => a + b, 0)
      expect(used).toBeLessThanOrEqual(l.stockLengthMm + 12 + 1e-6)
    }
  })
})
