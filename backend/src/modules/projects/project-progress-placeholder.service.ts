import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

const PLACEHOLDER_ZONE_CODE = '__PENDING_BOM__'
const PLACEHOLDER_ZONE_LABEL = 'Pending BOM'

// BIM-first progress entry (2026-09) — see wiki
// project-progress-phase-tracking.md#2026-09-03--bim-first-progress-entry-design.
// One stable placeholder project_zone + bom_dispatch per project holds
// BIM-sourced bom_assembly rows before a real BOM exists. BIM re-uploads
// upsert into the SAME dispatch by mark (never a new dispatch generation —
// unlike real BOM re-uploads, nothing downstream snapshots a placeholder
// dispatch_id, so there's no drift-detection invariant requiring fresh rows
// per version).
@Injectable()
export class ProgressPlaceholderService {
  private readonly logger = new Logger(ProgressPlaceholderService.name)

  constructor(private readonly prisma: PrismaService) {}

  // Called after a BIM model's element extraction completes (see
  // BimService.checkStatus). No-ops once a real BOM exists for the project —
  // the placeholder mechanism only fills the gap before real BOM arrives.
  async syncFromBim(projectId: number, modelId: number, userId: number): Promise<{ created: number; skipped: number }> {
    const realAssembly = await this.prisma.bom_assembly.findFirst({
      where: { status: 'ACTIVE', dispatch: { project_id: projectId, source: 'BOM_UPLOAD' } },
      select: { id: true },
    })
    if (realAssembly) return { created: 0, skipped: 0 }

    const elements = await this.prisma.bim_element.findMany({
      where: { model_id: modelId, ifc_type: 'IfcElementAssembly', mark: { not: null } },
      select: { mark: true },
    })
    const allMarks = [...new Set(elements.map(e => e.mark as string))]
    if (!allMarks.length) return { created: 0, skipped: 0 }

    // bom_assembly.assembly_mark is VarChar(60); bim_element.mark is
    // VarChar(100) — a BIM mark over 60 chars would throw inside
    // createMany below and, since the caller (BimService.checkStatus)
    // wraps this whole method in a best-effort catch, silently zero out
    // the ENTIRE project's placeholder sync for this upload rather than
    // just skipping the one oversized mark. Filter it out here instead so
    // one bad mark can't take down every other mark in the same model.
    const MAX_ASSEMBLY_MARK_LENGTH = 60
    const marks = allMarks.filter(m => m.length <= MAX_ASSEMBLY_MARK_LENGTH)
    const oversized = allMarks.filter(m => m.length > MAX_ASSEMBLY_MARK_LENGTH)
    if (oversized.length) {
      this.logger.warn(`Skipping ${oversized.length} BIM mark(s) over ${MAX_ASSEMBLY_MARK_LENGTH} chars for project ${projectId}: ${oversized.join(', ')}`)
    }
    if (!marks.length) return { created: 0, skipped: allMarks.length }

    const zone = await this.ensurePlaceholderZone(projectId)
    const dispatch = await this.ensurePlaceholderDispatch(projectId, zone.id, userId)

    const result = await this.prisma.bom_assembly.createMany({
      data: marks.map(mark => ({
        dispatch_id: dispatch.id,
        assembly_mark: mark,
        create_uid: userId,
        write_uid: userId,
      })),
      skipDuplicates: true, // (dispatch_id, assembly_mark) unique — existing marks silently skipped, never updated
    })
    return { created: result.count, skipped: allMarks.length - result.count }
  }

  private async ensurePlaceholderZone(projectId: number) {
    const existing = await this.prisma.project_zone.findFirst({
      where: { project_id: projectId, is_placeholder: true },
    })
    if (existing) return existing
    return this.prisma.project_zone.create({
      data: { project_id: projectId, code: PLACEHOLDER_ZONE_CODE, label: PLACEHOLDER_ZONE_LABEL, is_placeholder: true },
    })
  }

  private async ensurePlaceholderDispatch(projectId: number, zoneId: number, userId: number) {
    const existing = await this.prisma.bom_dispatch.findFirst({
      where: { project_id: projectId, source: 'BIM_PLACEHOLDER' },
    })
    if (existing) return existing
    return this.prisma.bom_dispatch.create({
      data: {
        project_id: projectId, zone_id: zoneId, status: 'ready', source: 'BIM_PLACEHOLDER',
        create_uid: userId, write_uid: userId,
      },
    })
  }
}
