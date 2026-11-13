import { Injectable, NotFoundException } from '@nestjs/common'
import * as fs from 'fs'
import * as path from 'path'
import { PrismaService } from '../../prisma/prisma.service'

// CP-Shape-Test 3D step 2 (Tao 2026-11-12): the real pipe end cuts (saddle / slot / straight) for the 3D bar view.
// Source: end-cut grids worked out from the project's IFC by BdtPipeCut, kept as a file (no DB, test bench) in
// storage/cp-shape-test/end-cuts/*.json — { source: <IFC file name>, parts: [guid, assembly, zone, shapeId, name][],
// shapes: { id: { LW, LN, RW, RN, rOff, profile, length, L, R, dL, dR } } }. A grid is the axial position (mm) of the
// cut at each degree round the pipe, outer (W) and inner (N) wall, int16 LE base64 in 0.1 mm; right grids hold x − rOff.
// A file is only used when its IFC is the project's own BIM model. The IFC has no part marks, so a BOM mark is matched
// to the model pieces of its assemblies with the same size and length (± 1 mm).
// Tao 2026-11-12: a piece is laid out at BdtPipeCut's cut length (cutLengthMm), not the BOM length — BdtPipeCut draws its
// NC from these end cuts and has been tested on the factory's machine. A saddle piece's tips sit inside the BOM length
// (DBN-B3-m66: BOM 500, tips at 15.8 and 484.2 → 468.4).

export interface EndCut {
  L: string; R: string; depthLMm: number; depthRMm: number
  instances: number // model pieces matched
  variants: number // distinct end-cut shapes among them (the most common one is returned)
  spreadMm: number // how far the variants differ, a piece turned end for end counted as the same
  cutLengthMm: number // BdtPipeCut's cut length: tip to tip of the end cuts (its NC runs from the left tip); the longest variant
  grids: { LW: number[]; LN: number[]; RW: number[]; RN: number[] }
}
interface Shape { LW: string; LN: string; RW: string; RN: string; rOff: number; profile: string; length: number; L: string; R: string; dL: number; dR: number }
interface EndCutFile { source: string; parts: [string, string, string, number, string][]; shapes: Record<string, Shape> }

export const decodeGrid = (b64: string, offset: number) => {
  const u = Buffer.from(b64, 'base64')
  const a = new Int16Array(u.buffer, u.byteOffset, u.length >> 1)
  return Array.from(a, v => v / 10 + offset)
}
const norm = (s: string | null) => String(s ?? '').toUpperCase().replace(/\s/g, '')
const DEFAULT_DIR = path.join(process.cwd(), 'storage', 'cp-shape-test', 'end-cuts')

function ends(s: Shape) {
  const LW = decodeGrid(s.LW, 0), LN = decodeGrid(s.LN, 0), RW = decodeGrid(s.RW, s.rOff), RN = decodeGrid(s.RN, s.rOff)
  const xL = LW.map((v, i) => Math.max(v, LN[i])), xR = RW.map((v, i) => Math.min(v, RN[i]))
  const tip = Math.min(...xL)
  return { grids: { LW, LN, RW, RN }, xL: xL.map(v => v - tip), xR: xR.map(v => v - tip), length: Math.max(...xR) - tip }
}

// Largest gap (mm) between two end cuts round the pipe, as they are or with b turned end for end at the best angle
function spread(a: ReturnType<typeof ends>, b: ReturnType<typeof ends>) {
  let direct = 0
  for (let i = 0; i < 361; i++) direct = Math.max(direct, Math.abs(a.xL[i] - b.xL[i]), Math.abs(a.xR[i] - b.xR[i]))
  const L = Math.max(...a.xR)
  let turned = Infinity
  for (let shift = 0; shift < 360; shift++) {
    let d = 0
    for (let i = 0; i < 361 && d < turned; i++) {
      const j = (shift - i + 720) % 360
      d = Math.max(d, Math.abs(L - b.xR[j] - a.xL[i]), Math.abs(L - b.xL[j] - a.xR[i]))
    }
    turned = Math.min(turned, d)
  }
  return Math.min(direct, turned)
}

@Injectable()
export class EndCutService {
  private cache = new Map<string, { mtimeMs: number; data: EndCutFile; byAssembly: Map<string, EndCutFile['parts']> }>()

  constructor(private readonly prisma: PrismaService, private readonly dir: string = DEFAULT_DIR) {}

  private load(source: string) {
    if (!fs.existsSync(this.dir)) return null
    for (const name of fs.readdirSync(this.dir).filter(f => f.endsWith('.json'))) {
      const file = path.join(this.dir, name)
      const mtimeMs = fs.statSync(file).mtimeMs
      let hit = this.cache.get(file)
      if (!hit || hit.mtimeMs !== mtimeMs) {
        const data = JSON.parse(fs.readFileSync(file, 'utf8')) as EndCutFile
        const byAssembly = new Map<string, EndCutFile['parts']>()
        for (const p of data.parts) byAssembly.set(p[1], [...(byAssembly.get(p[1]) ?? []), p])
        hit = { mtimeMs, data, byAssembly }
        this.cache.set(file, hit)
      }
      if (hit.data.source === source) return hit
    }
    return null
  }

  async endCuts(projectId: number, marks: string[]): Promise<{ source: string | null; marks: Record<string, EndCut | null> }> {
    if (!(await this.prisma.project.findUnique({ where: { id: projectId }, select: { id: true } }))) throw new NotFoundException(`Project ${projectId} not found`)
    const out: Record<string, EndCut | null> = Object.fromEntries(marks.map(m => [m, null]))
    const model = await this.prisma.bim_model.findFirst({
      where: { project_id: projectId, translation_status: 'complete' }, orderBy: [{ major_version: 'desc' }, { minor_version: 'desc' }], select: { filename: true },
    })
    const file = model ? this.load(model.filename) : null
    if (!file) return { source: null, marks: out }

    const rows = await this.prisma.bom_part.findMany({
      where: { status: 'ACTIVE', part_mark: { in: marks }, dispatch: { project_id: projectId, status: 'complete' } },
      select: { part_mark: true, profile: true, length_mm: true, assembly_parts: { select: { assembly: { select: { assembly_mark: true } } } } },
    })
    for (const mark of marks) {
      const mine = rows.filter(r => r.part_mark === mark && r.length_mm != null)
      if (!mine.length) continue
      const length = Number(mine[0].length_mm!.toString()), profile = norm(mine[0].profile)
      const assemblies = new Set(mine.flatMap(r => r.assembly_parts.map(a => a.assembly.assembly_mark)))
      const count = new Map<string, number>()
      for (const a of assemblies) for (const p of file.byAssembly.get(a) ?? []) {
        const s = file.data.shapes[String(p[3])]
        if (s && norm(s.profile) === profile && Math.abs(s.length - length) <= 1) count.set(String(p[3]), (count.get(String(p[3])) ?? 0) + 1)
      }
      if (!count.size) continue
      const ids = [...count].sort((a, b) => b[1] - a[1]).map(([id]) => id)
      const best = file.data.shapes[ids[0]], e = ends(best)
      out[mark] = {
        L: best.L, R: best.R, depthLMm: best.dL, depthRMm: best.dR,
        instances: [...count.values()].reduce((n, c) => n + c, 0), variants: ids.length,
        spreadMm: Math.round(Math.max(0, ...ids.slice(1).map(id => spread(e, ends(file.data.shapes[id])))) * 10) / 10,
        cutLengthMm: Math.round(Math.max(...ids.map(id => ends(file.data.shapes[id]).length)) * 100) / 100,
        grids: e.grids,
      }
    }
    return { source: file.data.source, marks: out }
  }
}
