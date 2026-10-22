import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { scopeKey, type BomScope, type RenameRow } from './mark-alias'

type RenameClient = { bom_mark_rename: PrismaService['bom_mark_rename'] }
const SELECT = { id: true, kind: true, from_mark: true, to_mark: true, dispatch_id: true } as const
// Fix round 1 (code review of 5370f60/716f4da, [[preshop-mark-rename-plan]]):
// a pre-shop pairing (mergePreshop's rename_from) must never leak into a
// BOM-side rename chain — bomCompare/linkBom, WorkOrdersService.
// compareAssemblyToLatest/acceptNewVersion and MoAllocationService all read
// the default (excludes PRE_SHOP-dispatch rows). Only a Drawing fallback
// (mo-print resolveCurrentRevSheets, which also backs the stale-drawing
// notice) and WorkOrdersService.formerMarks want the pre-shop piece's old
// name too, so they opt in with includePreshop.
export interface RenamesOpts { includePreshop?: boolean }
const notPreshop = { dispatch: { source: { not: 'PRE_SHOP' } } }

/** Loads confirmed mark/part pairs (2026-10-21). Leaf service: Prisma only, so
 *  BOM upload, MO, WO and print can all import it without a module cycle. */
@Injectable()
export class MarkAliasService {
  constructor(private readonly prisma: PrismaService) {}

  async renamesFor(scope: BomScope, opts: RenamesOpts = {}): Promise<RenameRow[]> {
    return this.prisma.bom_mark_rename.findMany({
      where: { project_id: scope.project_id, zone_id: scope.zone_id, sub_zone_id: scope.sub_zone_id, ...(opts.includePreshop ? {} : notPreshop) },
      select: SELECT,
      orderBy: [{ dispatch_id: 'asc' }, { id: 'asc' }],
    })
  }

  async renamesByScope(opts: RenamesOpts = {}): Promise<Map<string, RenameRow[]>> {
    const rows = await this.prisma.bom_mark_rename.findMany({
      where: opts.includePreshop ? undefined : notPreshop,
      select: { ...SELECT, project_id: true, zone_id: true, sub_zone_id: true },
      orderBy: [{ dispatch_id: 'asc' }, { id: 'asc' }],
    })
    const map = new Map<string, RenameRow[]>()
    for (const { project_id, zone_id, sub_zone_id, ...r } of rows) {
      const k = scopeKey({ project_id, zone_id, sub_zone_id })
      map.set(k, [...(map.get(k) ?? []), r])
    }
    return map
  }

  /** Every ACTIVE assembly mark in a scope — a former name in here is a
   *  different piece reusing it (see usableFormerNames). */
  async activeMarksFor(scope: BomScope): Promise<Set<string>> {
    const rows = await this.prisma.bom_assembly.findMany({
      where: { status: 'ACTIVE', dispatch: { project_id: scope.project_id, zone_id: scope.zone_id, sub_zone_id: scope.sub_zone_id } },
      select: { assembly_mark: true }, distinct: ['assembly_mark'],
    })
    return new Set(rows.map(r => r.assembly_mark))
  }

  /** First MO/WO accept through a pair — from then on it can't be undone (a1). */
  async markUsed(client: RenameClient, ids: number[]): Promise<void> {
    const unique = [...new Set(ids)]
    if (!unique.length) return
    await client.bom_mark_rename.updateMany({ where: { id: { in: unique }, used_at: null }, data: { used_at: new Date() } })
  }
}
