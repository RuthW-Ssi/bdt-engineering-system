import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { BomDiffService, slotAwareWhere } from './bom-diff.service'
import { ProgressChangeLogService } from '../projects/progress-change-log.service'
import { splitDisappeared, suggestAssemblies, suggestParts, type AsmRow, type PartRow } from '../mark-rename/rename-candidates'
import { dataSetOf, paintSetEqual, PROGRESS_DEFAULTS, restoreProgress, revCarryOf, snapshotProgress, undoBlockReason, type Carried, type PaintSnap, type RenameDataSet, type Snapshot } from '../mark-rename/rename-carry'
import type { RenameKind } from '../mark-rename/mark-alias'

// Either the top-level client or an in-progress transaction — blockReason()
// takes one of these so undo() can re-check the a1/paint rules INSIDE its
// transaction (fix round 1, ruling 3/4), not just before opening it.
type Db = PrismaService | Prisma.TransactionClient
// What carry()/candidates() need about one assembly's existing data,
// prefetched in bulk for a whole pair() batch (fix round 1, ruling 5) so the
// transaction itself only ever writes.
interface Prefetched { progressOf: (id: number) => Record<string, unknown> | null; paintOf: (id: number) => (PaintSnap & { material: { name: string } | null })[] }

export interface RenameOption { mark: string; ref_id: number; score: number | null; data: RenameDataSet | null }
export interface DisappearedMark { mark: string; ref_id: number; data: RenameDataSet | null; suggestions: RenameOption[] }
export interface RenameCandidates { dispatch_id: number; latest: boolean; assemblies: DisappearedMark[]; parts: DisappearedMark[]; new_assemblies: RenameOption[]; new_parts: RenameOption[] }
export interface RenamePairInput { kind: RenameKind; from_mark: string; to_mark: string; keep?: 'old' | 'new' }
export type Change = { field: string; old: string | number | null; new: string | number | null }
export interface RenamePair { id: number; kind: RenameKind; from_mark: string; to_mark: string; keep: 'old' | 'new' | null; confirmed_by: string; confirmed_at: Date; used_at: Date | null; undo_blocked: string | null }
export interface RenameEvent { id: number; kind: RenameKind; action: 'PAIR' | 'UNDO'; from_mark: string; to_mark: string; keep: string | null; changes: Change[]; recorded_by: string; recorded_at: Date }
export interface RenameList { pairs: RenamePair[]; history: RenameEvent[] }

const num = (v: unknown) => (v == null ? null : Number(v))
type AsmR = AsmRow & { dispatch_id: number; rev: number; rev_source: string | null }
type PartR = PartRow & { dispatch_id: number }
const ASM_SELECT = { id: true, dispatch_id: true, status: true, assembly_mark: true, length_mm: true, weight_kg: true, rev: true, rev_source: true,
  assembly_parts: { select: { qty: true, part: { select: { part_mark: true, profile: true, length_mm: true, grade: true, weight_kg: true } } } } } as const
const PART_SELECT = { id: true, dispatch_id: true, status: true, part_mark: true, profile: true, grade: true, length_mm: true, weight_kg: true } as const
const paintText = (p: { material?: { name: string } | null; layers: number } | undefined) => (p ? `${p.material?.name ?? '—'} ×${p.layers}` : null)

/** Mark / part renamed between dispatch versions (2026-10-21, [[bom-mark-rename-plan]]).
 *  The user confirms every pair; the system never pairs on its own. */
@Injectable()
export class MarkRenameService {
  private readonly progressDiff: ProgressChangeLogService
  constructor(private readonly prisma: PrismaService, private readonly diff: BomDiffService) {
    this.progressDiff = new ProgressChangeLogService(prisma)
  }

  // ── what disappeared / what is new ──────────────────────────────────────
  private async scan(dispatchId: number) {
    const d = await this.prisma.bom_dispatch.findUnique({ where: { id: dispatchId }, select: { id: true, project_id: true, zone_id: true, sub_zone_id: true } })
    if (!d) throw new NotFoundException('ไม่พบ BOM version นี้')
    const latest = (await this.prisma.bom_assembly.count({ where: { dispatch_id: dispatchId, status: 'ACTIVE' } })) > 0
      || (await this.prisma.bom_part.count({ where: { dispatch_id: dispatchId, status: 'ACTIVE' } })) > 0
    const groups = await this.diff.findPreviousRevisionGroup(dispatchId)
    if (!groups) return { d, latest, asm: { disappeared: [] as AsmR[], fresh: [] as AsmR[] }, part: { disappeared: [] as PartR[], fresh: [] as PartR[] }, paired: [] as { kind: string; from_mark: string; to_mark: string }[] }
    const prevW = slotAwareWhere(groups.previous)!
    const currW = slotAwareWhere(groups.current)!
    const [pa, ca, pp, cp] = await Promise.all([
      this.prisma.bom_assembly.findMany({ where: prevW, select: ASM_SELECT }),
      this.prisma.bom_assembly.findMany({ where: currW, select: ASM_SELECT }),
      this.prisma.bom_part.findMany({ where: prevW, select: PART_SELECT }),
      this.prisma.bom_part.findMany({ where: currW, select: PART_SELECT }),
    ])
    const paired = await this.prisma.bom_mark_rename.findMany({ where: { dispatch_id: { in: this.diff.renameDispatchIds(groups) } }, select: { kind: true, from_mark: true, to_mark: true } })
    const setOf = (k: string, f: 'from_mark' | 'to_mark') => new Set(paired.filter(p => p.kind === k).map(p => p[f]))
    const toAsm = (a: (typeof pa)[number]): AsmR => ({ id: a.id, dispatch_id: a.dispatch_id, rev: a.rev, rev_source: a.rev_source, mark: a.assembly_mark, length_mm: num(a.length_mm), weight_kg: num(a.weight_kg),
      parts: a.assembly_parts.map(ap => ({ part_mark: ap.part.part_mark, profile: ap.part.profile ?? '', length_mm: num(ap.part.length_mm) ?? 0, grade: ap.part.grade ?? '', qty: Number(ap.qty), unit_weight_kg: num(ap.part.weight_kg) ?? 0 })) })
    const toPart = (p: (typeof pp)[number]): PartR => ({ id: p.id, dispatch_id: p.dispatch_id, mark: p.part_mark, profile: p.profile, grade: p.grade, length_mm: num(p.length_mm), weight_kg: num(p.weight_kg) })
    // only ACTIVE rows can take a new name (pairing works on the latest version only)
    const asm = splitDisappeared(pa.map(toAsm), ca.filter(a => a.status === 'ACTIVE').map(toAsm), { from: setOf('ASSEMBLY', 'from_mark'), to: setOf('ASSEMBLY', 'to_mark') })
    const part = splitDisappeared(pp.map(toPart), cp.filter(p => p.status === 'ACTIVE').map(toPart), { from: setOf('PART', 'from_mark'), to: setOf('PART', 'to_mark') })
    return { d, latest, asm, part, paired }
  }

  /** Bulk-prefetches progress + paint for every id a pair() batch will touch,
   *  so the transaction itself only ever issues writes (fix round 1, ruling 5). */
  private async prefetchRaw(assemblyIds: number[]): Promise<Prefetched> {
    const [progress, paint] = await Promise.all([
      this.prisma.bom_assembly_progress.findMany({ where: { assembly_id: { in: assemblyIds } } }),
      this.prisma.mbom_assembly_paint.findMany({ where: { assembly_id: { in: assemblyIds } }, include: { material: { select: { name: true } } } }),
    ])
    return {
      progressOf: (id: number) => progress.find(p => p.assembly_id === id) ?? null,
      paintOf: (id: number) => paint.filter(p => p.assembly_id === id),
    }
  }

  private async dataSets(assemblyIds: number[]) {
    const { progressOf, paintOf } = await this.prefetchRaw(assemblyIds)
    return (id: number) => dataSetOf(progressOf(id), paintOf(id))
  }

  async candidates(dispatchId: number): Promise<RenameCandidates> {
    const s = await this.scan(dispatchId)
    const dataOf = await this.dataSets([...s.asm.disappeared, ...s.asm.fresh].map(a => a.id))
    const freshAsm = new Map(s.asm.fresh.map(a => [a.mark, a]))
    return {
      dispatch_id: dispatchId,
      latest: s.latest,
      assemblies: s.asm.disappeared.map(a => ({ mark: a.mark, ref_id: a.id, data: dataOf(a.id),
        suggestions: suggestAssemblies(a, s.asm.fresh).map(x => ({ ...x, data: dataOf(freshAsm.get(x.mark)!.id) })) })),
      parts: s.part.disappeared.map(p => ({ mark: p.mark, ref_id: p.id, data: null, suggestions: suggestParts(p, s.part.fresh).map(x => ({ ...x, data: null })) })),
      new_assemblies: s.asm.fresh.map(a => ({ mark: a.mark, ref_id: a.id, score: null, data: dataOf(a.id) })),
      new_parts: s.part.fresh.map(p => ({ mark: p.mark, ref_id: p.id, score: null, data: null })),
    }
  }

  // ── pair ────────────────────────────────────────────────────────────────
  async pair(dispatchId: number, items: RenamePairInput[], uid: number, userName: string): Promise<RenameList> {
    const s = await this.scan(dispatchId)
    if (!s.latest) throw new ConflictException('มี BOM version ใหม่กว่าแล้ว — จับคู่ได้เฉพาะ version ล่าสุด')
    for (const kind of ['ASSEMBLY', 'PART'] as const) {
      const of = items.filter(i => i.kind === kind)
      for (const f of ['from_mark', 'to_mark'] as const) {
        const dup = of.map(i => i[f]).find((m, i, all) => all.indexOf(m) !== i)
        if (dup) throw new BadRequestException(`${dup} ถูกเลือกให้หลายชื่อ — 1 ชื่อจับคู่ได้ครั้งเดียว`)
      }
    }
    // Fix round 1, ruling 1 — stale/double submit: someone already paired
    // this exact old or new name in this version. Checked BEFORE the
    // disappeared/fresh lookup below, so a stale resubmit reads as "someone
    // beat you to it" (409), not "that mark doesn't exist" (400).
    for (const i of items) {
      if (s.paired.some(p => p.kind === i.kind && (p.from_mark === i.from_mark || p.to_mark === i.to_mark))) {
        throw new ConflictException('มีคนจับคู่ชื่อนี้ไปแล้ว — ปิดหน้านี้แล้วเปิดใหม่')
      }
    }
    const plan = items.map(i => {
      const pool = i.kind === 'ASSEMBLY' ? s.asm : s.part
      const from = pool.disappeared.find(r => r.mark === i.from_mark)
      const to = pool.fresh.find(r => r.mark === i.to_mark)
      if (!from) throw new BadRequestException(`${i.from_mark} ไม่ได้หายไปใน version นี้ — จับคู่ไม่ได้`)
      if (!to) throw new BadRequestException(`${i.to_mark} ไม่ใช่ชื่อใหม่ของ version นี้ — จับคู่ไม่ได้`)
      return { ...i, from, to }
    })
    // Fix round 1, ruling 5 — bulk prefetch for the whole batch BEFORE the
    // transaction; carry() below only writes, never reads, inside it.
    const assemblyIds = plan.filter(p => p.kind === 'ASSEMBLY').flatMap(p => [p.from.id, p.to.id])
    const pre = await this.prefetchRaw(assemblyIds)
    for (const p of plan) {
      if (p.kind !== 'ASSEMBLY') continue
      const fromData = dataSetOf(pre.progressOf(p.from.id), pre.paintOf(p.from.id))
      const toData = dataSetOf(pre.progressOf(p.to.id), pre.paintOf(p.to.id))
      if (!p.keep) {
        if (fromData && toData) throw new BadRequestException(`${p.from_mark} → ${p.to_mark}: เลือกว่าจะใช้ข้อมูลของชื่อเดิมหรือชื่อใหม่`)
        // Fix round 1, ruling 2 — default = old side has data ? 'old' : 'new'.
        p.keep = fromData ? 'old' : 'new'
      }
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        for (const p of plan) {
          // Minor fix — re-check the `to` row is still ACTIVE inside the
          // transaction: closes the race between scan() (outside) and commit.
          const toRow = p.kind === 'ASSEMBLY'
            ? await tx.bom_assembly.findUnique({ where: { id: p.to.id }, select: { status: true } })
            : await tx.bom_part.findUnique({ where: { id: p.to.id }, select: { status: true } })
          if (toRow?.status !== 'ACTIVE') throw new ConflictException('มี BOM version ใหม่กว่าแล้ว — จับคู่ได้เฉพาะ version ล่าสุด')

          const label = p.kind === 'ASSEMBLY' ? 'ชื่อ mark' : 'ชื่อ part'
          const carry = p.kind === 'ASSEMBLY' ? await this.carry(tx, p.from.id, p.to.id, p.to.dispatch_id, p.keep as 'old' | 'new', uid, pre) : null
          const revMove = p.kind === 'ASSEMBLY' ? revCarryOf(p.from as AsmR, p.to as AsmR) : null
          if (revMove) await tx.bom_assembly.update({ where: { id: p.to.id }, data: { rev: revMove.after, rev_source: 'CARRIED' } })
          const carried = carry ? { ...carry.carried, ...(revMove ? { rev: revMove } : {}) } : null
          const revChange = revMove ? [{ field: 'BOM Rev', old: revMove.before, new: revMove.after }] : []
          await tx.bom_mark_rename.create({ data: {
            project_id: s.d.project_id, zone_id: s.d.zone_id, sub_zone_id: s.d.sub_zone_id, dispatch_id: p.to.dispatch_id,
            kind: p.kind, from_mark: p.from_mark, to_mark: p.to_mark, from_ref_id: p.from.id, to_ref_id: p.to.id,
            ...(carried ? { carried: carried as unknown as Prisma.InputJsonValue } : {}), confirmed_by: userName,
          } })
          await tx.bom_mark_rename_event.create({ data: {
            dispatch_id: p.to.dispatch_id, kind: p.kind, action: 'PAIR', from_mark: p.from_mark, to_mark: p.to_mark,
            keep: carry?.carried.keep ?? null, recorded_by: userName,
            changes: [{ field: label, old: p.from_mark, new: p.to_mark }, ...(carry?.changes ?? []), ...revChange] as unknown as Prisma.InputJsonValue,
          } })
        }
      })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('มีคนจับคู่ชื่อนี้ไปแล้ว — ปิดหน้านี้แล้วเปิดใหม่')
      throw e
    }
    return this.list(dispatchId)
  }

  /** b2 (decision 6) + fix round 1, ruling 2: keep 'old' mirrors the old
   *  name's whole set onto the new one EXACTLY — old's values where it has
   *  them, reset/cleared where it doesn't (snapshotting whatever that
   *  overwrote or cleared, so undo is exact); keep 'new' copies nothing.
   *  Reads come from `pre` (bulk-prefetched before the transaction, ruling
   *  5) — this method only ever writes. */
  private async carry(tx: Prisma.TransactionClient, oldId: number, newId: number, newDispatchId: number, keep: 'old' | 'new', uid: number, pre: Prefetched): Promise<{ carried: Carried; changes: Change[] }> {
    if (keep === 'new') return { carried: { keep: 'new' }, changes: [] }
    const carried: Carried = { keep: 'old' }
    const changes: Change[] = []

    const oldP = pre.progressOf(oldId)
    const newP = pre.progressOf(newId)
    if (oldP || newP) {
      const newSnapshot = newP ? snapshotProgress(newP) : null
      const values = restoreProgress(oldP ? snapshotProgress(oldP) : (PROGRESS_DEFAULTS as Snapshot))
      changes.push(...this.progressDiff.computeDiff(newP, values))
      if (newP) await tx.bom_assembly_progress.update({ where: { assembly_id: newId }, data: { ...values, write_uid: uid } as Prisma.bom_assembly_progressUncheckedUpdateInput })
      else await tx.bom_assembly_progress.create({ data: { assembly_id: newId, ...values, write_uid: uid } as Prisma.bom_assembly_progressUncheckedCreateInput })
      carried.progress = { created: !newP, before: newSnapshot }
    }

    const oldPaint = pre.paintOf(oldId)
    const newPaint = pre.paintOf(newId)
    if (oldPaint.length || newPaint.length) {
      if (newPaint.length) await tx.mbom_assembly_paint.deleteMany({ where: { assembly_id: newId } })
      const created = oldPaint.length
        ? await tx.mbom_assembly_paint.createManyAndReturn({ data: oldPaint.map(p => ({ dispatch_id: newDispatchId, assembly_id: newId, paint_type: p.paint_type, material_id: p.material_id, layers: p.layers })) })
        : []
      const after: PaintSnap[] = oldPaint.map(p => ({ paint_type: p.paint_type, material_id: p.material_id, layers: p.layers }))
      carried.paint = { created_ids: created.map(c => c.id), before: newPaint.map(p => ({ paint_type: p.paint_type, material_id: p.material_id, layers: p.layers })), after }
      for (const t of new Set([...oldPaint, ...newPaint].map(p => p.paint_type))) {
        const was = paintText(newPaint.find(p => p.paint_type === t)), now = paintText(oldPaint.find(p => p.paint_type === t))
        if (was !== now) changes.push({ field: `สี ${t}`, old: was, new: now })
      }
    }
    return { carried, changes }
  }

  // ── undo (a1) ───────────────────────────────────────────────────────────
  /** Takes either `this.prisma` (list(), the pre-transaction check in
   *  undo()) or the live `tx` (undo()'s in-transaction re-check, fix round
   *  1 ruling 3/4) — the rules must hold at write time, not just at read
   *  time, since both the progress-entry and paint checks race against
   *  someone else editing between the two reads. */
  private async blockReason(db: Db, r: { kind: string; to_mark: string; to_ref_id: number; used_at: Date | null; confirmed_at: Date; carried?: unknown }) {
    const to = r.kind === 'ASSEMBLY'
      ? await db.bom_assembly.findUnique({ where: { id: r.to_ref_id }, select: { status: true } })
      : await db.bom_part.findUnique({ where: { id: r.to_ref_id }, select: { status: true } })
    const progressEditedAfter = r.kind === 'ASSEMBLY'
      && (await db.progress_change_entry.count({ where: { assembly_id: r.to_ref_id, batch: { create_date: { gt: r.confirmed_at } } } })) > 0
    const carried = (r.carried ?? null) as Carried | null
    const paintEditedAfter = r.kind === 'ASSEMBLY' && !!carried?.paint
      ? !paintSetEqual(carried.paint.after, (await db.mbom_assembly_paint.findMany({ where: { assembly_id: r.to_ref_id } })).map(p => ({ paint_type: p.paint_type, material_id: p.material_id, layers: p.layers })))
      : false
    return undoBlockReason({ used_at: r.used_at, toActive: to?.status === 'ACTIVE', progressEditedAfter, paintEditedAfter, to_mark: r.to_mark })
  }

  async undo(dispatchId: number, renameId: number, uid: number, userName: string): Promise<RenameList> {
    const ids = await this.versionDispatchIds(dispatchId)
    const r = await this.prisma.bom_mark_rename.findFirst({ where: { id: renameId, dispatch_id: { in: ids } } })
    if (!r) throw new NotFoundException(`ไม่พบคู่ #${renameId} ใน version นี้`)
    const reason = await this.blockReason(this.prisma, r)
    if (reason) throw new ConflictException(reason)
    await this.prisma.$transaction(async (tx) => {
      // Fix round 1, ruling 3 — atomically claim the row first: if someone
      // else's undo (or an MO/WO use) already landed between our read above
      // and here, `used_at` is no longer null and this matches nothing.
      const claimed = await tx.bom_mark_rename.deleteMany({ where: { id: r.id, used_at: null } })
      if (claimed.count === 0) throw new ConflictException('คู่นี้ถูกยกเลิกหรือถูกใช้ไปแล้ว — เปิดหน้าใหม่')
      // Re-check the rules that could have changed since the read above
      // (progress entered, paint edited, version superseded) before writing.
      const reasonInTx = await this.blockReason(tx, r)
      if (reasonInTx) throw new ConflictException(reasonInTx)
      const changes = r.kind === 'ASSEMBLY' ? await this.revert(tx, r.to_ref_id, r.carried as unknown as Carried | null, uid) : []
      await tx.bom_mark_rename_event.create({ data: {
        dispatch_id: r.dispatch_id, kind: r.kind, action: 'UNDO', from_mark: r.from_mark, to_mark: r.to_mark, recorded_by: userName,
        keep: (r.carried as unknown as Carried | null)?.keep ?? null,
        changes: [{ field: r.kind === 'ASSEMBLY' ? 'ชื่อ mark' : 'ชื่อ part', old: r.to_mark, new: r.from_mark }, ...changes] as unknown as Prisma.InputJsonValue,
      } })
    })
    return this.list(dispatchId)
  }

  private async revert(tx: Prisma.TransactionClient, newId: number, c: Carried | null, uid: number): Promise<Change[]> {
    const changes: Change[] = []
    if (c?.progress) {
      const cur = await tx.bom_assembly_progress.findUnique({ where: { assembly_id: newId } })
      if (c.progress.created) {
        changes.push(...this.progressDiff.computeDiff(cur, PROGRESS_DEFAULTS))
        if (cur) await tx.bom_assembly_progress.delete({ where: { assembly_id: newId } })
      } else if (c.progress.before) {
        const before = restoreProgress(c.progress.before)
        changes.push(...this.progressDiff.computeDiff(cur, before))
        await tx.bom_assembly_progress.update({ where: { assembly_id: newId }, data: { ...before, write_uid: uid } as Prisma.bom_assembly_progressUncheckedUpdateInput })
      }
    }
    if (c?.paint) {
      const cur = await tx.mbom_assembly_paint.findMany({ where: { assembly_id: newId }, include: { material: { select: { name: true } } } })
      await tx.mbom_assembly_paint.deleteMany({ where: { id: { in: c.paint.created_ids } } })
      if (c.paint.before.length) {
        const a = await tx.bom_assembly.findUnique({ where: { id: newId }, select: { dispatch_id: true } })
        await tx.mbom_assembly_paint.createMany({ data: c.paint.before.map(p => ({ ...p, dispatch_id: a!.dispatch_id, assembly_id: newId })) })
      }
      const ids = c.paint.before.map(p => p.material_id).filter((x): x is number => x != null)
      const names = new Map((ids.length ? await tx.materials.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : []).map(m => [m.id, m.name]))
      const before = c.paint.before.map(p => ({ ...p, material: p.material_id != null ? { name: names.get(p.material_id) ?? '—' } : null }))
      for (const t of new Set([...cur, ...before].map(p => p.paint_type))) {
        const was = paintText(cur.find(p => p.paint_type === t)), now = paintText(before.find(p => p.paint_type === t))
        if (was !== now) changes.push({ field: `สี ${t}`, old: was, new: now })
      }
    }
    if (c?.rev) {
      await tx.bom_assembly.update({ where: { id: newId }, data: { rev: c.rev.before, rev_source: c.rev.before_source } })
      changes.push({ field: 'BOM Rev', old: c.rev.after, new: c.rev.before })
    }
    return changes
  }

  // ── read ────────────────────────────────────────────────────────────────
  private async versionDispatchIds(dispatchId: number): Promise<number[]> {
    const groups = await this.diff.findPreviousRevisionGroup(dispatchId)
    return groups ? this.diff.renameDispatchIds(groups) : [dispatchId]
  }

  async list(dispatchId: number): Promise<RenameList> {
    const ids = await this.versionDispatchIds(dispatchId)
    const rows = await this.prisma.bom_mark_rename.findMany({ where: { dispatch_id: { in: ids } }, orderBy: [{ kind: 'asc' }, { from_mark: 'asc' }] })
    const pairs: RenamePair[] = []
    for (const r of rows) {
      pairs.push({ id: r.id, kind: r.kind as RenameKind, from_mark: r.from_mark, to_mark: r.to_mark, keep: (r.carried as unknown as Carried | null)?.keep ?? null,
        confirmed_by: r.confirmed_by, confirmed_at: r.confirmed_at, used_at: r.used_at, undo_blocked: await this.blockReason(this.prisma, r) })
    }
    const history = (await this.prisma.bom_mark_rename_event.findMany({ where: { dispatch_id: { in: ids } }, orderBy: [{ recorded_at: 'desc' }, { id: 'desc' }] }))
      .map(e => ({ ...e, kind: e.kind as RenameKind, action: e.action as 'PAIR' | 'UNDO', changes: (e.changes as unknown as Change[] | null) ?? [] }))
    return { pairs, history }
  }
}
