import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { effectiveQty, clampPcs, buildProgressCreateDefaults } from './progress-shared'
import { ProgressChangeLogService, type AuditableField } from './progress-change-log.service'

export interface HistoryBatchSummary {
  id: number
  source: string
  fileName: string | null
  rolledBackBatchId: number | null
  createdBy: string
  createdAt: Date
  affectedAssemblyCount: number
  rolledBack: boolean
}

export interface HistoryConflict { mark: string; field: string; changedBy: string; changedAt: Date }

@Injectable()
export class ProgressHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly changeLog: ProgressChangeLogService,
  ) {}

  async listBatches(projectCode: string): Promise<HistoryBatchSummary[]> {
    const project = await this.findProjectOrThrow(projectCode)
    const batches = await this.prisma.progress_change_batch.findMany({
      where: { project_id: project.id },
      orderBy: { create_date: 'desc' },
      include: { create_user: { select: { name: true } }, entries: { select: { assembly_id: true } } },
    })
    // A batch is "rolled back" iff some OTHER batch's rolled_back_batch_id
    // points at it — not a status column of its own, so it can't drift
    // from reality (see progress-change-log.service.ts's logBatch comment).
    const rollbackTargets = new Set(
      batches.filter(b => b.source === 'rollback' && b.rolled_back_batch_id != null).map(b => b.rolled_back_batch_id),
    )
    return batches.map(b => ({
      id: b.id,
      source: b.source,
      fileName: b.file_name,
      rolledBackBatchId: b.rolled_back_batch_id,
      createdBy: b.create_user.name,
      createdAt: b.create_date,
      affectedAssemblyCount: new Set(b.entries.map(e => e.assembly_id)).size,
      rolledBack: rollbackTargets.has(b.id),
    }))
  }

  async getBatchDetail(projectCode: string, batchId: number) {
    const project = await this.findProjectOrThrow(projectCode)
    const batch = await this.prisma.progress_change_batch.findFirst({
      where: { id: batchId, project_id: project.id },
      include: { entries: true, create_user: { select: { name: true } } },
    })
    if (!batch) throw new NotFoundException(`Batch ${batchId} not found in project ${projectCode}`)

    const { markOf, zoneOf } = await this.buildAssemblyLookup(batch.entries.map(e => e.assembly_id))
    return {
      id: batch.id,
      source: batch.source,
      fileName: batch.file_name,
      createdBy: batch.create_user.name,
      createdAt: batch.create_date,
      rolledBackBatchId: batch.rolled_back_batch_id,
      changes: batch.entries.map(e => ({
        zone: zoneOf.get(e.assembly_id) ?? '',
        mark: markOf.get(e.assembly_id) ?? `#${e.assembly_id}`,
        field: e.field,
        old: e.old_value,
        new: e.new_value,
      })),
    }
  }

  // Two-step: no force → detect + report conflicts (a field touched again
  // by a LATER batch than this one) without writing anything. force=true →
  // apply the old values back, creating a new "rollback" batch (itself
  // subject to the exact same logic — rolling back a rollback needs no
  // special-cased "undo of undo" path).
  async rollback(projectCode: string, batchId: number, userId: number, force: boolean): Promise<{ conflicts: HistoryConflict[]; newBatchId: number | null }> {
    const project = await this.findProjectOrThrow(projectCode)
    const batch = await this.prisma.progress_change_batch.findFirst({
      where: { id: batchId, project_id: project.id },
      include: { entries: true },
    })
    if (!batch) throw new NotFoundException(`Batch ${batchId} not found in project ${projectCode}`)

    const alreadyRolledBack = await this.prisma.progress_change_batch.findFirst({ where: { rolled_back_batch_id: batchId } })
    if (alreadyRolledBack) throw new BadRequestException('This batch has already been rolled back.')
    if (!batch.entries.length) return { conflicts: [], newBatchId: null }

    if (!force) {
      const conflicts = await this.detectConflicts(batch.id, batch.create_date, batch.entries)
      if (conflicts.length) return { conflicts, newBatchId: null }
    }

    // Group entries by assembly — a batch can touch the same assembly on
    // several fields, all revert in one upsert per assembly.
    const byAssembly = new Map<number, Record<string, unknown>>()
    for (const entry of batch.entries) {
      const fields = byAssembly.get(entry.assembly_id) ?? {}
      fields[entry.field] = this.changeLog.coerceForWrite(entry.field as AuditableField, entry.old_value)
      byAssembly.set(entry.assembly_id, fields)
    }
    const assemblyIds = [...byAssembly.keys()]
    const assemblies = await this.prisma.bom_assembly.findMany({ where: { id: { in: assemblyIds } }, select: { id: true, qty: true } })
    const qtyOf = new Map(assemblies.map(a => [a.id, effectiveQty(a.qty)]))

    const newBatchId = await this.prisma.$transaction(async tx => {
      const rows: { assemblyId: number; diff: ReturnType<ProgressChangeLogService['computeDiff']> }[] = []
      for (const [assemblyId, rawFields] of byAssembly) {
        const q = qtyOf.get(assemblyId) ?? 1
        // Same domain clamp any other write path applies — coerceForWrite
        // only does type parsing, pcs clamping needs live qty which it has
        // no access to (see its own doc comment).
        const fields: Record<string, unknown> = { ...rawFields }
        if ('loaded_pcs' in fields && fields.loaded_pcs != null) fields.loaded_pcs = clampPcs(Number(fields.loaded_pcs), q)
        if ('erected_pcs' in fields && fields.erected_pcs != null) fields.erected_pcs = clampPcs(Number(fields.erected_pcs), q)

        const current = await tx.bom_assembly_progress.findUnique({ where: { assembly_id: assemblyId } })
        const diff = this.changeLog.computeDiff(current, fields)
        await tx.bom_assembly_progress.upsert({
          where: { assembly_id: assemblyId },
          create: { assembly_id: assemblyId, ...buildProgressCreateDefaults(fields, userId) },
          update: { ...fields, write_uid: userId, write_date: new Date() },
        })
        rows.push({ assemblyId, diff })
      }
      // alwaysCreateBatch: the rollback record's existence IS the "already
      // rolled back" signal (see logBatch's own comment) — must persist
      // even if the resulting write was a no-op (e.g. someone already
      // manually reverted those exact fields in the meantime).
      const { batchId: id } = await this.changeLog.logBatch(tx, {
        projectId: project.id,
        source: 'rollback',
        rolledBackBatchId: batch.id,
        userId,
        rows,
        alwaysCreateBatch: true,
      })
      return id
    })

    return { conflicts: [], newBatchId }
  }

  private async detectConflicts(
    batchId: number,
    batchCreateDate: Date,
    entries: { assembly_id: number; field: string }[],
  ): Promise<HistoryConflict[]> {
    const laterEntries = await this.prisma.progress_change_entry.findMany({
      where: {
        OR: entries.map(e => ({ assembly_id: e.assembly_id, field: e.field })),
        batch: { create_date: { gt: batchCreateDate }, id: { not: batchId } },
      },
      include: { batch: { include: { create_user: { select: { name: true } } } } },
      orderBy: { batch: { create_date: 'desc' } },
    })
    // Most-recent-first ordering + first-write-wins per (assembly, field)
    // key gives the single latest conflicting change to report per field.
    const seen = new Map<string, (typeof laterEntries)[number]>()
    for (const e of laterEntries) {
      const key = `${e.assembly_id}:${e.field}`
      if (!seen.has(key)) seen.set(key, e)
    }
    if (!seen.size) return []

    const { markOf } = await this.buildAssemblyLookup([...seen.values()].map(e => e.assembly_id))
    return [...seen.values()].map(e => ({
      mark: markOf.get(e.assembly_id) ?? `#${e.assembly_id}`,
      field: e.field,
      changedBy: e.batch.create_user.name,
      changedAt: e.batch.create_date,
    }))
  }

  private async buildAssemblyLookup(assemblyIds: number[]): Promise<{ markOf: Map<number, string>; zoneOf: Map<number, string> }> {
    const ids = [...new Set(assemblyIds)]
    if (!ids.length) return { markOf: new Map(), zoneOf: new Map() }
    const assemblies = await this.prisma.bom_assembly.findMany({
      where: { id: { in: ids } },
      select: { id: true, assembly_mark: true, dispatch: { select: { zone_id: true } } },
    })
    const zoneIds = [...new Set(assemblies.map(a => a.dispatch.zone_id))]
    const zones = await this.prisma.project_zone.findMany({ where: { id: { in: zoneIds } }, select: { id: true, label: true } })
    const zoneLabel = new Map(zones.map(z => [z.id, z.label]))
    return {
      markOf: new Map(assemblies.map(a => [a.id, a.assembly_mark])),
      zoneOf: new Map(assemblies.map(a => [a.id, zoneLabel.get(a.dispatch.zone_id) ?? ''])),
    }
  }

  private async findProjectOrThrow(projectCode: string) {
    const project = await this.prisma.project.findUnique({ where: { project_code: projectCode } })
    if (!project) throw new NotFoundException(`Project ${projectCode} not found`)
    return project
  }
}
