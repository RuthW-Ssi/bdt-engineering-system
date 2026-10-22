import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { DrawingsService } from '../../drawings/drawings.service'
import { FileStorageService } from '../../file-storage/file-storage.service'
import { ManufacturingOrderService } from '../manufacturing-orders.service'
import { computeActivityDuration, type ActivityDurationBreakdownItem } from '../../work-orders/activity-duration.util'
import { buildMoPrintPdf } from './mo-print-pdf-builder'
import type { PrintLang } from './mo-print-labels'
import { currentRevSheetsWithAliases } from './mark-drawing-match'
import { summarizeOperations, type OperationSummary, printedDrawingRevs, renamesForRev, sourceLabelOf } from './mo-print-format'
import { staleDrawings, type CurrentDrawingRevItem, type StaleDrawingItem } from './drawing-rev-status'
import { MarkAliasService } from '../../mark-rename/mark-alias.service'
import { formerNames, scopeKey, usableFormerNames, type RenameRow } from '../../mark-rename/mark-alias'

export interface MoPrintWorkOrderRow {
  wo: {
    id: number
    wo_code: string
    sequence: number
    status: string
    expected_duration_min: number
    setup_time_min: number
    created_at: Date
  }
  workCenterName: string
  // Project/Zone — resolved once per WO from its primary (first non-removed)
  // mark's dispatch, not per mark (2026-09-21: removed as "duplication"
  // alongside Mark/Quantity when Team replaced them in Work Order Details,
  // then restored to that same spot the same day — "เอา project กับ zone
  // กลับมาไว้ที่เดิม" — Team stayed; only Mark/Quantity stay dropped, since
  // those really were shown again on Assembly List & QC, unlike Project/
  // Zone which isn't shown anywhere else on the traveler). A multi-mark
  // WO's marks could in principle span different projects/zones — unlike
  // `drawings` below (moved onto MoPrintAssemblyMarkRow on 2026-09-22 so
  // every mark's own drawing prints), Project/Zone stays this WO-level
  // single-value stopgap since nothing has asked to split it out yet.
  projectName: string
  projectCode: string
  zoneLabel: string
  subZoneName: string | null
  // The specific routing operation this WO was created from (e.g. "SAW
  // auto weld"), resolved from source_routing_op_id — a soft ref to
  // mrp_routing_workcenter, distinct from workCenterName (the physical
  // resource/station, e.g. "H-beam Fabrication"). Printed on the traveler
  // so the operator can see exactly which process step this is, not just
  // which station it runs on. Null for a WO with no routing-op link
  // (2026-09-16).
  operationLabel: string | null
  // Lucide icon key from the linked operation_template.icon (2026-09-29) —
  // drawn at the QR center + appended to the watermark in place of the
  // generic circle+check (see drawGenericIcon's caller in
  // mo-print-pdf-builder.ts). Null falls back to the generic mark — most
  // routing ops predate this field, and a WO with no routing-op link at all
  // has nothing to resolve it from either.
  icon: string | null
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
  // The traveler's Assembly List — every non-removed mark on this WO, one
  // row per mark (2026-09-21: "ทุก assembly ต้องรวมอยู่ใน wo เดียวกัน" — a
  // multi-mark WO prints as ONE traveler page listing all its marks
  // together, not a separate page per mark like before). No part
  // breakdown here (2026-09-16) — briefly added as a WO-level Parts page
  // on 2026-09-21, then reverted the same day: Parts are already reviewed/
  // edited per-WO in the Create Work Order modal (work_order_part, PATCH
  // /wo/:id/parts) and printed at the MO level on the manifest's Assembly
  // Part List (MoPrintAssemblyPartGroup below) — a third copy on every
  // traveler was redundant with both. Weight here is per piece, same as
  // the manifest's List Mark. Each mark also carries its own matched shop
  // drawing (2026-09-22: "wo มีหลายมาก mark ทำไมถึงแสดงแค่ print แค่ 1
  // drawing ต้อง print ทุก drawing ที่มี mark" — was resolved once per WO
  // from just the primary mark; now every mark gets its own drawing page,
  // see buildMoPrintPdf's per-mark loop).
  marks: MoPrintAssemblyMarkRow[]
  // The traveler's Production Time block: who the WO is issued to, and its
  // planned window — preferably the ACTIVE production schedule version
  // (earliest start → latest end across its schedule rows) when this WO has
  // been placed on one, otherwise the WO's own plan_start/plan_finish (set
  // at Create WO time) so the cell isn't blank just because the separate
  // scheduling feature hasn't been used yet (2026-09-22 fix — user report:
  // a WO with plan_start/plan_finish set was still printing blank here).
  // Still null (blank, hand-fill) when neither exists.
  assignedTo: string | null
  // How many people from the team are actually working this WO — internal
  // teams auto-count from active operators (editable), external teams enter
  // it manually at Create WO time (see CreateWoDto.team_headcount). Printed
  // next to Team on the traveler so the floor knows the planned crew size
  // (2026-09-25).
  teamHeadcount: number
  planStart: Date | null
  planEnd: Date | null
}

// Local dev's own .env now sets this to the real Vercel deploy (2026-09-28:
// "ทำให้ qr code scan แล้วเปิด link นี้ที") so a phone scanning a printed
// traveler's QR actually opens something instead of localhost.
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || 'http://localhost:5173'

export interface MoPrintConsumeItem {
  material_id: number
  code: string
  name: string
  qty: number
  unit: string | null
}

// One mark on the traveler's Assembly List & QC table (2026-09-21) — a WO
// can span several marks (multi-mark redesign), each gets its own row. Same
// field names as MoPrintMarkItem (the manifest's own per-mark shape).
// `drawings` (2026-09-22, became an array 2026-10-21) are this mark's own
// matched shop drawing sheets — a WO prints one drawing page per PAGE of
// every sheet of the mark's current rev, not one per WO (see
// buildMoPrintPdf) — see mark-drawing-match.ts's currentRevSheetsForMark.
export interface MoPrintAssemblyMarkRow {
  assemblyMark: string
  sourceLabel: string // 'Pre-shop' | 'BOM rev N' — printed in the Mark cell (2026-10-09)
  renamedFrom: string | null // old mark, only for the Rev that renamed it
  name: string | null
  qty: number | null
  weight_kg: number | null
  // Every sheet of the mark's current rev (2026-10-05 rev/date fields,
  // 2026-10-21 made an array) — all sheets share one rev, stamped on each
  // drawing page next to the WO · mark label.
  // [] = no PDF drawing yet (e.g. a pre-shop MO) — the mark still prints on
  // its traveler, just without a drawing page (2026-10-07).
  drawings: { file_key: string; file_name: string; rev: number; uploaded_at: Date }[]
  // Old name whose Drawing printed (2026-10-21) — set only when this mark
  // was renamed and has no PDF drawing of its own, so its former name's
  // current-rev sheets print instead (currentRevSheetsWithAliases). Feeds
  // the drawing page's "Drawing ของชื่อเดิม X" fragment.
  drawingFrom?: string | null
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
  sourceLabel: string
  renamedFrom: string | null
  name: string | null
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
    plan_start: Date | null
    plan_finish: Date | null
    actual_start: Date | null
    actual_finish: Date | null
    status: string
    primary_mark_prefix_code: string | null // optional since the MO-type change
    // MO type + version + whether any mark is still pre-shop data (2026-10-09) —
    // printed inside existing cells (MO Type replaces Mark Prefix; Rev rides on the MO code)
    shop_type: 'FULL_SHOP' | 'PRE_SHOP'
    revision: number
    preshopRemaining: boolean
    // Moved here from each Assembly List row (2026-09-22: "เอา project zone
    // ออกจาก assembly แล้วเอาไปไว้ตรง mo info แทน") — every assembly's
    // dispatch project/zone is the same one an MO is now scoped to at
    // create time (AssemblyPicker only offers one project+zone per MO), so
    // repeating it on every row was pure redundancy. Derived from the
    // MO's first assembly line; null only for an MO with none at all.
    projectCode: string | null
    projectName: string | null
    zoneLabel: string | null
    subZoneName: string | null
  }
  rows: MoPrintWorkOrderRow[]
  // The manifest's Routing checklist — every non-cancelled WO's operation,
  // regardless of `workOrderIds` (2026-09-22: "ทำไม routing ในหน้าแรกไม่
  // แสดง" — a selective print with few/no WOs chosen left this MO-wide
  // overview looking as filtered as `rows` above, when it's meant to
  // summarize the whole MO's routing plan independent of which travelers
  // got printed this time). Deliberately NOT derived from `rows`.
  routingOps: OperationSummary[]
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
const woMarkKey = (woId: number, assemblyMark: string) => `${woId}:${assemblyMark}`

// The shape resolveCurrentRevSheets() needs from each WO — a structural
// subset so buildPlan's full Prisma payload (mrp_workcenter, subcontractor,
// schedules, …) and drawingRevStatus()'s narrower `select` both satisfy it
// without either query carrying fields the other doesn't need.
// `dispatch_id` + `dispatch.project_id` (2026-10-21) — the rename scope a
// mark's former names are resolved within; both optional since
// drawingRevStatus()'s narrower `select` only adds them for this path (a
// caller that never widens its select still structurally satisfies this,
// just resolving zero aliases).
interface WoForDrawingMatch {
  id: number
  marks: {
    bom_assembly: {
      assembly_mark: string
      dispatch_id?: number
      dispatch: { project_id?: number; zone_id: number; sub_zone_id: number | null }
    }
  }[]
}

// One row of DrawingsService.findByZone()'s result — named here (rather
// than inlined at each use) so resolveCurrentRevSheets' return type and
// buildPlan's lookup map of it don't each repeat the same Awaited<ReturnType<…>> spelling.
type ZoneDrawingRow = Awaited<ReturnType<DrawingsService['findByZone']>>[number]

// resolveCurrentRevSheets()'s per-(WO, mark) result — every sheet of that
// mark's current rev, or [] when it has no PDF drawing at all. `fromMark`
// (2026-10-21) is the former name those sheets actually came from when the
// mark has no drawing of its own; `aliases` is every former name tried, fed
// straight into drawingRevStatus()'s stale-notice lookup so a log written
// under the old name still counts.
interface CurrentRevSheetEntry {
  woId: number
  assemblyMark: string
  sheets: ZoneDrawingRow[]
  fromMark: string | null
  aliases: string[]
}

// Orchestrates the data behind a printable MO/WO packet: pulls every
// non-cancelled WO on the MO, resolves every one of its marks' current-rev
// PDF drawing sheets (currentRevSheetsForMark — every sheet of the mark's
// own newest rev, same rule as the WO Visual Tab's single-pick uses for
// "current", ported server-side and extended to every sheet of that rev).
// A mark with no PDF drawing still prints on its traveler, just without a
// drawing page (2026-10-07, user: "ในกรณีที่ไม่มี drawing ก็ print ได้" —
// pre-shop MOs have no shop drawing yet); this used to block the whole
// packet (P0 decision 2026-09-15).
@Injectable()
export class MoPrintService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly drawings: DrawingsService,
    private readonly fileStorage: FileStorageService,
    private readonly mo: ManufacturingOrderService,
    private readonly alias: MarkAliasService = new MarkAliasService(prisma),
  ) {}

  // Composes buildPlan (data + each mark's drawing, if any) with buildMoPrintPdf
  // (layout + merge), reading each matched drawing's bytes directly via
  // FileStorageService.getObject — NOT getDownloadUrl. getDownloadUrl is
  // built for a browser: the local driver points it back at this same
  // JWT-guarded API (a server-to-server fetch can't authenticate that), and
  // even the GCS driver's presigned URL is unnecessary round-tripping when
  // the caller already runs inside this process. Caught live on local dev
  // (401 from the local driver's self-referential download URL) before this
  // shipped — see FileStorageDriver.getObject's own doc comment.
  // `includeManifest` (2026-09-21) — the MO overview page is its own toggle,
  // independent of `workOrderIds`, so "just the MO" (no WOs) is a valid ask.
  // `lang` (2026-09-29) — the form's own labels only; see mo-print-labels.ts.
  // `printedBy` given → the print is logged with the Rev it carries (2026-10-09),
  // only after the PDF built, so a failed print leaves no trace.
  async buildPdf(moId: number, workOrderIds?: number[], includeManifest = true, lang: PrintLang = 'en', printedBy?: string): Promise<Uint8Array> {
    const plan = await this.buildPlan(moId, workOrderIds, includeManifest)
    const bytes = await buildMoPrintPdf(
      plan,
      async (row, mark, sheet) => {
        try {
          return await this.fileStorage.getObject(sheet.file_key)
        } catch (err) {
          throw new Error(
            `Failed to read drawing "${sheet.file_name}" for ${row.wo.wo_code} (mark ${mark.assemblyMark}): ${err instanceof Error ? err.message : err}`,
          )
        }
      },
      includeManifest,
      lang,
    )
    if (printedBy) {
      await this.prisma.mo_print_log.create({
        data: {
          mo_id: moId,
          revision: plan.mo.revision,
          wo_ids: plan.rows.map(r => r.wo.id),
          include_manifest: includeManifest,
          printed_by: printedBy,
          // The rev of every (WO, mark) pair this print actually included a
          // drawing page for (2026-10-21) — feeds a later warn-only "drawing
          // changed since this paper was printed" notice.
          drawing_revs: printedDrawingRevs(plan),
        },
      })
    }
    return bytes
  }

  // `workOrderIds` (2026-09-21 selective print) — restricts which WOs get a
  // traveler page; omitted means every non-cancelled WO (prior behavior).
  // `includeManifest` — whether the MO overview page (marks/routing/
  // assembly-part-list, built from mo_assembly_line regardless of which WOs
  // are picked) is included at all; defaults true. At least one of "some WO"
  // or "the manifest" must end up selected — see the empty-result check below.
  async buildPlan(moId: number, workOrderIds?: number[], includeManifest = true): Promise<MoPrintPacketPlan> {
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
    // a mark renamed by the change that produced the current Rev prints "(เดิม …)"
    const renames = renamesForRev((await this.prisma.mo_status_history.findMany({ where: { mo_id: moId }, select: { reason: true } })).map(h => h.reason ?? ''), mo.revision)

    const marks: MoPrintMarkItem[] = lines.map((l, i) => {
      const assembly = l.bom_assembly
      return {
        seq: i + 1,
        assemblyMark: assembly.assembly_mark,
        sourceLabel: sourceLabelOf(assembly.dispatch),
        renamedFrom: renames.get(assembly.assembly_mark) ?? null,
        name: assembly.name,
        width_mm: assembly.width_mm != null ? Number(assembly.width_mm) : null,
        length_mm: assembly.length_mm != null ? Number(assembly.length_mm) : null,
        height_mm: assembly.height_mm != null ? Number(assembly.height_mm) : null,
        weight_kg: assembly.weight_kg != null ? Number(assembly.weight_kg) : null,
        qty: Number(l.qty),
      }
    })

    const workOrders = await this.prisma.work_order.findMany({
      where: {
        mo_id: moId,
        status: { not: 'CANCELLED' },
        ...(workOrderIds ? { id: { in: workOrderIds } } : {}),
      },
      // bom_assembly_id lived directly on work_order pre-multi-mark; a WO is
      // now per-operation (not per-mark), so sequence — the operation's own
      // order — replaces it as the sort key, with id as a stable tie-break
      // (2026-09-17 multi-mark redesign).
      orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
      include: {
        mrp_workcenter: true,
        subcontractor: { select: { name: true } },
        schedules: {
          where: { prod_schedule_version: { is_active: true } },
          select: { start_datetime: true, end_datetime: true },
        },
        // A WO can now span many marks — only non-removed ones print,
        // ordered by id (creation order) so marks[0] is a deterministic
        // "first mark" for the single-mark stopgaps below.
        marks: {
          where: { removed_at: null },
          orderBy: { id: 'asc' },
          include: {
            bom_assembly: { include: { dispatch: { include: { zone: { include: { project: true } }, sub_zone: true } } } },
          },
        },
      },
    })

    // 0 WOs is only a problem if there's also no manifest to fall back on —
    // "just the MO overview, no WO travelers" is a deliberately valid ask
    // (2026-09-21), so don't block it just because workOrders is empty.
    if (workOrders.length === 0 && !includeManifest) {
      throw new ConflictException(
        workOrderIds
          ? `MO ${mo.mo_code}: none of the selected work orders were found (already cancelled, or not on this MO), and the MO overview page was not selected either — nothing to print`
          : `MO ${mo.mo_code} has no work orders, and the MO overview page was not selected either — nothing to print`,
      )
    }

    // Every non-removed mark on every WO resolved to its current-rev PDF
    // sheets in one pass (2026-09-22: "ต้อง print ทุก drawing ที่มี mark" —
    // a multi-mark WO needs each mark's own drawing, and its marks can in
    // principle span zones) — shared with drawingRevStatus() below so print
    // and the stale-drawing status never disagree on "current rev".
    const sheetsByWoAndMark = new Map<string, ZoneDrawingRow[]>()
    // The former name each mark's printed sheets actually came from
    // (2026-10-21) — null for a mark with its own drawing, or no drawing at
    // all; feeds MoPrintAssemblyMarkRow.drawingFrom for the "Drawing ของชื่อ
    // เดิม X" fragment.
    const fromByWoAndMark = new Map<string, string | null>()
    for (const entry of await this.resolveCurrentRevSheets(workOrders)) {
      sheetsByWoAndMark.set(woMarkKey(entry.woId, entry.assemblyMark), entry.sheets)
      fromByWoAndMark.set(woMarkKey(entry.woId, entry.assemblyMark), entry.fromMark)
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
          select: { id: true, op_code: true, name: true, operation_template: { select: { icon: true } } },
        })
      : []
    const routingOpMap = new Map(routingOpRows.map(op => [op.id, op]))

    // Routing checklist source — every non-cancelled WO of the MO, NOT
    // filtered by workOrderIds (2026-09-22: see MoPrintPacketPlan.routingOps
    // doc comment). Skipped entirely when the manifest isn't even printed.
    const routingOps = includeManifest ? await this.getRoutingOps(moId) : []

    // Per-WO share of material consumption — printed on each traveler
    // (with an "Actual" hand-fill column) alongside the MO-wide Consume
    // table on the manifest, computed from the same underlying formulas.
    const consumeByWo = await this.mo.getConsumeSummaryByWorkOrder(moId)

    const rows: MoPrintWorkOrderRow[] = []
    for (const wo of workOrders) {
      // Project/Zone and the dimension-driven Activities breakdown are
      // still resolved once per WO from its first non-removed mark — a
      // narrower, still-deferred stopgap than drawing matching used to be
      // (see the marks loop below, 2026-09-22). A WO with no remaining
      // marks has nothing to print.
      const primaryMark = wo.marks[0]
      if (!primaryMark) continue

      const primaryAssembly = primaryMark.bom_assembly
      const primaryDispatch = primaryAssembly.dispatch
      const { breakdown } = computeActivityDuration(woActivities.get(wo.id) ?? [], primaryAssembly, activityMap)
      const starts = wo.schedules.map(s => s.start_datetime.getTime())
      const ends = wo.schedules.map(s => s.end_datetime.getTime())

      // One traveler page per WO, not per mark (2026-09-21: "ทุก assembly
      // ต้องรวมอยู่ใน wo เดียวกัน") — every non-removed mark on this WO
      // becomes one row of its Assembly List & QC table. But one drawing
      // page per PAGE of every sheet of the mark's current rev (2026-09-22:
      // "wo มีหลายมาก mark ทำไมถึงแสดงแค่ print แค่ 1 drawing ต้อง print ทุก
      // drawing ที่มี mark"; extended 2026-10-21 to every sheet, not just the
      // single newest one) — a mark with none keeps drawings: [] (no
      // drawing page, 2026-10-07).
      const marks: MoPrintAssemblyMarkRow[] = []
      for (const mark of wo.marks) {
        const assembly = mark.bom_assembly
        const dispatch = assembly.dispatch
        const sheets = sheetsByWoAndMark.get(woMarkKey(wo.id, assembly.assembly_mark)) ?? []
        marks.push({
          assemblyMark: assembly.assembly_mark,
          sourceLabel: sourceLabelOf(dispatch),
          renamedFrom: renames.get(assembly.assembly_mark) ?? null,
          name: assembly.name ?? null,
          qty: qtyByAssembly.get(mark.bom_assembly_id) ?? null,
          weight_kg: assembly.weight_kg != null ? Number(assembly.weight_kg) : null,
          drawings: sheets.map(s => ({ file_key: s.file_key, file_name: s.file_name, rev: s.rev ?? 0, uploaded_at: new Date(s.create_date) })),
          drawingFrom: fromByWoAndMark.get(woMarkKey(wo.id, assembly.assembly_mark)) ?? null,
        })
      }

      rows.push({
        wo: {
          id: wo.id,
          wo_code: wo.wo_code,
          sequence: wo.sequence,
          status: wo.status,
          expected_duration_min: wo.expected_duration_min,
          setup_time_min: wo.setup_time_min,
          created_at: wo.created_at,
        },
        workCenterName: wo.mrp_workcenter.name,
        projectName: primaryDispatch.zone.project.name,
        projectCode: primaryDispatch.zone.project.project_code,
        zoneLabel: primaryDispatch.zone.label,
        subZoneName: primaryDispatch.sub_zone?.name ?? null,
        operationLabel: wo.source_routing_op_id != null && routingOpMap.has(wo.source_routing_op_id)
          ? `${routingOpMap.get(wo.source_routing_op_id)!.op_code} — ${routingOpMap.get(wo.source_routing_op_id)!.name}`
          : null,
        icon: wo.source_routing_op_id != null
          ? routingOpMap.get(wo.source_routing_op_id)?.operation_template?.icon ?? null
          : null,
        activities: breakdown,
        // ?rev= — the WO page warns a scanner when this paper is older than the MO now (2026-10-09)
        woUrl: `${FRONTEND_BASE_URL}/order/wo/${wo.id}?rev=${mo.revision}`,
        consume: consumeByWo.get(wo.id) ?? [],
        marks,
        assignedTo: wo.subcontractor?.name ?? wo.assigned_to ?? null,
        teamHeadcount: wo.team_headcount,
        planStart: starts.length > 0 ? new Date(Math.min(...starts)) : wo.plan_start,
        planEnd: ends.length > 0 ? new Date(Math.max(...ends)) : wo.plan_finish,
      })
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

    // Derived from the MO's first assembly line — an MO is now scoped to
    // exactly one project+zone at create time, so any line's dispatch gives
    // the same answer; null only for an MO with no assembly lines at all.
    const firstDispatch = lines[0]?.bom_assembly.dispatch
    const moWithScope = {
      ...mo,
      projectCode: firstDispatch?.zone.project.project_code ?? null,
      projectName: firstDispatch?.zone.project.name ?? null,
      zoneLabel: firstDispatch?.zone.label ?? null,
      subZoneName: firstDispatch?.sub_zone?.name ?? null,
      preshopRemaining: lines.some(l => l.bom_assembly.dispatch.source === 'PRE_SHOP'),
    }

    return { mo: moWithScope, rows, routingOps, marks, assemblyParts }
  }

  // Shared by buildPlan (above) and drawingRevStatus (below): for every
  // non-removed mark across the given WOs, fetch its dispatch zone(+sub-
  // zone)'s drawing list (one findByZone call per distinct zone — every
  // mark of the same zone shares a list, deduped instead of re-fetched) and
  // resolve the mark's current-rev PDF sheets via currentRevSheetsForMark.
  // Extracted so the print packet and the stale-drawing status endpoint
  // always agree on what "current rev" means — never two separate queries
  // that could silently drift apart.
  private async resolveCurrentRevSheets(workOrders: WoForDrawingMatch[]): Promise<CurrentRevSheetEntry[]> {
    const drawingsByZone = new Map<string, ZoneDrawingRow[]>()
    const renamesByScope = new Map<string, RenameRow[]>()
    const activeByScope = new Map<string, Set<string>>()
    const out: CurrentRevSheetEntry[] = []
    for (const wo of workOrders) {
      for (const mark of wo.marks) {
        const a = mark.bom_assembly
        const { zone_id, sub_zone_id, project_id } = a.dispatch
        const key = zoneKey(zone_id, sub_zone_id)
        if (!drawingsByZone.has(key)) drawingsByZone.set(key, await this.drawings.findByZone(zone_id, sub_zone_id))
        // Former names (2026-10-21) — bounded by this row's own dispatch, so
        // a reused name never pulls another piece's drawings. Cached by
        // scope (not by mark) since many marks of the same dispatch share it.
        // A former name that is an ACTIVE mark in the scope right now is
        // another piece reusing it — skipped (its drawings are that piece's),
        // here and in the stale-notice lookup alike. Fetched once per scope,
        // only when some mark there has former names at all.
        let aliases: string[] = []
        let active: Set<string> | undefined
        if (project_id != null && a.dispatch_id != null) {
          const scope = { project_id, zone_id, sub_zone_id }
          const sk = scopeKey(scope)
          if (!renamesByScope.has(sk)) renamesByScope.set(sk, await this.alias.renamesFor(scope, { includePreshop: true }))
          aliases = formerNames(renamesByScope.get(sk)!, 'ASSEMBLY', a.assembly_mark, a.dispatch_id)
          if (aliases.length && !activeByScope.has(sk)) activeByScope.set(sk, await this.alias.activeMarksFor(scope))
          active = activeByScope.get(sk)
          aliases = usableFormerNames(aliases, active)
        }
        const zoneDrawings = drawingsByZone.get(key) ?? []
        const { sheets, fromMark } = currentRevSheetsWithAliases(zoneDrawings, a.assembly_mark, aliases, active)
        out.push({ woId: wo.id, assemblyMark: a.assembly_mark, sheets, fromMark, aliases })
      }
    }
    return out
  }

  // `GET /mo/:id/drawing-rev-status` (2026-10-21, Task 3) — warn-only: which
  // (WO, mark) pairs were printed with a drawing rev that is now stale
  // (current rev > the newest print log that covered that pair). Never
  // blocks Start/progress; purely informational, read by the MO/WO page to
  // show a notice icon. `woId` narrows to a single WO (e.g. the WO detail
  // page); omitted means every non-cancelled WO on the MO.
  //
  // Only non-cancelled WOs and only marks that currently have a drawing
  // (Review Focus 5: no drawing at all → absent, never a crash) feed into
  // `current`. Logs are read newest first (printed_at desc, id desc
  // tie-break) so staleDrawings() can take "the first log that mentions
  // this pair" as "the newest one that does" — see that helper for how a
  // legacy log (drawing_revs null) or a later partial reprint that omitted
  // the pair are handled.
  async drawingRevStatus(moId: number, woId?: number): Promise<{ items: StaleDrawingItem[] }> {
    const mo = await this.prisma.manufacturing_order.findUnique({ where: { id: moId }, select: { id: true } })
    if (!mo) throw new NotFoundException(`MO ${moId} not found`)

    const workOrders = await this.prisma.work_order.findMany({
      where: {
        mo_id: moId,
        status: { not: 'CANCELLED' },
        ...(woId !== undefined ? { id: woId } : {}),
      },
      orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        wo_code: true,
        marks: {
          where: { removed_at: null },
          orderBy: { id: 'asc' },
          select: {
            bom_assembly: { select: { assembly_mark: true, dispatch_id: true, dispatch: { select: { project_id: true, zone_id: true, sub_zone_id: true } } } },
          },
        },
      },
    })
    const woCodeById = new Map(workOrders.map(wo => [wo.id, wo.wo_code]))

    const current: CurrentDrawingRevItem[] = []
    for (const entry of await this.resolveCurrentRevSheets(workOrders)) {
      if (entry.sheets.length === 0) continue // no drawing at all → not tracked (Review Focus 5)
      const currentRev = Math.max(...entry.sheets.map(s => s.rev ?? 0))
      current.push({ wo_id: entry.woId, wo_code: woCodeById.get(entry.woId)!, mark: entry.assemblyMark, current_rev: currentRev, aliases: entry.aliases })
    }

    const logs = await this.prisma.mo_print_log.findMany({
      where: { mo_id: moId },
      orderBy: [{ printed_at: 'desc' }, { id: 'desc' }],
      select: { printed_at: true, drawing_revs: true },
    })

    const items = staleDrawings(logs, current)
      .sort((a, b) => a.wo_code.localeCompare(b.wo_code) || a.mark.localeCompare(b.mark))

    return { items }
  }

  // The MO's whole planned routing, ignoring `workOrderIds` — a separate,
  // lightweight query rather than reusing buildPlan's own (deliberately
  // filtered) `workOrders`, since the Routing checklist is meant to
  // summarize the MO's whole routing plan regardless of which WOs got
  // selected for this particular print (2026-09-22).
  //
  // Seeded from the routing template's own operations (always present,
  // snapshotted at MO create) rather than only from existing work_order
  // rows — a freshly confirmed MO has zero WOs until "Create Work Order" is
  // used, and a WO-only query printed a blank table for it (2026-09-22 bug
  // repro: MO-00011, CONFIRMED, 0 work orders, 2-op template → printed
  // Routing empty). Each template operation gets a row even with no WO yet
  // (woCodes: []); formatWoCodes() already renders that as "—".
  private async getRoutingOps(moId: number): Promise<OperationSummary[]> {
    const mo = await this.prisma.manufacturing_order.findUnique({
      where: { id: moId },
      select: { routing_template_id: true },
    })
    if (!mo || mo.routing_template_id == null) return []

    const templateOps = await this.prisma.mrp_routing_workcenter.findMany({
      where: { template_id: mo.routing_template_id },
      select: { sequence: true, op_code: true, name: true, workcenter: { select: { name: true } } },
    })

    const allWos = await this.prisma.work_order.findMany({
      where: { mo_id: moId, status: { not: 'CANCELLED' } },
      select: {
        wo_code: true,
        sequence: true,
        source_routing_op_id: true,
        mrp_workcenter: { select: { name: true } },
      },
    })
    const opIds = [...new Set(allWos.map(wo => wo.source_routing_op_id).filter((id): id is number => id != null))]
    const opRows = opIds.length > 0
      ? await this.prisma.mrp_routing_workcenter.findMany({
          where: { id: { in: opIds } },
          select: { id: true, op_code: true, name: true },
        })
      : []
    const opMap = new Map(opRows.map(op => [op.id, op]))
    const fromWos = summarizeOperations(allWos.map(wo => ({
      sequence: wo.sequence,
      operationLabel: wo.source_routing_op_id != null && opMap.has(wo.source_routing_op_id)
        ? `${opMap.get(wo.source_routing_op_id)!.op_code} — ${opMap.get(wo.source_routing_op_id)!.name}`
        : null,
      workCenterName: wo.mrp_workcenter.name,
      woCode: wo.wo_code,
    })))

    const seenSequences = new Set(fromWos.map(op => op.sequence))
    const plannedOnly: OperationSummary[] = templateOps
      .filter(op => !seenSequences.has(op.sequence))
      .map(op => ({
        sequence: op.sequence,
        operationLabel: `${op.op_code} — ${op.name}`,
        workCenterName: op.workcenter.name,
        woCodes: [],
      }))

    return [...fromWos, ...plannedOnly].sort((a, b) => a.sequence - b.sequence)
  }
}

