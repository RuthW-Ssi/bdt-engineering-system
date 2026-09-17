import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { DrawingsService } from '../../drawings/drawings.service'
import { FileStorageService } from '../../file-storage/file-storage.service'
import { ManufacturingOrderService } from '../manufacturing-orders.service'
import { computeActivityDuration, type ActivityDurationBreakdownItem } from '../../work-orders/activity-duration.util'
import { buildMoPrintPdf } from './mo-print-pdf-builder'
import { findLatestPdfForMark } from './mark-drawing-match'

export interface MoPrintWorkOrderRow {
  wo: {
    id: number
    wo_code: string
    sequence: number
    status: string
    expected_duration_min: number
    setup_time_min: number
  }
  workCenterName: string
  assemblyMark: string
  qty: number | null
  zoneLabel: string
  subZoneName: string | null
  projectName: string
  projectCode: string
  drawing: { file_key: string; file_name: string }
  // The specific routing operation this WO was created from (e.g. "SAW
  // auto weld"), resolved from source_routing_op_id — a soft ref to
  // mrp_routing_workcenter, distinct from workCenterName (the physical
  // resource/station, e.g. "H-beam Fabrication"). Printed on the traveler
  // so the operator can see exactly which process step this is, not just
  // which station it runs on. Null for a WO with no routing-op link
  // (2026-09-16).
  operationLabel: string | null
  // Per-activity time breakdown feeding into wo.setup_time_min/
  // expected_duration_min (same computeActivityDuration() the real WO was
  // created with — see that util's header comment) — printed on the
  // traveler so a factory-floor user can check the planned activity list
  // for completeness, not just the aggregate total.
  activities: ActivityDurationBreakdownItem[]
  // Printed as a QR code on the traveler — points at this WO's existing
  // page in the app (drawing + activities already live there). No
  // scan-to-complete flow exists yet; that can land on this same page
  // later without invalidating QR codes already on printed packets.
  woUrl: string
  // This WO's own share of material consumption — same formulas as the
  // manifest's MO-wide Consume table (ManufacturingOrderService.
  // getConsumeSummaryByWorkOrder(), evaluated against just this WO's
  // activities/assembly), printed on the traveler with an "Actual" hand-
  // fill column so the operator can sign off on what THIS operation used
  // (2026-09-16).
  consume: MoPrintConsumeItem[]
  // The traveler's Assembly List row — the WO's assembly itself, no part
  // breakdown (2026-09-16). Weight is per piece, same as the manifest's
  // List Mark.
  assemblyName: string | null
  assemblyWeightKg: number | null
  // The traveler's Production Time block: who the WO is assigned to, and
  // its planned window from the ACTIVE production schedule version
  // (earliest start → latest end across its schedule rows). Null when
  // unassigned/unscheduled — that cell prints blank for hand-fill.
  assignedTo: string | null
  planStart: Date | null
  planEnd: Date | null
}

const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || 'http://localhost:5173'

export interface MoPrintConsumeItem {
  material_id: number
  code: string
  name: string
  qty: number
  unit: string | null
}

// One assembly (mo_assembly_line) and the bom_parts cut for it — printed
// as a group on the manifest's Assembly Part List (2026-09-16).
export interface MoPrintAssemblyPartGroup {
  assemblyMark: string
  name: string | null
  // The line's qty (how many of this assembly the MO builds).
  qty: number
  parts: {
    part_mark: string
    profile: string | null
    grade: string | null
    // Per-assembly qty × the line's qty — same math as
    // ManufacturingOrderService.getParts(), just not aggregated across
    // assemblies.
    qty: number
    // Part weight × that qty; null when the part has no weight.
    weight_kg: number | null
  }[]
}

export interface MoPrintMarkItem {
  seq: number
  assemblyMark: string
  name: string | null
  projectCode: string
  projectName: string
  zoneLabel: string
  subZoneName: string | null
  width_mm: number | null
  length_mm: number | null
  height_mm: number | null
  weight_kg: number | null
  qty: number
}

export interface MoPrintPacketPlan {
  mo: {
    id: number
    mo_code: string
    due_date: Date | null
    status: string
    primary_mark_prefix_code: string
  }
  rows: MoPrintWorkOrderRow[]
  // One row per mo_assembly_line — every distinct mark in the MO, with its
  // dimensions/weight and dispatch project/zone — printed on the manifest
  // as "List Mark" (replaces the old per-WO/per-operation "Work Orders"
  // table there; full per-operation detail already lives on each WO's own
  // traveler page) (2026-09-16).
  marks: MoPrintMarkItem[]
  // Every bom_part (cut piece — plate/bar, distinct from the consumables
  // below), grouped under the assembly it's cut for, in line_seq order —
  // the manifest's Assembly Part List, where the store signs parts out
  // per assembly. Replaced the flat MO-wide list aggregated by part_mark
  // (ManufacturingOrderService.getParts) on 2026-09-16.
  assemblyParts: MoPrintAssemblyPartGroup[]
}

const zoneKey = (zoneId: number, subZoneId: number | null) => `${zoneId}:${subZoneId ?? ''}`

// Orchestrates the data behind a printable MO/WO packet: pulls every
// non-cancelled WO on the MO, resolves each one's latest PDF drawing
// (findLatestPdfForMark — same filename-convention match the WO Visual Tab
// uses, ported server-side), and refuses to build a partial packet — any
// WO missing a drawing blocks the whole MO (P0 decision, 2026-09-15
// brainstorm), same "reject the whole thing, zero partial writes" shape as
// bom-matching.service.ts's findMissingMarkPrefixes.
@Injectable()
export class MoPrintService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly drawings: DrawingsService,
    private readonly fileStorage: FileStorageService,
    private readonly mo: ManufacturingOrderService,
  ) {}

  // Composes buildPlan (data + the missing-drawing gate) with buildMoPrintPdf
  // (layout + merge), reading each matched drawing's bytes directly via
  // FileStorageService.getObject — NOT getDownloadUrl. getDownloadUrl is
  // built for a browser: the local driver points it back at this same
  // JWT-guarded API (a server-to-server fetch can't authenticate that), and
  // even the GCS driver's presigned URL is unnecessary round-tripping when
  // the caller already runs inside this process. Caught live on local dev
  // (401 from the local driver's self-referential download URL) before this
  // shipped — see FileStorageDriver.getObject's own doc comment.
  async buildPdf(moId: number): Promise<Uint8Array> {
    const plan = await this.buildPlan(moId)
    return buildMoPrintPdf(plan, async row => {
      try {
        return await this.fileStorage.getObject(row.drawing.file_key)
      } catch (err) {
        throw new Error(
          `Failed to read drawing "${row.drawing.file_name}" for ${row.wo.wo_code}: ${err instanceof Error ? err.message : err}`,
        )
      }
    })
  }

  async buildPlan(moId: number): Promise<MoPrintPacketPlan> {
    const mo = await this.prisma.manufacturing_order.findUnique({ where: { id: moId } })
    if (!mo) throw new NotFoundException(`MO ${moId} not found`)

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
    const qtyByAssembly = new Map<number, number>(lines.map(l => [l.bom_assembly_id, Number(l.qty)]))

    const marks: MoPrintMarkItem[] = lines.map((l, i) => {
      const assembly = l.bom_assembly
      const dispatch = assembly.dispatch
      return {
        seq: i + 1,
        assemblyMark: assembly.assembly_mark,
        name: assembly.name,
        projectCode: dispatch.zone.project.project_code,
        projectName: dispatch.zone.project.name,
        zoneLabel: dispatch.zone.label,
        subZoneName: dispatch.sub_zone?.name ?? null,
        width_mm: assembly.width_mm != null ? Number(assembly.width_mm) : null,
        length_mm: assembly.length_mm != null ? Number(assembly.length_mm) : null,
        height_mm: assembly.height_mm != null ? Number(assembly.height_mm) : null,
        weight_kg: assembly.weight_kg != null ? Number(assembly.weight_kg) : null,
        qty: Number(l.qty),
      }
    })

    const workOrders = await this.prisma.work_order.findMany({
      where: { mo_id: moId, status: { not: 'CANCELLED' } },
      orderBy: [{ bom_assembly_id: 'asc' }, { sequence: 'asc' }],
      include: {
        mrp_workcenter: true,
        bom_assembly: { include: { dispatch: { include: { zone: { include: { project: true } }, sub_zone: true } } } },
        schedules: {
          where: { prod_schedule_version: { is_active: true } },
          select: { start_datetime: true, end_datetime: true },
        },
      },
    })

    if (workOrders.length === 0) {
      throw new ConflictException(`MO ${mo.mo_code} has no work orders to print`)
    }

    // One findByZone call per distinct (zone, sub_zone) — every WO of the
    // same assembly shares a zone, so a 6-operation MO would otherwise
    // re-fetch the identical drawing list 6 times.
    const drawingsByZone = new Map<string, Awaited<ReturnType<DrawingsService['findByZone']>>>()
    for (const wo of workOrders) {
      const { zone_id, sub_zone_id } = wo.bom_assembly.dispatch
      const key = zoneKey(zone_id, sub_zone_id)
      if (!drawingsByZone.has(key)) {
        drawingsByZone.set(key, await this.drawings.findByZone(zone_id, sub_zone_id))
      }
    }

    // Batch-fetch every activity referenced across all WOs in one query —
    // same source_activity_id lookup WorkOrderAutoCreateService did at WO
    // creation time, re-run here (not stored per-activity on the WO) to
    // recompute the per-activity breakdown for the traveler.
    const woActivities = new Map<number, { name: string; source_activity_id: number | null }[]>()
    const allSourceIds = new Set<number>()
    for (const wo of workOrders) {
      const acts = Array.isArray((wo.op_attributes as any)?.activities) ? (wo.op_attributes as any).activities : []
      woActivities.set(wo.id, acts)
      for (const a of acts) { if (a.source_activity_id) allSourceIds.add(a.source_activity_id) }
    }
    const activityRows = allSourceIds.size > 0
      ? await this.prisma.activity.findMany({
          where: { id: { in: [...allSourceIds] } },
          select: { id: true, formula_code: true, per_minute: true, duration_min: true, kind: true },
        })
      : []
    const activityMap = new Map(activityRows.map(a => [a.id, a]))

    // Batch-fetch every routing operation referenced across all WOs — same
    // soft-ref pattern as source_activity_id above (source_routing_op_id
    // has no FK; routing ops are template-level and this is a point-in-
    // time snapshot).
    const routingOpIds = [...new Set(workOrders.map(wo => wo.source_routing_op_id).filter((id): id is number => id != null))]
    const routingOpRows = routingOpIds.length > 0
      ? await this.prisma.mrp_routing_workcenter.findMany({
          where: { id: { in: routingOpIds } },
          select: { id: true, op_code: true, name: true },
        })
      : []
    const routingOpMap = new Map(routingOpRows.map(op => [op.id, op]))

    // Per-WO share of material consumption — printed on each traveler
    // (with an "Actual" hand-fill column) alongside the MO-wide Consume
    // table on the manifest, computed from the same underlying formulas.
    const consumeByWo = await this.mo.getConsumeSummaryByWorkOrder(moId)

    const missing: string[] = []
    const rows: MoPrintWorkOrderRow[] = []
    for (const wo of workOrders) {
      const assembly = wo.bom_assembly
      const dispatch = assembly.dispatch
      const zoneDrawings = drawingsByZone.get(zoneKey(dispatch.zone_id, dispatch.sub_zone_id)) ?? []
      const drawing = findLatestPdfForMark(zoneDrawings, assembly.assembly_mark)
      if (!drawing) {
        missing.push(`${wo.wo_code} (mark ${assembly.assembly_mark})`)
        continue
      }
      const { breakdown } = computeActivityDuration(woActivities.get(wo.id) ?? [], assembly, activityMap)
      const starts = wo.schedules.map(s => s.start_datetime.getTime())
      const ends = wo.schedules.map(s => s.end_datetime.getTime())

      rows.push({
        wo: {
          id: wo.id,
          wo_code: wo.wo_code,
          sequence: wo.sequence,
          status: wo.status,
          expected_duration_min: wo.expected_duration_min,
          setup_time_min: wo.setup_time_min,
        },
        workCenterName: wo.mrp_workcenter.name,
        assemblyMark: assembly.assembly_mark,
        qty: qtyByAssembly.get(assembly.id) ?? null,
        zoneLabel: dispatch.zone.label,
        subZoneName: dispatch.sub_zone?.name ?? null,
        projectName: dispatch.zone.project.name,
        projectCode: dispatch.zone.project.project_code,
        drawing: { file_key: drawing.file_key, file_name: drawing.file_name },
        operationLabel: wo.source_routing_op_id != null && routingOpMap.has(wo.source_routing_op_id)
          ? `${routingOpMap.get(wo.source_routing_op_id)!.op_code} — ${routingOpMap.get(wo.source_routing_op_id)!.name}`
          : null,
        activities: breakdown,
        woUrl: `${FRONTEND_BASE_URL}/order/wo/${wo.id}`,
        consume: consumeByWo.get(wo.id) ?? [],
        assemblyName: assembly.name ?? null,
        assemblyWeightKg: assembly.weight_kg != null ? Number(assembly.weight_kg) : null,
        assignedTo: wo.assigned_to ?? null,
        planStart: starts.length > 0 ? new Date(Math.min(...starts)) : null,
        planEnd: ends.length > 0 ? new Date(Math.max(...ends)) : null,
      })
    }

    if (missing.length > 0) {
      throw new ConflictException(`Cannot print — no drawing PDF uploaded yet for: ${missing.join(', ')}`)
    }

    const assemblyParts: MoPrintAssemblyPartGroup[] = lines.map(l => {
      const lineQty = Number(l.qty) || 1
      return {
        assemblyMark: l.bom_assembly.assembly_mark,
        name: l.bom_assembly.name,
        qty: Number(l.qty),
        parts: l.bom_assembly.assembly_parts.map(ap => {
          const qty = lineQty * (Number(ap.qty) || 1)
          return {
            part_mark: ap.part.part_mark,
            profile: ap.part.profile ?? null,
            grade: ap.part.grade ?? null,
            qty,
            weight_kg: ap.part.weight_kg != null ? Number(ap.part.weight_kg) * qty : null,
          }
        }),
      }
    })

    return { mo, rows, marks, assemblyParts }
  }
}
