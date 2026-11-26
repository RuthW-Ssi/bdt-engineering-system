import { Injectable, NotFoundException } from '@nestjs/common'
import * as fs from 'fs'
import * as path from 'path'
import { PrismaService } from '../../prisma/prisma.service'
import { classifyProfile } from './profile-family'

// CP-Shape-Test (2026-11-26): sleeve joints of a project — which two pipes each sleeve pipe joins and how far it goes
// into each — for the plug-weld holes. Source: scripts/cp-shape-test/extract-sleeve-joints.py run on the project's IFC,
// kept as a file (no DB, test bench, as the end cuts) in storage/cp-shape-test/sleeve-joints/<PROJECT_CODE>.json.
// Pieces a model carries no mark for (0X222) get theirs from the BOM: the parts of the same assembly with the same
// size and length (± 1 mm). The models draw some sleeves smaller than their pipe (0X220: 129.8 in 139.8X5) and some
// at the pipe's own size (0X222 sub-trusses): sleeveDrawnAtPipeSize says which.

interface FilePiece { mark: string | null; profile: string; odMm: number; wallMm: number | null; lengthMm: number }
interface FileJoint { sleeve: FilePiece; pipes: (FilePiece & { insertMm: number })[]; count: number; assemblies: string[] }
export interface JointPiece { marks: string[]; profile: string; odMm: number; wallMm: number | null; lengthMm: number }
export interface SleeveJoint { sleeve: JointPiece; pipes: (JointPiece & { insertMm: number })[]; count: number; assemblies: string[]; sleeveDrawnAtPipeSize: boolean }

const DEFAULT_DIR = path.join(process.cwd(), 'storage', 'cp-shape-test', 'sleeve-joints')
const sizeOf = (profile: string | null) => classifyProfile(profile)?.profile ?? null // a sleeve (…SL) is its pipe's size here

@Injectable()
export class SleeveJointService {
  constructor(private readonly prisma: PrismaService, private readonly dir = DEFAULT_DIR) {}

  async joints(projectId: number): Promise<{ source: string | null; joints: SleeveJoint[] }> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { project_code: true } })
    if (!project) throw new NotFoundException(`Project ${projectId} not found`)
    const file = path.join(this.dir, `${project.project_code}.json`)
    if (!/^[\w-]+$/.test(project.project_code) || !fs.existsSync(file)) return { source: null, joints: [] }
    const data = JSON.parse(fs.readFileSync(file, 'utf8')) as { source: string; joints: FileJoint[] }

    const needMarks = data.joints.filter(j => !j.sleeve.mark || j.pipes.some(p => !p.mark))
    const rows = needMarks.length ? await this.prisma.bom_assembly_part.findMany({
      where: { assembly: { assembly_mark: { in: [...new Set(needMarks.flatMap(j => j.assemblies))] }, dispatch: { project_id: projectId, status: 'complete' } }, part: { status: 'ACTIVE' } },
      select: { assembly: { select: { assembly_mark: true } }, part: { select: { part_mark: true, profile: true, length_mm: true } } },
    }) : []
    const marksOf = (p: FilePiece, assemblies: string[]) => {
      if (p.mark) return [p.mark]
      const size = sizeOf(p.profile)
      return [...new Set(rows.filter(r => assemblies.includes(r.assembly.assembly_mark) && sizeOf(r.part.profile) === size && Math.abs(Number(r.part.length_mm) - p.lengthMm) <= 1).map(r => r.part.part_mark))].sort()
    }
    const piece = (p: FilePiece, a: string[]): JointPiece => ({ marks: marksOf(p, a), profile: p.profile, odMm: p.odMm, wallMm: p.wallMm, lengthMm: p.lengthMm })

    const out = new Map<string, SleeveJoint>()
    for (const j of data.joints) {
      const sleeve = piece(j.sleeve, j.assemblies)
      const pipes = j.pipes.map(p => ({ ...piece(p, j.assemblies), insertMm: p.insertMm }))
      // the same joint again (the model's lengths differ by fractions of a mm): one row
      const key = JSON.stringify([sleeve.marks, sleeve.profile, pipes.map(p => [p.marks, p.profile, Math.round(p.insertMm)])])
      const had = out.get(key)
      if (had) { had.count += j.count; had.assemblies = [...new Set([...had.assemblies, ...j.assemblies])] }
      else out.set(key, { sleeve, pipes, count: j.count, assemblies: [...j.assemblies], sleeveDrawnAtPipeSize: pipes.some(p => p.odMm - sleeve.odMm < 0.5) })
    }
    return { source: data.source, joints: [...out.values()] }
  }
}
