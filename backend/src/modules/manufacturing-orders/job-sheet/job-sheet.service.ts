import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { MoPrintService } from '../mo-print/mo-print.service'
import type { PrintLang } from '../mo-print/mo-print-labels'
import { renderJobSheetPdf } from './job-sheet-render'
import { countSheets, expandPieces, parseHoleGroups, parsePlateProfile, pieceId, type JobSheetHoleGroup, type JobSheetMode } from './job-sheet-format'
import type { JobSheet, JobSheetDrawingRef, JobSheetPlan, JobSheetPreview, JobSheetRoutingOp } from './job-sheet.types'
import type { MoStatus } from '@prisma/client'

// "ใบงานต่อชิ้น" — one job sheet per physical piece (or per part mark).
//
// Deliberately a projection of the existing print packet's plan
// (MoPrintService.buildPlan): work orders, routing-op labels, project/zone
// and each mark's current-rev drawing are resolved by the same code that
// prints the MO packet, so the two papers can never disagree. This service
// only adds what the packet does not carry per part: length, per-piece
// weight, hole groups, traceability placeholders, and the piece expansion.
//
// No schema change: heat number / plate id are read from
// bom_part.attributes when present and stay null (blank hand-fill box)
// until plate heat traceability gives them a real home.

export interface JobSheetScope {
  woIds?: number[] // only assemblies that are on these WOs
  zoneId?: number // only assemblies dispatched to this zone
  subZoneId?: number
  assemblyMarks?: string[]
  partMarks?: string[]
  mode?: JobSheetMode
}

// One batch is one PDF built in memory on a worker; beyond this the user
// narrows the scope (per WO / per zone / per mark) or switches to 'part' mode.
export const MAX_JOB_SHEETS = 500

// Zone batch (GET /mo/job-sheets/zone/:zoneId): the filters of a single-MO
// batch that still make sense across MOs. WO ids are per MO, so not here.
export type ZoneJobSheetScope = Omit<JobSheetScope, 'woIds' | 'zoneId'>

// A zone batch builds one packet plan per MO before it can count sheets;
// this bounds that work. First cap, not measured — same spirit as MAX_JOB_SHEETS.
export const MAX_ZONE_MOS = 50

// Only MOs the floor is working on. DRAFT is not released to production yet,
// DONE is already made, CANCELLED is void (a single-MO batch still prints any
// status, as the MO print packet does).
export const ZONE_MO_STATUSES: MoStatus[] = ['CONFIRMED', 'IN_PROGRESS']

const isEmptyBatch = (err: unknown): boolean => {
  if (!(err instanceof ConflictException)) return false
  const body = err.getResponse()
  return typeof body === 'object' && body !== null && (body as { code?: unknown }).code === 'JOB_SHEET_EMPTY'
}

function tooMany(count: number): ConflictException {
  return new ConflictException({
    message: `ใบงาน ${count} แผ่น เกินจำนวนสูงสุดต่อครั้ง (${MAX_JOB_SHEETS}) — เลือกพิมพ์ทีละ WO / โซน / Mark หรือเปลี่ยนเป็นแบบ "ใบเดียวต่อ Part Mark"`,
    code: 'JOB_SHEET_TOO_MANY',
    count,
    max: MAX_JOB_SHEETS,
  })
}

// Batch totals shown by the preview modal (single-MO and zone batches alike).
export function withTotals(plan: JobSheetPlan): JobSheetPreview {
  const marks = new Set(plan.sheets.map(s => `${s.moId}\u0000${s.assemblyMark}\u0000${s.partMark}`))
  const pieces = plan.mode === 'piece' ? plan.sheets.length : plan.sheets.reduce((s, x) => s + x.pieceTotal, 0)
  const weight = plan.sheets.reduce((s, x) => s + (x.unitWeight_kg ?? 0) * (plan.mode === 'piece' ? 1 : x.pieceTotal), 0)
  return {
    ...plan,
    totals: {
      sheets: plan.sheets.length,
      partMarks: marks.size,
      pieces,
      weight_kg: Math.round(weight * 1000) / 1000,
      withoutHoleData: plan.sheets.filter(s => !s.holesKnown).length,
      withoutDrawing: plan.sheets.filter(s => s.drawings.length === 0).length,
      withoutRouting: plan.sheets.filter(s => s.routing.length === 0).length,
    },
    max_sheets: MAX_JOB_SHEETS,
  }
}

const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || 'http://localhost:5173'

type PartRow = Omit<JobSheet, 'moId' | 'moCode' | 'moRevision' | 'sheetNo' | 'pieceId' | 'pieceNo' | 'pieceTotal' | 'qrUrl'> & { qty: number }

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function attr(attrs: unknown, ...keys: string[]): unknown {
  if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) return undefined
  for (const k of keys) {
    const v = (attrs as Record<string, unknown>)[k]
    if (v !== undefined && v !== null && v !== '') return v
  }
  return undefined
}

const attrStr = (attrs: unknown, ...keys: string[]): string | null => {
  const v = attr(attrs, ...keys)
  return typeof v === 'string' || typeof v === 'number' ? String(v) : null
}

const attrPositive = (attrs: unknown, ...keys: string[]): number | null => {
  const n = num(attr(attrs, ...keys))
  return n != null && n > 0 ? n : null
}

@Injectable()
export class JobSheetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moPrint: MoPrintService,
  ) {}

  async buildPdf(moId: number, scope: JobSheetScope = {}, lang: PrintLang = 'en'): Promise<Uint8Array> {
    const plan = await this.buildPlan(moId, scope)
    // Layout on a worker thread, sharing the print packet's render slots.
    return renderJobSheetPdf(plan, lang)
  }

  async preview(moId: number, scope: JobSheetScope = {}): Promise<JobSheetPreview> {
    return withTotals(await this.buildPlan(moId, scope))
  }

  async buildZonePdf(zoneId: number, scope: ZoneJobSheetScope = {}, lang: PrintLang = 'en'): Promise<Uint8Array> {
    return renderJobSheetPdf(await this.buildZonePlan(zoneId, scope), lang)
  }

  async previewZone(zoneId: number, scope: ZoneJobSheetScope = {}): Promise<JobSheetPreview> {
    return withTotals(await this.buildZonePlan(zoneId, scope))
  }

  // Zone batch: every CONFIRMED / IN_PROGRESS MO with work in the zone
  // (assembly MOs through their lines' dispatch, MO Parts through their own
  // zone), each projected exactly like a single-MO batch with zone_id set,
  // then concatenated in MO-code order and renumbered. MOs with nothing
  // matching the filters are skipped and listed, not an error.
  async buildZonePlan(zoneId: number, scope: ZoneJobSheetScope = {}): Promise<JobSheetPlan> {
    const zone = await this.prisma.project_zone.findUnique({ where: { id: zoneId }, include: { project: true } })
    if (!zone) throw new NotFoundException({ message: `ไม่พบโซน id ${zoneId}`, code: 'ZONE_NOT_FOUND' })
    const sub = scope.subZoneId !== undefined ? { sub_zone_id: scope.subZoneId } : {}
    const mos = await this.prisma.manufacturing_order.findMany({
      where: {
        status: { in: ZONE_MO_STATUSES },
        OR: [
          { kind: 'PART', zone_id: zoneId, ...sub },
          { assembly_lines: { some: { bom_assembly: { dispatch: { zone_id: zoneId, ...sub } } } } },
        ],
      },
      select: { id: true, mo_code: true },
      orderBy: { mo_code: 'asc' },
    })
    if (mos.length === 0) {
      throw new ConflictException({ message: `โซน ${zone.label}: ไม่มี MO ที่ยืนยันแล้ว/กำลังผลิต — ไม่มีใบงานให้พิมพ์`, code: 'JOB_SHEET_EMPTY' })
    }
    if (mos.length > MAX_ZONE_MOS) {
      throw new ConflictException({
        message: `โซน ${zone.label} มี ${mos.length} MO เกินจำนวนสูงสุดต่อครั้ง (${MAX_ZONE_MOS}) — เลือกพิมพ์ทีละ Sub-zone หรือทีละ MO`,
        code: 'JOB_SHEET_TOO_MANY_MOS',
        count: mos.length,
        max: MAX_ZONE_MOS,
      })
    }

    const mode: JobSheetMode = scope.mode ?? 'piece'
    const sheets: JobSheet[] = []
    const moCodes: string[] = []
    const skippedMoCodes: string[] = []
    // Sequential on purpose: each plan is several queries, and the batch
    // stops at the first MO that pushes it over the sheet cap.
    for (const mo of mos) {
      let plan: JobSheetPlan
      try {
        plan = await this.buildPlan(mo.id, { ...scope, mode, zoneId })
      } catch (err) {
        if (isEmptyBatch(err)) { skippedMoCodes.push(mo.mo_code); continue }
        throw err
      }
      if (sheets.length + plan.sheets.length > MAX_JOB_SHEETS) throw tooMany(sheets.length + plan.sheets.length)
      moCodes.push(mo.mo_code)
      for (const sheet of plan.sheets) sheets.push({ ...sheet, sheetNo: sheets.length + 1 })
    }
    if (sheets.length === 0) {
      throw new ConflictException({ message: `โซน ${zone.label}: ไม่มีชิ้นงานตามเงื่อนไขที่เลือก — ไม่มีใบงานให้พิมพ์`, code: 'JOB_SHEET_EMPTY' })
    }
    return {
      mo: null,
      zone: { id: zone.id, code: zone.code, label: zone.label, projectCode: zone.project.project_code, subZoneId: scope.subZoneId ?? null, moCodes, skippedMoCodes },
      mode,
      sheets,
      generatedAt: new Date(),
    }
  }

  async buildPlan(moId: number, scope: JobSheetScope = {}): Promise<JobSheetPlan> {
    const mode: JobSheetMode = scope.mode ?? 'piece'
    // Every non-cancelled WO, not just the selected ones: a piece's sheet
    // lists ALL operations its assembly goes through. 404s if the MO is missing.
    const packet = await this.moPrint.buildPlan(moId, undefined, true)

    const routingByAssembly = new Map<string, JobSheetRoutingOp[]>()
    const drawingsByAssembly = new Map<string, JobSheetDrawingRef[]>()
    const marksOnSelectedWos = new Set<string>()
    // Due-date fallback when the MO has no plan_finish: the latest planned end
    // of the WOs this assembly goes through (the packet's own planEnd).
    const woEndByAssembly = new Map<string, number>()
    for (const row of packet.rows) {
      const end = row.planEnd ? new Date(row.planEnd).getTime() : NaN
      const selected = scope.woIds === undefined || scope.woIds.includes(row.wo.id)
      for (const m of row.marks) {
        if (selected) marksOnSelectedWos.add(m.assemblyMark)
        if (Number.isFinite(end) && end > (woEndByAssembly.get(m.assemblyMark) ?? -Infinity)) woEndByAssembly.set(m.assemblyMark, end)
        const ops = routingByAssembly.get(m.assemblyMark) ?? []
        ops.push({ sequence: row.wo.sequence, operationLabel: row.operationLabel, workCenterName: row.workCenterName, woCode: row.wo.wo_code, woId: row.wo.id })
        routingByAssembly.set(m.assemblyMark, ops)
        if (m.drawings.length > 0 && !drawingsByAssembly.has(m.assemblyMark)) {
          drawingsByAssembly.set(m.assemblyMark, m.drawings.map(d => ({ file_name: d.file_name, rev: d.rev, uploaded_at: d.uploaded_at })))
        }
      }
    }
    for (const ops of routingByAssembly.values()) ops.sort((a, b) => a.sequence - b.sequence || (a.woId ?? 0) - (b.woId ?? 0))
    // An assembly with no WO yet still shows the MO's routing plan (no WO code).
    const templateRouting: JobSheetRoutingOp[] = packet.routingOps.map(op => ({
      sequence: op.sequence, operationLabel: op.operationLabel, workCenterName: op.workCenterName, woCode: op.woCodes[0] ?? null, woId: null,
    }))

    const lines = await this.prisma.mo_assembly_line.findMany({
      where: { mo_id: moId },
      orderBy: { line_seq: 'asc' },
      include: {
        bom_assembly: {
          include: {
            dispatch: { include: { zone: { include: { project: true } }, sub_zone: true } },
            assembly_parts: { include: { part: true }, orderBy: { sequence: 'asc' } },
          },
        },
      },
    })
    // MO Part lines carry the NC-derived hole groups ([{ diameter_mm, count }]).
    const partLines = await this.prisma.mo_part_line.findMany({
      where: { mo_id: moId },
      orderBy: { line_seq: 'asc' },
      include: { mark: true },
    })
    const ncHolesByPartMark = new Map<string, JobSheetHoleGroup[]>()
    for (const pl of partLines) {
      const groups = parseHoleGroups(pl.holes)
      if (pl.part_mark && groups.length > 0) ncHolesByPartMark.set(pl.part_mark, groups)
    }

    const wantAssembly = scope.assemblyMarks ? new Set(scope.assemblyMarks) : null
    const wantPart = scope.partMarks ? new Set(scope.partMarks) : null
    const dueDate = packet.mo.plan_finish ?? null

    const partRows: PartRow[] = []
    for (const line of lines) {
      const assembly = line.bom_assembly
      const dispatch = assembly.dispatch
      if (scope.zoneId !== undefined && dispatch.zone_id !== scope.zoneId) continue
      if (scope.subZoneId !== undefined && dispatch.sub_zone_id !== scope.subZoneId) continue
      if (scope.woIds !== undefined && !marksOnSelectedWos.has(assembly.assembly_mark)) continue
      if (wantAssembly && !wantAssembly.has(assembly.assembly_mark)) continue
      const lineQty = Number(line.qty) || 1
      for (const ap of assembly.assembly_parts) {
        const part = ap.part
        if (wantPart && !wantPart.has(part.part_mark)) continue
        const perAssembly = Number(ap.qty) || 1
        const fromAttrs = parseHoleGroups(attr(part.attributes, 'holes'))
        const holes = fromAttrs.length > 0 ? fromAttrs : ncHolesByPartMark.get(part.part_mark) ?? []
        const plate = parsePlateProfile(part.profile)
        partRows.push({
          qty: lineQty * perAssembly,
          projectCode: dispatch.zone.project.project_code,
          projectName: dispatch.zone.project.name,
          zoneLabel: dispatch.zone.label,
          subZoneName: dispatch.sub_zone?.name ?? null,
          assemblyMark: assembly.assembly_mark,
          assemblyName: assembly.name ?? null,
          partMark: part.part_mark,
          description: part.description ?? null,
          profile: part.profile ?? null,
          grade: part.grade ?? null,
          length_mm: num(part.length_mm),
          width_mm: attrPositive(part.attributes, 'width_mm', 'width') ?? plate.width_mm,
          thickness_mm: attrPositive(part.attributes, 'thickness_mm', 'thickness') ?? plate.thickness_mm,
          unitWeight_kg: num(part.weight_kg),
          qtyPerAssembly: perAssembly,
          heatNo: attrStr(part.attributes, 'heat_no', 'heatNo'),
          plateId: attrStr(part.attributes, 'plate_id', 'plateId'),
          dueDate: dueDate ?? (woEndByAssembly.has(assembly.assembly_mark) ? new Date(woEndByAssembly.get(assembly.assembly_mark)!) : null),
          holes,
          holesKnown: holes.length > 0,
          routing: routingByAssembly.get(assembly.assembly_mark) ?? templateRouting,
          drawings: drawingsByAssembly.get(assembly.assembly_mark) ?? [],
          source: 'BOM_PART',
        })
      }
    }

    // A size-based "MO Part" has no assembly lines — its own lines are the
    // pieces. One MO Part = one zone, so a zone filter keeps all or nothing.
    // Its project / zone / sub-zone live on the MO row itself (kind PART):
    // the packet derives them from assembly lines, so they are null there and
    // the sheet would print blank Project / Zone boxes without this lookup.
    let partMoInScope = true
    let partMoWhere = { projectCode: packet.mo.projectCode, projectName: packet.mo.projectName, zoneLabel: packet.mo.zoneLabel, subZoneName: packet.mo.subZoneName }
    if (lines.length === 0 && partLines.length > 0) {
      const own = await this.prisma.manufacturing_order.findUnique({
        where: { id: moId },
        select: {
          zone_id: true,
          sub_zone_id: true,
          project: { select: { project_code: true, name: true } },
          zone: { select: { label: true } },
          sub_zone: { select: { name: true } },
        },
      })
      partMoInScope = (scope.zoneId === undefined || own?.zone_id === scope.zoneId) && (scope.subZoneId === undefined || own?.sub_zone_id === scope.subZoneId)
      partMoWhere = {
        projectCode: own?.project?.project_code ?? partMoWhere.projectCode,
        projectName: own?.project?.name ?? partMoWhere.projectName,
        zoneLabel: own?.zone?.label ?? partMoWhere.zoneLabel,
        subZoneName: own?.sub_zone?.name ?? partMoWhere.subZoneName,
      }
    }
    if (lines.length === 0 && partMoInScope) {
      for (const pl of partLines) {
        const assemblyMark = pl.mark?.mark ?? '—'
        const partMark = pl.part_mark ?? `${pl.profile} L${Number(pl.length_mm)}`
        if (wantAssembly && !wantAssembly.has(assemblyMark)) continue
        if (wantPart && !wantPart.has(partMark)) continue
        const holes = parseHoleGroups(pl.holes)
        const plate = parsePlateProfile(pl.profile)
        partRows.push({
          qty: Number(pl.qty) || 1,
          ...partMoWhere,
          assemblyMark,
          assemblyName: null,
          partMark,
          description: null,
          profile: pl.profile,
          grade: pl.grade,
          length_mm: num(pl.length_mm),
          width_mm: plate.width_mm,
          thickness_mm: plate.thickness_mm,
          unitWeight_kg: num(pl.unit_weight_kg),
          qtyPerAssembly: Number(pl.qty) || 1,
          heatNo: null,
          plateId: null,
          dueDate,
          holes,
          holesKnown: holes.length > 0,
          routing: templateRouting,
          drawings: [],
          source: 'MO_PART_LINE',
        })
      }
    }

    if (partRows.length === 0) {
      throw new ConflictException({ message: `MO ${packet.mo.mo_code}: ไม่มีชิ้นงานตามเงื่อนไขที่เลือก — ไม่มีใบงานให้พิมพ์`, code: 'JOB_SHEET_EMPTY' })
    }
    const count = countSheets(partRows.map(r => r.qty), mode)
    if (count > MAX_JOB_SHEETS) throw tooMany(count)

    const sheets: JobSheet[] = []
    for (const row of partRows) {
      const { qty, ...rest } = row
      const firstWo = rest.routing.find(op => op.woId != null)
      const base = firstWo ? `${FRONTEND_BASE_URL}/order/wo/${firstWo.woId}` : `${FRONTEND_BASE_URL}/mo/${moId}`
      for (const piece of expandPieces(qty, mode)) {
        // Extra query params are ignored by today's pages; a later scan flow
        // (plate heat traceability) can read them without invalidating sheets already printed.
        const query = new URLSearchParams({ rev: String(packet.mo.revision), asm: rest.assemblyMark, part: rest.partMark })
        if (piece.pieceNo != null) query.set('piece', `${piece.pieceNo}/${piece.pieceTotal}`)
        sheets.push({
          ...rest,
          moId: packet.mo.id,
          moCode: packet.mo.mo_code,
          moRevision: packet.mo.revision,
          sheetNo: sheets.length + 1,
          pieceNo: piece.pieceNo,
          pieceTotal: piece.pieceTotal,
          pieceId: pieceId(packet.mo.mo_code, rest.assemblyMark, rest.partMark, piece.pieceNo, piece.pieceTotal),
          qrUrl: `${base}?${query.toString()}`,
        })
      }
    }

    return {
      mo: { id: packet.mo.id, mo_code: packet.mo.mo_code, revision: packet.mo.revision, plan_finish: packet.mo.plan_finish ?? null },
      mode,
      sheets,
      generatedAt: new Date(),
    }
  }
}
