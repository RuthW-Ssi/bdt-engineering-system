import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { AssignHeatDto, BulkAssignHeatDto } from './dto/assign-heat.dto'
import { QueryHeatLotDto, UpsertHeatLotDto } from './dto/heat-lot.dto'
import { QueryProjectTraceDto } from './dto/query-trace.dto'
import {
  CompletenessScope, FORWARD_CSV_HEADER, MainFlag, TraceHeat, TraceRow, TRACE_CSV_HEADER,
  computeCompleteness, inScope, latestSheetIds, mainFlagOfSlots, markKey, normalizeHeatNo, normalizeMill, parentPlateName, squashName,
  toCsv, traceCsvRows,
} from './traceability.logic'

const DEFAULT_SCOPE: CompletenessScope = 'main_or_unknown'
const IN_CHUNK = 5000 // ids per `IN (...)` list

interface BomHit { id: number; main: MainFlag }

function chunks<T>(items: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n))
  return out
}

function ymd(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null
}

/** A heat assignment shown as a suggestion (earlier upload of the same plate, or the plate a remnant came from). */
export interface PlateCutHint {
  plate_cut_id: number; upload_id: number | null; sheet: string; plate_seq: number; plate_no: string | null
  heat_lot: { id: number; heat_no: string; mill: string; cert_no: string | null }
}

const PLATE_CUT_HINT_SELECT = {
  id: true, upload_id: true, cuttingplan_number: true, nc_file: true, plate_seq: true, plate_no: true,
  heat_lot: { select: { id: true, heat_no: true, mill: true, cert_no: true } },
} as const

function toHint(c: { id: number; upload_id: number | null; cuttingplan_number: string; plate_seq: number; plate_no: string | null; heat_lot: PlateCutHint['heat_lot'] }): PlateCutHint {
  return { plate_cut_id: c.id, upload_id: c.upload_id, sheet: c.cuttingplan_number, plate_seq: c.plate_seq, plate_no: c.plate_no, heat_lot: c.heat_lot }
}

@Injectable()
export class TraceabilityService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Heat lots ────────────────────────────────────────────────

  async listHeatLots(query: QueryHeatLotDto) {
    const q = query.search?.trim()
    const where: Prisma.heat_lotWhereInput = q
      ? { OR: [
          { heat_no: { contains: normalizeHeatNo(q) } },
          { mill: { contains: q, mode: 'insensitive' } },
          { cert_no: { contains: q, mode: 'insensitive' } },
        ] }
      : {}
    return this.prisma.heat_lot.findMany({
      where,
      orderBy: { id: 'desc' },
      take: 200,
      include: { _count: { select: { plate_cuts: true, part_traces: true } } },
    })
  }

  async upsertHeatLot(dto: UpsertHeatLotDto, userId: number) {
    const heat_no = normalizeHeatNo(dto.heat_no)
    if (!heat_no) throw new BadRequestException('heat_no is required')
    const mill = normalizeMill(dto.mill)
    const fields = {
      grade: dto.grade?.trim() || undefined,
      thick_mm: dto.thick_mm,
      cert_no: dto.cert_no?.trim() || undefined,
      supplier: dto.supplier?.trim() || undefined,
      received_date: dto.received_date ? new Date(dto.received_date) : undefined,
      note: dto.note?.trim() || undefined,
      active: dto.active,
    }
    return this.prisma.heat_lot.upsert({
      where: { heat_no_mill: { heat_no, mill } },
      create: { heat_no, mill, ...fields, create_uid: userId, write_uid: userId },
      update: { ...fields, write_uid: userId, write_date: new Date() },
    })
  }

  // ── Sheets ───────────────────────────────────────────────────

  /** Every nesting sheet of an upload with its ACTIVE heat assignment(s) — what the cutting-plan sheet view shows. */
  async sheetsOfUpload(uploadId: number) {
    const upload = await this.prisma.cutting_plan_upload.findUnique({ where: { id: uploadId }, select: { id: true } })
    if (!upload) throw new NotFoundException(`Cutting plan upload ${uploadId} not found`)
    const sheets = await this.prisma.cutting_plan_nesting.findMany({
      where: { upload_id: uploadId },
      orderBy: { id: 'asc' },
      select: {
        id: true, cuttingplan_number: true, nc_file: true, count: true, quality: true, thick_mm: true, charge: true,
        _count: { select: { order_parts: true } },
        plate_cuts: {
          where: { status: 'ACTIVE' },
          orderBy: { plate_seq: 'asc' },
          select: {
            id: true, plate_seq: true, plate_no: true, cut_date: true, machine: true, note: true, create_date: true,
            heat_lot: { select: { id: true, heat_no: true, mill: true, cert_no: true, grade: true } },
            _count: { select: { part_traces: true } },
          },
        },
      },
    })
    const earlier = await this.earlierVersionCuts(uploadId, sheets.map(s => s.nc_file))
    const parents = await this.parentPlateCuts(sheets.map(s => parentPlateName(s.charge, s.cuttingplan_number)))
    return sheets.map(s => ({
      nesting_id: s.id,
      cuttingplan_number: s.cuttingplan_number,
      nc_file: s.nc_file,
      plates_in_report: s.count,
      quality: s.quality,
      thick_mm: s.thick_mm,
      parts: s._count.order_parts,
      traced: s.plate_cuts.length > 0,
      plate_cuts: s.plate_cuts.map(c => ({
        id: c.id, plate_seq: c.plate_seq, plate_no: c.plate_no, cut_date: ymd(c.cut_date), machine: c.machine, note: c.note,
        create_date: c.create_date, heat_lot: c.heat_lot, parts_traced: c._count.part_traces,
      })),
      // Heat no. of an earlier upload of the same plate (same NC file). Only offered to the user:
      // the new version may be a re-nest with other parts, so nothing is copied on its own.
      previous_cuts: (s.nc_file && earlier.get(s.nc_file.trim().toLowerCase())) || [],
      // The report's Charge names ANOTHER plate: a sheet re-nested from a plate's remnant may keep that
      // plate's Charge (inferred, unverified). Its heat no. is offered, never copied.
      parent_plate: parentPlateName(s.charge, s.cuttingplan_number),
      parent_cuts: parents.get(squashName(parentPlateName(s.charge, s.cuttingplan_number) ?? '')) ?? [],
    }))
  }

  /** Plate name (spaces removed, lower-case) → ACTIVE plate cut records of the newest upload holding that plate. */
  private async parentPlateCuts(namesRaw: (string | null)[]) {
    const out = new Map<string, PlateCutHint[]>()
    const names = [...new Set(namesRaw.filter((n): n is string => !!n).flatMap(n => [n.trim(), n.replace(/\s+/g, '')]))]
    if (!names.length) return out
    const cuts = await this.prisma.plate_cut_record.findMany({
      where: { status: 'ACTIVE', cuttingplan_number: { in: names } },
      orderBy: [{ upload_id: 'desc' }, { plate_seq: 'asc' }, { id: 'asc' }],
      select: PLATE_CUT_HINT_SELECT,
    })
    for (const c of cuts) {
      const key = squashName(c.cuttingplan_number)
      const list = out.get(key) ?? []
      if (list.length && list[0].upload_id !== c.upload_id) continue // only the newest upload of that plate
      list.push(toHint(c))
      out.set(key, list)
    }
    return out
  }

  /**
   * NC file (trimmed, lower-case) → the ACTIVE plate cut records of the newest OLDER upload of that
   * NC file. Used to suggest re-using a heat number after a cutting plan is uploaded again.
   */
  private async earlierVersionCuts(uploadId: number, ncFilesRaw: (string | null)[]) {
    const out = new Map<string, PlateCutHint[]>()
    const ncFiles = [...new Set(ncFilesRaw.filter((n): n is string => !!n?.trim()))]
    if (!ncFiles.length) return out
    const cuts = await this.prisma.plate_cut_record.findMany({
      where: { status: 'ACTIVE', nc_file: { in: ncFiles }, upload_id: { lt: uploadId } },
      orderBy: [{ upload_id: 'desc' }, { plate_seq: 'asc' }, { id: 'asc' }],
      select: PLATE_CUT_HINT_SELECT,
    })
    for (const c of cuts) {
      const key = (c.nc_file ?? '').trim().toLowerCase()
      const list = out.get(key) ?? []
      if (list.length && list[0].upload_id !== c.upload_id) continue // only the newest older upload
      list.push(toHint(c))
      out.set(key, list)
    }
    return out
  }

  /**
   * Assign a heat number / plate to a nesting sheet. One transaction:
   * find-or-create the heat lot → void the plate's current record (if any) → write the new
   * plate_cut_record → write one part_trace per part on the sheet.
   * Grade / thickness that differ from the heat lot are reported as warnings, never blocked or changed.
   */
  async assignHeatToSheet(nestingId: number, dto: AssignHeatDto, userId: number) {
    const heatNo = normalizeHeatNo(dto.heat_no)
    if (!heatNo) throw new BadRequestException('heat_no is required')
    const mill = normalizeMill(dto.mill)
    const plateSeq = dto.plate_seq ?? 1

    const nesting = await this.prisma.cutting_plan_nesting.findUnique({
      where: { id: nestingId },
      include: {
        upload: { select: { id: true, plan_type: true } },
        order_parts: {
          select: { id: true, project_code: true, drawing_part_no_version_no: true, nested: true, weight_kg: true },
        },
      },
    })
    if (!nesting) throw new NotFoundException(`Nesting sheet ${nestingId} not found`)
    if (nesting.upload.plan_type !== 'PLATE') throw new BadRequestException('Heat numbers are assigned to plate nesting sheets only')

    const codes = new Set<string>()
    for (const p of nesting.order_parts) if (p.project_code) codes.add(p.project_code)
    const bom = await this.bomIndex([...codes])
    const now = new Date()

    try {
      const result = await this.prisma.$transaction(async tx => {
        const lot = await tx.heat_lot.upsert({
          where: { heat_no_mill: { heat_no: heatNo, mill } },
          create: {
            heat_no: heatNo, mill,
            grade: nesting.quality?.trim() || null,
            thick_mm: nesting.thick_mm,
            cert_no: dto.cert_no?.trim() || null,
            supplier: dto.supplier?.trim() || null,
            create_uid: userId, write_uid: userId,
          },
          update: {
            ...(dto.cert_no?.trim() ? { cert_no: dto.cert_no.trim() } : {}),
            ...(dto.supplier?.trim() ? { supplier: dto.supplier.trim() } : {}),
            write_uid: userId, write_date: now,
          },
        })

        const voided = await tx.plate_cut_record.updateMany({
          where: { nesting_id: nestingId, plate_seq: plateSeq, status: 'ACTIVE' },
          data: { status: 'VOID', void_reason: dto.reason?.trim() || 'replaced by a new assignment', write_uid: userId, write_date: now },
        })

        const record = await tx.plate_cut_record.create({
          data: {
            nesting_id: nestingId,
            heat_lot_id: lot.id,
            plate_seq: plateSeq,
            plate_no: dto.plate_no?.trim() || null,
            upload_id: nesting.upload_id,
            cuttingplan_number: nesting.cuttingplan_number,
            nc_file: nesting.nc_file,
            quality: nesting.quality,
            thick_mm: nesting.thick_mm,
            cut_date: dto.cut_date ? new Date(dto.cut_date) : null,
            machine: dto.machine?.trim() || null,
            note: dto.note?.trim() || null,
            create_uid: userId, write_uid: userId,
          },
        })

        const traces: Prisma.part_traceCreateManyInput[] = nesting.order_parts.map(p => {
          const hit = p.project_code ? bom.get(`${p.project_code}|${markKey(p.drawing_part_no_version_no)}`) : undefined
          return {
            plate_cut_id: record.id,
            heat_lot_id: lot.id,
            order_part_id: p.id,
            bom_part_id: hit?.id ?? null,
            part_mark: (p.drawing_part_no_version_no ?? '').trim(),
            project_code: p.project_code,
            qty: p.nested,
            weight_kg: p.weight_kg,
            is_main_part: hit ? hit.main : null,
            source: 'AUTO',
          }
        })
        if (traces.length) await tx.part_trace.createMany({ data: traces })

        return { lot, record, voided: voided.count, parts_traced: traces.length }
      })

      const warnings: string[] = []
      const lotGrade = result.lot.grade?.trim().toUpperCase(), sheetGrade = nesting.quality?.trim().toUpperCase()
      if (lotGrade && sheetGrade && lotGrade !== sheetGrade) warnings.push(`Grade differs: heat lot ${result.lot.grade} vs sheet ${nesting.quality}`)
      if (result.lot.thick_mm != null && nesting.thick_mm != null && Number(result.lot.thick_mm) !== Number(nesting.thick_mm)) {
        warnings.push(`Thickness differs: heat lot ${Number(result.lot.thick_mm)} mm vs sheet ${Number(nesting.thick_mm)} mm`)
      }
      if (!nesting.order_parts.length) warnings.push('This sheet has no parts in the report, so nothing was passed on')
      return {
        plate_cut_id: result.record.id,
        nesting_id: nestingId,
        heat_lot: { id: result.lot.id, heat_no: result.lot.heat_no, mill: result.lot.mill, cert_no: result.lot.cert_no },
        plate_seq: plateSeq,
        replaced: result.voided,
        parts_traced: result.parts_traced,
        warnings,
      }
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        // P2002 comes from the ACTIVE-plate partial index or, when two users create the same new heat lot at once,
        // from heat_lot (heat_no, mill) — both are a lost race, so one message covers them.
        throw new ConflictException('Someone else saved this plate or heat number just now — reload and try again')
      }
      throw e
    }
  }

  /**
   * One heat number for several sheets. Each sheet is saved on its own, so one sheet that
   * fails (deleted meanwhile, not a plate plan) does not undo the others — the answer lists both.
   */
  async assignHeatToSheets(dto: BulkAssignHeatDto, userId: number) {
    const { nesting_ids, ...fields } = dto
    const done: Awaited<ReturnType<TraceabilityService['assignHeatToSheet']>>[] = []
    const failed: { nesting_id: number; message: string }[] = []
    for (const nestingId of [...new Set(nesting_ids)]) {
      try {
        done.push(await this.assignHeatToSheet(nestingId, fields, userId))
      } catch (e) {
        failed.push({ nesting_id: nestingId, message: e instanceof Error ? e.message : 'failed' })
      }
    }
    return { assigned: done.length, parts_traced: done.reduce((a, d) => a + d.parts_traced, 0), done, failed }
  }

  async voidPlateCut(id: number, reason: string, userId: number) {
    const record = await this.prisma.plate_cut_record.findUnique({ where: { id }, select: { id: true, status: true } })
    if (!record) throw new NotFoundException(`Plate cut record ${id} not found`)
    if (record.status !== 'ACTIVE') throw new BadRequestException('This record is already void')
    // Conditional update: two users voiding at once cannot both win and overwrite the first reason.
    const done = await this.prisma.plate_cut_record.updateMany({
      where: { id, status: 'ACTIVE' },
      data: { status: 'VOID', void_reason: reason.trim(), write_uid: userId, write_date: new Date() },
    })
    if (done.count === 0) throw new BadRequestException('This record is already void')
    return { voided: true }
  }

  /**
   * Audit trail of one sheet: every assignment ever made on it, ACTIVE and VOID, per plate newest first,
   * with who assigned / voided it, when, and the void reason. Records are never deleted, so this is the
   * full history QA reads.
   */
  async sheetHistory(nestingId: number) {
    const sheet = await this.prisma.cutting_plan_nesting.findUnique({ where: { id: nestingId }, select: { id: true, cuttingplan_number: true } })
    if (!sheet) throw new NotFoundException(`Nesting sheet ${nestingId} not found`)
    const records = await this.prisma.plate_cut_record.findMany({
      where: { nesting_id: nestingId },
      orderBy: [{ plate_seq: 'asc' }, { id: 'desc' }],
      select: {
        id: true, plate_seq: true, plate_no: true, status: true, void_reason: true, cut_date: true, machine: true, note: true,
        create_date: true, write_date: true,
        heat_lot: { select: { id: true, heat_no: true, mill: true, cert_no: true } },
        create_user: { select: { id: true, name: true } },
        write_user: { select: { id: true, name: true } },
        _count: { select: { part_traces: true } },
      },
    })
    return {
      nesting_id: sheet.id,
      cuttingplan_number: sheet.cuttingplan_number,
      records: records.map(r => {
        const isVoid = r.status === 'VOID'
        return {
          id: r.id, plate_seq: r.plate_seq, plate_no: r.plate_no, status: r.status, void_reason: r.void_reason,
          cut_date: ymd(r.cut_date), machine: r.machine, note: r.note, heat_lot: r.heat_lot, parts_traced: r._count.part_traces,
          assigned_at: r.create_date, assigned_by: r.create_user?.name ?? null,
          voided_at: isVoid ? r.write_date : null, voided_by: isVoid ? (r.write_user?.name ?? null) : null,
        }
      }),
    }
  }

  // ── Forward / backward ───────────────────────────────────────

  /** Heat number → plates cut → parts. Several lots come back when the same number exists for several mills. */
  async forward(heatNoRaw: string, millRaw?: string) {
    const heat_no = normalizeHeatNo(heatNoRaw)
    if (!heat_no) throw new BadRequestException('heat_no is required')
    const lots = await this.prisma.heat_lot.findMany({
      where: { heat_no, ...(millRaw != null && millRaw !== '' ? { mill: normalizeMill(millRaw) } : {}) },
      orderBy: { id: 'asc' },
      include: {
        plate_cuts: {
          where: { status: 'ACTIVE' },
          orderBy: { id: 'asc' },
          include: { part_traces: { orderBy: { part_mark: 'asc' } } },
        },
      },
    })
    return {
      heat_no,
      lots: lots.map(l => ({
        id: l.id, heat_no: l.heat_no, mill: l.mill, grade: l.grade, thick_mm: l.thick_mm, cert_no: l.cert_no, supplier: l.supplier,
        plates: l.plate_cuts.map(c => ({
          plate_cut_id: c.id, nesting_id: c.nesting_id, upload_id: c.upload_id, sheet: c.cuttingplan_number, nc_file: c.nc_file,
          plate_no: c.plate_no, plate_seq: c.plate_seq, cut_date: ymd(c.cut_date),
          parts: c.part_traces.map(t => ({
            part_mark: t.part_mark, project_code: t.project_code, qty: t.qty, weight_kg: t.weight_kg, is_main_part: t.is_main_part,
          })),
        })),
        parts_total: l.plate_cuts.reduce((a, c) => a + c.part_traces.length, 0),
      })),
    }
  }

  /** The forward result as CSV, one line per part × plate. */
  async forwardCsv(heatNoRaw: string, millRaw?: string) {
    const res = await this.forward(heatNoRaw, millRaw)
    const rows: (string | number | boolean | null)[][] = []
    for (const l of res.lots) {
      for (const p of l.plates) {
        for (const t of p.parts) {
          rows.push([
            l.heat_no, l.mill, l.cert_no, p.sheet, p.nc_file, p.plate_no, p.plate_seq, p.cut_date,
            t.project_code, t.part_mark, t.is_main_part == null ? '?' : t.is_main_part, t.qty, t.weight_kg != null ? Number(t.weight_kg) : null,
          ])
        }
      }
    }
    return { fileName: `heat-${res.heat_no}-${new Date().toISOString().slice(0, 10)}.csv`, csv: toCsv(FORWARD_CSV_HEADER, rows) }
  }

  /** Part mark → plates → heat numbers (ACTIVE records only). */
  async backward(partMarkRaw: string, projectCode?: string) {
    const part_mark = partMarkRaw.trim()
    if (!part_mark) throw new BadRequestException('part_mark is required')
    const traces = await this.prisma.part_trace.findMany({
      where: {
        part_mark: { equals: part_mark, mode: 'insensitive' },
        ...(projectCode?.trim() ? { project_code: projectCode.trim() } : {}),
        plate_cut: { status: 'ACTIVE' },
      },
      orderBy: { id: 'asc' },
      include: {
        heat_lot: { select: { id: true, heat_no: true, mill: true, grade: true, cert_no: true, supplier: true } },
        plate_cut: { select: { id: true, nesting_id: true, upload_id: true, cuttingplan_number: true, nc_file: true, plate_no: true, plate_seq: true, cut_date: true } },
      },
    })
    return {
      part_mark,
      project_code: projectCode?.trim() || null,
      traces: traces.map(t => ({
        part_mark: t.part_mark, project_code: t.project_code, qty: t.qty, weight_kg: t.weight_kg, is_main_part: t.is_main_part,
        heat_lot: t.heat_lot,
        plate: {
          plate_cut_id: t.plate_cut.id, nesting_id: t.plate_cut.nesting_id, upload_id: t.plate_cut.upload_id, sheet: t.plate_cut.cuttingplan_number,
          nc_file: t.plate_cut.nc_file, plate_no: t.plate_cut.plate_no, plate_seq: t.plate_cut.plate_seq, cut_date: ymd(t.plate_cut.cut_date),
        },
      })),
    }
  }

  // ── Per project ──────────────────────────────────────────────

  async projectCompleteness(projectId: number, scope: CompletenessScope = DEFAULT_SCOPE) {
    const { project, rows } = await this.loadProjectRows(projectId)
    return { project, completeness: computeCompleteness(rows, scope) }
  }

  async projectParts(projectId: number, query: QueryProjectTraceDto) {
    const scope = query.scope ?? DEFAULT_SCOPE
    const { project, rows } = await this.loadProjectRows(projectId)
    return { project, completeness: computeCompleteness(rows, scope), rows: this.filterRows(rows, query) }
  }

  async projectCsv(projectId: number, query: QueryProjectTraceDto) {
    const { project, rows } = await this.loadProjectRows(projectId)
    const csv = toCsv(TRACE_CSV_HEADER, traceCsvRows(this.filterRows(rows, query)))
    return { fileName: `traceability-${project.project_code}-${new Date().toISOString().slice(0, 10)}.csv`, csv }
  }

  private filterRows(rows: TraceRow[], query: QueryProjectTraceDto): TraceRow[] {
    const scope = query.scope ?? DEFAULT_SCOPE
    const q = query.search?.trim().toLowerCase()
    return rows.filter(r =>
      inScope(r, scope)
      && (query.untraced !== 'true' || !r.traced)
      && (!q || r.part_mark.toLowerCase().includes(q) || r.sheet.toLowerCase().includes(q) || r.heats.some(h => h.heat_no.toLowerCase().includes(q))),
    )
  }

  /**
   * Every nested plate part of a project (newest version of each sheet only) with its
   * main/accessory class from the ACTIVE BOM and its ACTIVE heat assignments.
   * A part belongs to the project by its user-curated `project_code`.
   */
  private async loadProjectRows(projectId: number): Promise<{ project: { id: number; project_code: string; name: string }; rows: TraceRow[] }> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { id: true, project_code: true, name: true } })
    if (!project) throw new NotFoundException(`Project ${projectId} not found`)

    const parts = await this.prisma.cutting_plan_order_part.findMany({
      where: { project_code: project.project_code, upload: { plan_type: 'PLATE' } },
      orderBy: [{ upload_id: 'asc' }, { id: 'asc' }],
      select: {
        id: true, upload_id: true, nesting_id: true, cuttingplan_number: true, project_code: true,
        drawing_part_no_version_no: true, nested: true, weight_kg: true,
        nesting: { select: { id: true, upload_id: true, nc_file: true, cuttingplan_number: true, plate_number: true, quality: true, thick_mm: true } },
      },
    })

    // Only the newest version of each sheet counts; parts not linked to a sheet are kept.
    const sheets = new Map<number, { id: number; upload_id: number; nc_file: string | null; cuttingplan_number: string }>()
    for (const p of parts) if (p.nesting) sheets.set(p.nesting.id, p.nesting)
    // A sheet version can also be superseded by an upload that holds no part of this project any more.
    const ncFiles = [...new Set([...sheets.values()].map(s => s.nc_file).filter((n): n is string => !!n))]
    const sameNc = ncFiles.length
      ? await this.prisma.cutting_plan_nesting.findMany({
          where: { nc_file: { in: ncFiles } },
          select: { id: true, upload_id: true, nc_file: true, cuttingplan_number: true },
        })
      : []
    const latest = latestSheetIds([...sheets.values(), ...sameNc.filter(s => !sheets.has(s.id))])
    const current = parts.filter(p => !p.nesting || latest.has(p.nesting.id))

    const bom = await this.bomIndex([project.project_code])

    const heatsOfPart = new Map<number, TraceHeat[]>()
    for (const ids of chunks(current.map(p => p.id), IN_CHUNK)) {
      const traces = await this.prisma.part_trace.findMany({
        where: { order_part_id: { in: ids }, plate_cut: { status: 'ACTIVE' } },
        orderBy: { id: 'asc' },
        select: {
          order_part_id: true,
          heat_lot: { select: { id: true, heat_no: true, mill: true, cert_no: true } },
          plate_cut: { select: { id: true, plate_no: true, plate_seq: true, cut_date: true } },
        },
      })
      for (const t of traces) {
        if (t.order_part_id == null) continue
        const list = heatsOfPart.get(t.order_part_id) ?? []
        list.push({
          plate_cut_id: t.plate_cut.id, heat_lot_id: t.heat_lot.id, heat_no: t.heat_lot.heat_no, mill: t.heat_lot.mill,
          cert_no: t.heat_lot.cert_no, plate_no: t.plate_cut.plate_no, plate_seq: t.plate_cut.plate_seq, cut_date: ymd(t.plate_cut.cut_date),
        })
        heatsOfPart.set(t.order_part_id, list)
      }
    }

    const rows: TraceRow[] = current.map(p => {
      const hit = bom.get(`${project.project_code}|${markKey(p.drawing_part_no_version_no)}`)
      const heats = heatsOfPart.get(p.id) ?? []
      return {
        order_part_id: p.id,
        upload_id: p.upload_id,
        nesting_id: p.nesting_id,
        sheet: p.cuttingplan_number,
        nc_file: p.nesting?.nc_file ?? null,
        report_plate_number: p.nesting?.plate_number ?? null,
        quality: p.nesting?.quality ?? null,
        thick_mm: p.nesting?.thick_mm != null ? Number(p.nesting.thick_mm) : null,
        part_mark: (p.drawing_part_no_version_no ?? '').trim(),
        project_code: p.project_code,
        qty: p.nested ?? 0,
        weight_kg: p.weight_kg != null ? Number(p.weight_kg) : 0,
        is_main_part: hit ? hit.main : null,
        bom_part_id: hit?.id ?? null,
        traced: heats.length > 0,
        heats,
      }
    })
    return { project, rows }
  }

  /** "<project_code>|<mark key>" → the ACTIVE BOM part and whether it is a main part (BOM slot MAIN / ACC). */
  private async bomIndex(projectCodes: string[]): Promise<Map<string, BomHit>> {
    const out = new Map<string, BomHit>()
    if (!projectCodes.length) return out
    const projects = await this.prisma.project.findMany({ where: { project_code: { in: projectCodes } }, select: { id: true, project_code: true } })
    if (!projects.length) return out
    const codeOf = new Map(projects.map(p => [p.id, p.project_code]))
    const bomParts = await this.prisma.bom_part.findMany({
      where: { status: 'ACTIVE', dispatch: { project_id: { in: projects.map(p => p.id) } } },
      select: { id: true, part_mark: true, slot: true, dispatch: { select: { project_id: true } } },
    })
    const slots = new Map<string, { id: number; slots: (string | null)[] }>()
    for (const b of bomParts) {
      const key = `${codeOf.get(b.dispatch.project_id)}|${markKey(b.part_mark)}`
      const held = slots.get(key)
      if (held) { held.slots.push(b.slot); if (b.slot === 'MAIN') held.id = b.id }
      else slots.set(key, { id: b.id, slots: [b.slot] })
    }
    for (const [key, v] of slots) out.set(key, { id: v.id, main: mainFlagOfSlots(v.slots) })
    return out
  }
}
