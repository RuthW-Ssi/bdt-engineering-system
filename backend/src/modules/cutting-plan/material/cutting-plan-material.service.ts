import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { FileStorageService } from '../../file-storage/file-storage.service'
import { parsePlateDxf, PlateGeometry } from '../cutting-plan-dxf'

// User test report 2026-11-26 (wiki features/cutting-plan-feedback-2026-11-26.md), Plate and Shape tabs — the
// production side; CP-Shape-Test (POC) has its own module and shares nothing with this:
// - cut length of each plate (the DXF's CUT path) for the kerf loss, measured once when the plan is first shown
// - kerf per cutting technology + thickness, set in the app; certificate per plate (text); both with history
// - price per kg from Materials (grade + thickness), read when shown so price edits flow through
// - the remnant register: every plate remnant and every shape rest of the stored uploads (Tao: keep whatever is
//   left), less the pieces taken out by the use log

export function cutLengthMm(g: PlateGeometry): number {
  let mm = 0
  for (const [kind, xy] of g.path) {
    if (kind !== 1) continue
    for (let i = 2; i + 1 < xy.length; i += 2) mm += Math.hypot(xy[i] - xy[i - 2], xy[i + 1] - xy[i - 1])
  }
  return Math.round(mm * 10) / 10
}

const num = (v: unknown) => (v == null ? null : Number(v))
export type RemnantSource = 'PLATE' | 'SHAPE'

@Injectable()
export class CuttingPlanMaterialService {
  private readonly log = new Logger(CuttingPlanMaterialService.name)
  parse: (text: string) => PlateGeometry = parsePlateDxf

  constructor(private readonly prisma: PrismaService, private readonly fileStorage: FileStorageService) {}

  // Plates with a stored DXF and no cut length yet get one (uploads before 2026-11-06 have no DXF: stays null)
  async ensureCutLengths(uploadId: number) {
    const todo = (await this.prisma.cutting_plan_nesting.findMany({ where: { upload_id: uploadId, cut_length_mm: null }, select: { id: true, cuttingplan_number: true } })) as { id: number; cuttingplan_number: string }[]
    if (!todo.length) return
    const dxfs = await this.prisma.cutting_plan_file.findMany({ where: { upload_id: uploadId, kind: 'DXF', plate_name: { in: todo.map(n => n.cuttingplan_number) } }, select: { plate_name: true, file_key: true } })
    for (const n of todo) {
      const f = dxfs.find(d => d.plate_name === n.cuttingplan_number)
      if (!f) continue
      try {
        const g = this.parse((await this.fileStorage.getObject(f.file_key)).toString('latin1'))
        await this.prisma.cutting_plan_nesting.update({ where: { id: n.id }, data: { cut_length_mm: cutLengthMm(g) } })
      } catch (e) {
        this.log.warn(`Cut length of plate ${n.cuttingplan_number} (upload ${uploadId}) not measured: ${(e as Error).message}`)
      }
    }
  }

  kerfs() {
    return this.prisma.cutting_plan_kerf.findMany({ orderBy: [{ technology: 'asc' }, { thick_mm: 'asc' }], include: { write_user: { select: { id: true, name: true } } } })
  }

  // kerf_mm null removes the row; every change is logged old → new
  async saveKerfs(rows: { technology: string; thick_mm: number; kerf_mm: number | null }[], uid: number) {
    for (const r of rows) {
      const where = { technology_thick_mm: { technology: r.technology, thick_mm: r.thick_mm } }
      const old = await this.prisma.cutting_plan_kerf.findUnique({ where })
      const before = old ? String(Number(old.kerf_mm)) : null, after = r.kerf_mm == null ? null : String(r.kerf_mm)
      if (before === after) continue
      if (r.kerf_mm == null) await this.prisma.cutting_plan_kerf.delete({ where })
      else await this.prisma.cutting_plan_kerf.upsert({ where, create: { technology: r.technology, thick_mm: r.thick_mm, kerf_mm: r.kerf_mm, write_uid: uid }, update: { kerf_mm: r.kerf_mm, write_uid: uid, write_date: new Date() } })
      await this.prisma.cutting_plan_change.create({ data: { entity: 'KERF', entity_id: old?.id ?? 0, field: 'kerf_mm', old_value: before, new_value: after, changed_by_uid: uid } })
      if (!old) await this.prisma.cutting_plan_change.create({ data: { entity: 'KERF', entity_id: 0, field: 'key', old_value: null, new_value: `${r.technology} · ${r.thick_mm} mm`, changed_by_uid: uid } })
    }
    return this.kerfs()
  }

  async setCertificate(nestingId: number, text: string | null, uid: number) {
    const n = await this.prisma.cutting_plan_nesting.findUnique({ where: { id: nestingId } })
    if (!n) throw new NotFoundException(`Plate ${nestingId} not found`)
    const value = text?.trim() || null, before = n.certificate ?? null
    if (before === value) return { id: n.id, certificate: value }
    await this.prisma.cutting_plan_nesting.update({ where: { id: nestingId }, data: { certificate: value } })
    await this.prisma.cutting_plan_change.create({ data: { entity: 'NESTING', entity_id: nestingId, field: 'certificate', old_value: before, new_value: value, changed_by_uid: uid } })
    return { id: n.id, certificate: value }
  }

  history(entity: string, entityId: number) {
    return this.prisma.cutting_plan_change.findMany({ where: { entity, entity_id: entityId }, orderBy: { changed_at: 'desc' }, include: { changed_by: { select: { id: true, name: true } } } })
  }

  // Price per kg of plate stock from Materials: rows sold by the kilogram with a grade, a thickness and a cost
  async prices() {
    const rows = await this.prisma.materials.findMany({
      where: { cost: { gt: 0 }, grade: { not: null }, thickness_mm: { not: null }, active: true, uom: { name: { in: ['Kilograms', 'kg', 'KG'] } } },
      select: { default_code: true, grade: true, thickness_mm: true, cost: true },
    })
    const out = new Map<string, { grade: string; thick_mm: number; thb_per_kg: number; material: string }>()
    for (const r of rows) {
      const k = `${r.grade!.trim().toUpperCase()}|${Number(r.thickness_mm)}`
      if (!out.has(k)) out.set(k, { grade: r.grade!.trim().toUpperCase(), thick_mm: Number(r.thickness_mm), thb_per_kg: Number(r.cost), material: r.default_code })
    }
    return [...out.values()].sort((a, b) => a.grade.localeCompare(b.grade) || a.thick_mm - b.thick_mm)
  }

  async remnants() {
    const [plates, rests, used] = await Promise.all([
      this.prisma.cutting_plan_remnant.findMany({
        where: { upload: { plan_type: 'PLATE' } },
        include: { nesting: { select: { plate_number: true, quality: true, thick_mm: true, certificate: true } }, upload: { select: { id: true, create_date: true, project: { select: { project_code: true } }, zone: { select: { code: true } } } } },
        orderBy: { id: 'asc' },
      }),
      this.prisma.cutting_plan_shape_layout.findMany({
        where: { rest_mm: { gt: 0 } },
        include: { size: { select: { profile: true, grade: true, upload_id: true, upload: { select: { id: true, create_date: true, project: { select: { project_code: true } }, zone: { select: { code: true } } } } } } },
        orderBy: { id: 'asc' },
      }),
      this.prisma.cutting_plan_remnant_use.groupBy({ by: ['source', 'source_id'], _sum: { qty: true } }),
    ])
    const usedOf = (source: RemnantSource, id: number) => used.find((u: any) => u.source === source && u.source_id === id)?._sum.qty ?? 0
    const from = (u: any) => ({ upload_id: u.id, project_code: u.project?.project_code ?? null, zone: u.zone?.code ?? null, uploaded: u.create_date })
    const plateRows = plates.map((r: any) => {
      const qty = r.count ?? 1, u = usedOf('PLATE', r.id)
      return {
        source: 'PLATE' as const, source_id: r.id, kind: 'PLATE', offcut_no: r.plate_number ?? `P${r.upload_id}-${r.id}`, from_plate: r.ref_plate ?? r.nesting?.plate_number ?? null,
        profile: null, grade: r.nesting?.quality ?? null, thick_mm: num(r.nesting?.thick_mm), length_mm: num(r.length_mm), width_mm: num(r.width_mm),
        weight_kg: num(r.weight_kg), qty, used: u, available: qty - u, certificate: r.nesting?.certificate ?? null, ...from(r.upload),
      }
    })
    const shapeRows = rests.filter((l: any) => Number(l.rest_mm) > 0).map((l: any) => {
      const qty = l.repeat, u = usedOf('SHAPE', l.id)
      return {
        source: 'SHAPE' as const, source_id: l.id, kind: 'SHAPE', offcut_no: `S${l.id}`, from_plate: null,
        profile: l.size.profile, grade: l.size.grade, thick_mm: null, length_mm: num(l.rest_mm), width_mm: null, stock_length_mm: num(l.stock_length_mm),
        weight_kg: null, qty, used: u, available: qty - u, certificate: null, ...from(l.size.upload),
      }
    })
    return [...plateRows, ...shapeRows]
  }

  async useRemnant(dto: { source: RemnantSource; source_id: number; qty: number; note?: string | null }, uid: number) {
    const row = (await this.remnants()).find(r => r.source === dto.source && r.source_id === dto.source_id)
    if (!row) throw new NotFoundException(`Remnant ${dto.source} ${dto.source_id} not found`)
    if (dto.qty > row.available) throw new BadRequestException(`Only ${row.available} of ${row.offcut_no} left`)
    return this.prisma.cutting_plan_remnant_use.create({ data: { source: dto.source, source_id: dto.source_id, qty: dto.qty, note: dto.note?.trim() || null, create_uid: uid } })
  }
}
