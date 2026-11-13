import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { decodeGrid, EndCutService } from './end-cuts'

// int16 LE, 0.1 mm per unit, base64 — as BdtPipeCut stores its end-cut grids
const enc = (mm: number[]) => Buffer.from(new Int16Array(mm.map(v => Math.round(v * 10))).buffer).toString('base64')
const grid = (v: number) => enc(Array(361).fill(v))

function build(files: Record<string, unknown>, bimFile: string | null = 'DRIVING RANGE_BANGNA.ifc') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'endcuts-'))
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), JSON.stringify(body))
  const asm = (mark: string, length: number, assemblies: string[], profile = 'PIPE60.5X2.4') =>
    ({ part_mark: mark, profile, length_mm: { toString: () => String(length) }, assembly_parts: assemblies.map(a => ({ assembly: { assembly_mark: a } })) })
  const prisma: any = {
    project: { findUnique: jest.fn(async ({ where }: any) => (where.id === 7 ? { id: 7 } : null)) },
    bim_model: { findFirst: jest.fn(async () => (bimFile ? { filename: bimFile } : null)) },
    bom_part: { findMany: jest.fn(async ({ where }: any) => [
      asm('DBN-B1-m7', 969.05, ['DBN-B1-STR1', 'DBN-B1-STR2']),
      asm('DBN-B1-m9', 500.02, ['DBN-B1-STR9']),
      asm('DBN-B2-m5', 12418, ['DBN-B2-CTR1'], 'PIPE101.6X2.6'),
    ].filter(r => where.part_mark.in.includes(r.part_mark))) },
  }
  return { svc: new EndCutService(prisma, dir), prisma }
}

const DATA = {
  source: 'DRIVING RANGE_BANGNA.ifc',
  parts: [
    ['g1', 'DBN-B1-STR1', 'B1', 266, 'DIGONAL'],
    ['g2', 'DBN-B1-STR2', 'B1', 266, 'DIGONAL'],
    ['g3', 'DBN-B1-STR2', 'B1', 267, 'DIGONAL'],
    ['g4', 'DBN-B1-STR2', 'B1', 300, 'HORIZONTAL'], // same assembly, other length: not this mark
    ['g5', 'DBN-B2-CTR1', 'B2', 400, 'CHORD'], // right length, other size: not this mark
  ],
  shapes: {
    266: { LW: grid(118.6), LN: grid(118), RW: grid(-118.6), RN: grid(-118), rOff: 969.1, profile: 'PIPE 60.5X2.4', length: 969.1, L: 'saddle', R: 'saddle', dL: 118.6, dR: 118.6 },
    267: { LW: grid(0), LN: grid(0), RW: grid(0), RN: grid(0), rOff: 969.1, profile: 'PIPE 60.5X2.4', length: 969.1, L: 'straight', R: 'saddle', dL: 0, dR: 118.6 },
    300: { LW: grid(0), LN: grid(0), RW: grid(0), RN: grid(0), rOff: 1500, profile: 'PIPE 60.5X2.4', length: 1500, L: 'straight', R: 'straight', dL: 0, dR: 0 },
    400: { LW: grid(0), LN: grid(0), RW: grid(0), RN: grid(0), rOff: 12418, profile: 'PIPE 113.5X2.4', length: 12418, L: 'straight', R: 'straight', dL: 0, dR: 0 },
  },
}

describe('decodeGrid', () => {
  it('int16 LE base64 in 0.1 mm, plus an offset', () => {
    expect(decodeGrid(enc([118.6, -3.2, 0]), 0)).toEqual([118.6, -3.2, 0])
    expect(decodeGrid(enc([-118.6]), 969.1)[0]).toBeCloseTo(850.5, 6)
  })
})

describe('EndCutService', () => {
  it('a mark takes the end cuts of its model pieces: same assembly, size and length; the most common shape wins', async () => {
    const { svc } = build({ 'driving-range.json': DATA })
    const r = await svc.endCuts(7, ['DBN-B1-m7'])
    expect(r.source).toBe('DRIVING RANGE_BANGNA.ifc')
    const c = r.marks['DBN-B1-m7']!
    expect(c).toMatchObject({ L: 'saddle', R: 'saddle', depthLMm: 118.6, depthRMm: 118.6, instances: 3, variants: 2 })
    expect(c.spreadMm).toBeCloseTo(237.2, 1) // g3 is cut straight at both tips: 2 × 118.6 mm longer than the saddle pieces
    // BdtPipeCut's cut length (its NC runs tip to tip of the model's end cuts); variants differ → the longest, so no piece comes out short
    expect(c.cutLengthMm).toBeCloseTo(969.1, 6)
    expect(c.grids.LW).toHaveLength(361)
    expect(c.grids.LW[0]).toBeCloseTo(118.6, 6)
    expect(c.grids.RW[180]).toBeCloseTo(850.5, 6) // right end stored as x − length
  })

  it('a variant stored as another shape but with the same cut does not count as a difference', async () => {
    const same = { ...DATA, shapes: { ...DATA.shapes, 267: { ...DATA.shapes[266] } } }
    const { svc } = build({ 'driving-range.json': same })
    expect((await svc.endCuts(7, ['DBN-B1-m7'])).marks['DBN-B1-m7']).toMatchObject({ variants: 2, spreadMm: 0, cutLengthMm: 731.9 })
  })

  it('no model piece for the mark, or another size at that length: null', async () => {
    const { svc } = build({ 'driving-range.json': DATA })
    const r = await svc.endCuts(7, ['DBN-B1-m9', 'DBN-B2-m5', 'NOT-IN-BOM'])
    expect(r.marks).toEqual({ 'DBN-B1-m9': null, 'DBN-B2-m5': null, 'NOT-IN-BOM': null })
  })

  it('only end cuts made from the project\'s own IFC model are used', async () => {
    const { svc } = build({ 'driving-range.json': DATA }, 'OTHER PROJECT.ifc')
    expect(await svc.endCuts(7, ['DBN-B1-m7'])).toEqual({ source: null, marks: { 'DBN-B1-m7': null } })
    const none = build({}, null)
    expect(await none.svc.endCuts(7, ['DBN-B1-m7'])).toEqual({ source: null, marks: { 'DBN-B1-m7': null } })
  })

  it('an unknown project is a 404', async () => {
    const { svc } = build({ 'driving-range.json': DATA })
    await expect(svc.endCuts(8, ['DBN-B1-m7'])).rejects.toThrow('Project 8 not found')
  })
})
