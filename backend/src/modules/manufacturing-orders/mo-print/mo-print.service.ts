import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { DrawingsService } from '../../drawings/drawings.service'
import { FileStorageService } from '../../file-storage/file-storage.service'
import { buildMoPrintPdf } from './mo-print-pdf-builder'
import { findLatestPdfForMark } from './mark-drawing-match'

export interface MoPrintWorkOrderRow {
  wo: {
    id: number
    wo_code: string
    sequence: number
    status: string
    expected_duration_min: number
  }
  workCenterName: string
  assemblyMark: string
  qty: number | null
  zoneLabel: string
  subZoneName: string | null
  projectName: string
  projectCode: string
  drawing: { file_key: string; file_name: string }
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

    const lines = await this.prisma.mo_assembly_line.findMany({ where: { mo_id: moId } })
    const qtyByAssembly = new Map<number, number>(lines.map(l => [l.bom_assembly_id, Number(l.qty)]))

    const workOrders = await this.prisma.work_order.findMany({
      where: { mo_id: moId, status: { not: 'CANCELLED' } },
      orderBy: [{ bom_assembly_id: 'asc' }, { sequence: 'asc' }],
      include: {
        mrp_workcenter: true,
        bom_assembly: { include: { dispatch: { include: { zone: { include: { project: true } }, sub_zone: true } } } },
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
      rows.push({
        wo: {
          id: wo.id,
          wo_code: wo.wo_code,
          sequence: wo.sequence,
          status: wo.status,
          expected_duration_min: wo.expected_duration_min,
        },
        workCenterName: wo.mrp_workcenter.name,
        assemblyMark: assembly.assembly_mark,
        qty: qtyByAssembly.get(assembly.id) ?? null,
        zoneLabel: dispatch.zone.label,
        subZoneName: dispatch.sub_zone?.name ?? null,
        projectName: dispatch.zone.project.name,
        projectCode: dispatch.zone.project.project_code,
        drawing: { file_key: drawing.file_key, file_name: drawing.file_name },
      })
    }

    if (missing.length > 0) {
      throw new ConflictException(`Cannot print — no drawing PDF uploaded yet for: ${missing.join(', ')}`)
    }

    return { mo, rows }
  }
}
