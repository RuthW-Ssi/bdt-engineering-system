import { BadRequestException, ConflictException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { MarkRenameService } from './mark-rename.service'
import { BomDiffService } from './bom-diff.service'

// Mirrors BomDiffService's own slotAwareWhere() shape — copied verbatim from
// bom-diff.service.spec.ts's matchesSlotAwareWhere().
function matchesSlotAwareWhere(row: { dispatch_id: number; slot?: string | null }, where: any): boolean {
  if (where == null) return false
  if (where.OR == null) return row.dispatch_id === where.dispatch_id
  return (where.OR as any[]).some(clause => {
    if (row.dispatch_id !== clause.dispatch_id) return false
    if (clause.OR == null) return true
    return (clause.OR as any[]).some(sc =>
      sc.slot === null ? (row.slot ?? null) === null : row.slot === sc.slot,
    )
  })
}

type Row = { id: number; dispatch_id: number; slot?: string | null; status: string; [k: string]: unknown }
const A = (id: number, d: number, mark: string, status = 'ACTIVE', slot: string | null = null, over: object = {}): Row =>
  ({ id, dispatch_id: d, slot, status, assembly_mark: mark, length_mm: '10550', weight_kg: '3561.15', assembly_parts: [], ...over })
const PRT = (id: number, d: number, mark: string, status = 'ACTIVE', slot: string | null = null): Row =>
  ({ id, dispatch_id: d, slot, status, part_mark: mark, profile: 'PL25x400', grade: 'SM520', length_mm: '10550', weight_kg: '828.17' })

function make(o: { asm: Row[]; parts?: Row[]; groups: any; progress?: any[]; paint?: any[]; renames?: any[]; entries?: number }) {
  const progress = [...(o.progress ?? [])]
  const paint = [...(o.paint ?? [])]
  const renames = [...(o.renames ?? [])]
  const events: any[] = []
  const prisma: any = {
    bom_dispatch: { findUnique: jest.fn().mockResolvedValue({ id: 9, project_id: 3, zone_id: 6, sub_zone_id: null }) },
    bom_assembly: {
      findMany: jest.fn(({ where }: any) => Promise.resolve(o.asm.filter(r => where.id?.in ? where.id.in.includes(r.id) : matchesSlotAwareWhere(r as any, where)))),
      findUnique: jest.fn(({ where }: any) => Promise.resolve(o.asm.find(r => r.id === where.id) ?? null)),
      count: jest.fn(({ where }: any) => Promise.resolve(o.asm.filter(r => r.dispatch_id === where.dispatch_id && r.status === 'ACTIVE').length)),
      update: jest.fn(({ where, data }: any) => { Object.assign(o.asm.find(r => r.id === where.id)!, data); return Promise.resolve() }),
    },
    bom_part: {
      findMany: jest.fn(({ where }: any) => Promise.resolve((o.parts ?? []).filter(r => matchesSlotAwareWhere(r as any, where)))),
      findUnique: jest.fn(({ where }: any) => Promise.resolve((o.parts ?? []).find(r => r.id === where.id) ?? null)),
      count: jest.fn(({ where }: any) => Promise.resolve((o.parts ?? []).filter(r => r.dispatch_id === where.dispatch_id && r.status === 'ACTIVE').length)),
    },
    bom_assembly_progress: {
      findMany: jest.fn(({ where }: any) => Promise.resolve(progress.filter(p => where.assembly_id.in.includes(p.assembly_id)))),
      findUnique: jest.fn(({ where }: any) => Promise.resolve(progress.find(p => p.assembly_id === where.assembly_id) ?? null)),
      create: jest.fn(({ data }: any) => { progress.push({ ...data }); return Promise.resolve(data) }),
      update: jest.fn(({ where, data }: any) => { Object.assign(progress.find(p => p.assembly_id === where.assembly_id), data); return Promise.resolve() }),
      delete: jest.fn(({ where }: any) => { progress.splice(progress.findIndex(p => p.assembly_id === where.assembly_id), 1); return Promise.resolve() }),
    },
    mbom_assembly_paint: {
      // the include of material is honoured: rows get { material: { name } } like Prisma returns
      findMany: jest.fn(({ where }: any) => Promise.resolve(paint.filter(p => (where.assembly_id?.in ?? [where.assembly_id]).includes(p.assembly_id))
        .map(p => ({ ...p, material: p.material ?? (p.material_id ? { name: 'Zinc' } : null) })))),
      deleteMany: jest.fn(({ where }: any) => { for (let i = paint.length - 1; i >= 0; i--) if (where.assembly_id ? paint[i].assembly_id === where.assembly_id : where.id.in.includes(paint[i].id)) paint.splice(i, 1); return Promise.resolve() }),
      createManyAndReturn: jest.fn(({ data }: any) => { const rows = data.map((d: any, i: number) => ({ id: 900 + paint.length + i, ...d })); paint.push(...rows); return Promise.resolve(rows) }),
      createMany: jest.fn(({ data }: any) => { paint.push(...data.map((d: any, i: number) => ({ id: 800 + i, ...d }))); return Promise.resolve() }),
    },
    materials: { findMany: jest.fn().mockResolvedValue([{ id: 1, name: 'Zinc' }]) },
    progress_change_entry: { count: jest.fn().mockResolvedValue(o.entries ?? 0) },
    bom_mark_rename: {
      findMany: jest.fn(() => Promise.resolve(renames)),
      findFirst: jest.fn(({ where }: any) => Promise.resolve(renames.find(r => r.id === where.id) ?? null)),
      create: jest.fn(({ data }: any) => { const r = { id: renames.length + 1, confirmed_at: new Date('2026-10-21T03:00:00Z'), used_at: null, ...data }; renames.push(r); return Promise.resolve(r) }),
      delete: jest.fn(({ where }: any) => { renames.splice(renames.findIndex(r => r.id === where.id), 1); return Promise.resolve() }),
      // Fix round 1, ruling 3 — the atomic "claim" delete undo() uses: only
      // removes the row (and reports count 1) if `used_at` still matches.
      deleteMany: jest.fn(({ where }: any) => {
        const before = renames.length
        for (let i = renames.length - 1; i >= 0; i--) {
          const r = renames[i]
          if (r.id === where.id && (!('used_at' in where) || r.used_at === where.used_at)) renames.splice(i, 1)
        }
        return Promise.resolve({ count: before - renames.length })
      }),
    },
    bom_mark_rename_event: { create: jest.fn(({ data }: any) => { events.push(data); return Promise.resolve(data) }), findMany: jest.fn(() => Promise.resolve(events)) },
    $transaction: jest.fn((cb: any) => cb(prisma)),
  }
  const diff: any = { findPreviousRevisionGroup: jest.fn().mockResolvedValue(o.groups), renameDispatchIds: jest.fn().mockReturnValue([9]) }
  return { svc: new MarkRenameService(prisma, diff), prisma, progress, paint, renames, events }
}

const COMBINED = { current: { mainId: 9, accId: 9 }, previous: { mainId: 5, accId: 5 } }
const prog = (assembly_id: number, over: object = {}) => ({ assembly_id, cut: 0, buildup: 0, weld1: 0, fitup_drill: 0, weld2: 0, qc_inspection: 0, primer: 0, fireproof: 0, top_coat: 0, qc_final: 0,
  fab_plan_finish_date: null, fab_actual_finish_date: null, plan_load_date: null, actual_load_date: null, loaded_pcs: 0, erected_pcs: 0,
  erection_plan_finish_date: null, erection_actual_finish_date: null, payment_status: 'Not Disbursed', write_uid: 1, ...over })

describe('MarkRenameService.candidates', () => {
  it('combined: BUH1B-18 disappeared, 3BUH1B-18 suggested; X (still present) never offered', async () => {
    const { svc } = make({ groups: COMBINED, asm: [A(1, 5, 'BUH1B-18', 'INACTIVE'), A(2, 5, 'X', 'INACTIVE'), A(11, 9, '3BUH1B-18'), A(12, 9, 'X')] })
    const c = await svc.candidates(9)
    expect(c.latest).toBe(true)
    expect(c.assemblies.map(a => [a.mark, a.suggestions.map(s => s.mark)])).toEqual([['BUH1B-18', ['3BUH1B-18']]])
    expect(c.new_assemblies.map(a => a.mark)).toEqual(['3BUH1B-18'])
  })

  // Review Focus 4
  it('separate mode: an ACC-only re-upload offers only ACC marks', async () => {
    const groups = { current: { mainId: 5, accId: 9 }, previous: { mainId: 5, accId: 7 } }
    const asm = [A(1, 5, 'M1', 'ACTIVE', 'MAIN'), A(2, 7, 'A1', 'INACTIVE', 'ACC'), A(3, 9, '3A1', 'ACTIVE', 'ACC')]
    const { svc } = make({ groups, asm })
    const c = await svc.candidates(9)
    expect(c.assemblies.map(a => a.mark)).toEqual(['A1'])
    expect(c.new_assemblies.map(a => a.mark)).toEqual(['3A1'])
  })

  it('no previous version → nothing to pair', async () => {
    const { svc } = make({ groups: null, asm: [A(11, 9, 'N')] })
    expect(await svc.candidates(9)).toMatchObject({ assemblies: [], parts: [], latest: true })
  })

  it('parts section: C-f1 disappeared, 3C-f1 suggested', async () => {
    const { svc } = make({ groups: COMBINED, asm: [], parts: [PRT(1, 5, 'C-f1', 'INACTIVE'), PRT(11, 9, '3C-f1')] })
    const c = await svc.candidates(9)
    expect(c.parts.map(p => [p.mark, p.suggestions[0]?.mark, p.suggestions[0]?.score])).toEqual([['C-f1', '3C-f1', 100]])
  })
})

describe('MarkRenameService.pair', () => {
  const base = () => ({ groups: COMBINED, asm: [A(1, 5, 'BUH1B-18', 'INACTIVE'), A(11, 9, '3BUH1B-18')] })

  it('carries progress + paint onto a new mark with no data of its own, records carried + History', async () => {
    const m = make({ ...base(), progress: [prog(1, { cut: 50 })], paint: [{ id: 1, dispatch_id: 5, assembly_id: 1, paint_type: 'primer', material_id: 1, layers: 2, material: { name: 'Zinc' } }] })
    await m.svc.pair(9, [{ kind: 'ASSEMBLY', from_mark: 'BUH1B-18', to_mark: '3BUH1B-18' }], 7, 'tao')
    expect(m.progress.find(p => p.assembly_id === 11)).toMatchObject({ cut: 50, write_uid: 7 })
    expect(m.paint.filter(p => p.assembly_id === 11)).toEqual([expect.objectContaining({ dispatch_id: 9, paint_type: 'primer', material_id: 1, layers: 2 })])
    expect(m.renames[0]).toMatchObject({ project_id: 3, zone_id: 6, sub_zone_id: null, dispatch_id: 9, kind: 'ASSEMBLY', from_ref_id: 1, to_ref_id: 11, confirmed_by: 'tao',
      carried: { keep: 'old', progress: { created: true, before: null }, paint: { created_ids: [expect.any(Number)], before: [] } } })
    expect(m.events[0]).toMatchObject({ action: 'PAIR', keep: 'old', recorded_by: 'tao',
      changes: expect.arrayContaining([{ field: 'ชื่อ mark', old: 'BUH1B-18', new: '3BUH1B-18' }, { field: 'cut', old: 0, new: 50 }, { field: 'สี primer', old: null, new: 'Zinc ×2' }]) })
  })

  it('b2: both names have data and no choice → 400 asking which set', async () => {
    const m = make({ ...base(), progress: [prog(1, { cut: 50 }), prog(11, { cut: 20 })] })
    await expect(m.svc.pair(9, [{ kind: 'ASSEMBLY', from_mark: 'BUH1B-18', to_mark: '3BUH1B-18' }], 7, 'tao'))
      .rejects.toThrow('BUH1B-18 → 3BUH1B-18: เลือกว่าจะใช้ข้อมูลของชื่อเดิมหรือชื่อใหม่')
  })

  // Fix round 1, ruling 2 — default keep = old side has data ? 'old' : 'new'
  it('b2 default: only the new mark has data → defaults to keep "new", nothing touched, no prompt', async () => {
    const m = make({ ...base(), progress: [prog(11, { cut: 20 })] }) // old (1) has no row at all; new (11) has data
    await m.svc.pair(9, [{ kind: 'ASSEMBLY', from_mark: 'BUH1B-18', to_mark: '3BUH1B-18' }], 7, 'tao')
    expect(m.progress.find(p => p.assembly_id === 11)!.cut).toBe(20)
    expect(m.renames[0].carried).toEqual({ keep: 'new' })
  })

  // Fix round 1, ruling 2 — keep:'old' mirrors the old set EXACTLY: a
  // category the old side has nothing in gets reset/cleared on the new mark,
  // not left untouched, and what was cleared is snapshotted for undo.
  it('b2 keep "old" mirrors exactly: old has progress but no paint → new mark\'s paint is cleared, undo restores it', async () => {
    const m = make({ ...base(), progress: [prog(1, { cut: 50 })],
      paint: [{ id: 2, dispatch_id: 9, assembly_id: 11, paint_type: 'topcoat', material_id: 1, layers: 1, material: { name: 'Zinc' } }] })
    await m.svc.pair(9, [{ kind: 'ASSEMBLY', from_mark: 'BUH1B-18', to_mark: '3BUH1B-18', keep: 'old' }], 7, 'tao')
    expect(m.progress.find(p => p.assembly_id === 11)!.cut).toBe(50)
    expect(m.paint.filter(p => p.assembly_id === 11)).toEqual([])

    await m.svc.undo(9, 1, 7, 'tao')
    expect(m.paint.filter(p => p.assembly_id === 11).map(p => [p.paint_type, p.layers])).toEqual([['topcoat', 1]])
  })

  it('b2 keep "new": nothing copied, carried says so', async () => {
    const m = make({ ...base(), progress: [prog(1, { cut: 50 }), prog(11, { cut: 20 })] })
    await m.svc.pair(9, [{ kind: 'ASSEMBLY', from_mark: 'BUH1B-18', to_mark: '3BUH1B-18', keep: 'new' }], 7, 'tao')
    expect(m.progress.find(p => p.assembly_id === 11)!.cut).toBe(20)
    expect(m.renames[0].carried).toEqual({ keep: 'new' })
  })

  // Review Focus 3
  it('b2 keep "old" then undo puts the new mark\'s own set back exactly', async () => {
    const own = prog(11, { cut: 20, fab_plan_finish_date: new Date('2026-11-02T00:00:00.000Z') })
    const m = make({ ...base(), progress: [prog(1, { cut: 50 }), own],
      paint: [{ id: 1, dispatch_id: 5, assembly_id: 1, paint_type: 'primer', material_id: 1, layers: 2, material: { name: 'Zinc' } },
        { id: 2, dispatch_id: 9, assembly_id: 11, paint_type: 'topcoat', material_id: 1, layers: 1, material: { name: 'Zinc' } }] })
    await m.svc.pair(9, [{ kind: 'ASSEMBLY', from_mark: 'BUH1B-18', to_mark: '3BUH1B-18', keep: 'old' }], 7, 'tao')
    expect(m.progress.find(p => p.assembly_id === 11)!.cut).toBe(50)
    expect(m.paint.filter(p => p.assembly_id === 11).map(p => p.paint_type)).toEqual(['primer'])

    await m.svc.undo(9, 1, 7, 'tao')
    const back = m.progress.find(p => p.assembly_id === 11)!
    expect(back.cut).toBe(20)
    expect(back.fab_plan_finish_date).toEqual(new Date('2026-11-02T00:00:00.000Z'))
    expect(m.paint.filter(p => p.assembly_id === 11).map(p => [p.paint_type, p.layers])).toEqual([['topcoat', 1]])
    expect(m.renames).toHaveLength(0)
    expect(m.events.map(e => e.action)).toEqual(['PAIR', 'UNDO'])
    expect(m.events[1].changes).toEqual(expect.arrayContaining([
      { field: 'ชื่อ mark', old: '3BUH1B-18', new: 'BUH1B-18' }, { field: 'cut', old: 50, new: 20 },
      { field: 'สี primer', old: 'Zinc ×2', new: null }, { field: 'สี topcoat', old: null, new: 'Zinc ×1' },
    ]))
  })

  it('undo of a carry onto an empty new mark deletes the copied progress row', async () => {
    const m = make({ ...base(), progress: [prog(1, { cut: 50 })] })
    await m.svc.pair(9, [{ kind: 'ASSEMBLY', from_mark: 'BUH1B-18', to_mark: '3BUH1B-18' }], 7, 'tao')
    await m.svc.undo(9, 1, 7, 'tao')
    expect(m.progress.find(p => p.assembly_id === 11)).toBeUndefined()
  })

  it('1 : 1 and only real candidates', async () => {
    const m = make({ groups: COMBINED, asm: [A(1, 5, 'P', 'INACTIVE'), A(2, 5, 'Q', 'INACTIVE'), A(11, 9, 'N')] })
    await expect(m.svc.pair(9, [{ kind: 'ASSEMBLY', from_mark: 'P', to_mark: 'N' }, { kind: 'ASSEMBLY', from_mark: 'Q', to_mark: 'N' }], 7, 'tao')).rejects.toThrow('N ถูกเลือกให้หลายชื่อ')
    await expect(m.svc.pair(9, [{ kind: 'ASSEMBLY', from_mark: 'N', to_mark: 'P' }], 7, 'tao')).rejects.toThrow(BadRequestException)
  })

  // Review Focus 5
  it('someone already paired it (unique hit) → 409 in plain Thai, not a 500', async () => {
    const m = make(base())
    m.prisma.$transaction.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '6' }))
    await expect(m.svc.pair(9, [{ kind: 'ASSEMBLY', from_mark: 'BUH1B-18', to_mark: '3BUH1B-18' }], 7, 'tao'))
      .rejects.toThrow('มีคนจับคู่ชื่อนี้ไปแล้ว — ปิดหน้านี้แล้วเปิดใหม่')
  })

  it('a newer upload superseded this version → 409', async () => {
    const m = make({ groups: COMBINED, asm: [A(1, 5, 'BUH1B-18', 'INACTIVE'), A(11, 9, '3BUH1B-18', 'INACTIVE')] })
    await expect(m.svc.pair(9, [{ kind: 'ASSEMBLY', from_mark: 'BUH1B-18', to_mark: '3BUH1B-18' }], 7, 'tao')).rejects.toThrow(ConflictException)
  })

  it('a part pair carries nothing and logs "ชื่อ part"', async () => {
    const m = make({ groups: COMBINED, asm: [], parts: [PRT(1, 5, 'C-f1', 'INACTIVE'), PRT(11, 9, '3C-f1')] })
    await m.svc.pair(9, [{ kind: 'PART', from_mark: 'C-f1', to_mark: '3C-f1' }], 7, 'tao')
    expect(m.renames[0]).toMatchObject({ kind: 'PART', from_ref_id: 1, to_ref_id: 11 })
    expect(m.renames[0].carried ?? null).toBeNull()
    expect(m.events[0].changes).toEqual([{ field: 'ชื่อ part', old: 'C-f1', new: '3C-f1' }])
  })

  // Fix round 1, ruling 1 — stale/double submit on an already-paired mark
  it('stale: from_mark (or to_mark) already paired in this version → 409, not 400', async () => {
    const already = { id: 1, project_id: 3, zone_id: 6, sub_zone_id: null, dispatch_id: 9, kind: 'ASSEMBLY',
      from_mark: 'BUH1B-18', to_mark: '3BUH1B-18', from_ref_id: 1, to_ref_id: 11, carried: { keep: 'new' },
      confirmed_by: 'someone-else', confirmed_at: new Date(), used_at: null }
    const m = make({ ...base(), renames: [already] })
    await expect(m.svc.pair(9, [{ kind: 'ASSEMBLY', from_mark: 'BUH1B-18', to_mark: '3BUH1B-18' }], 7, 'tao'))
      .rejects.toThrow(ConflictException)
    await expect(m.svc.pair(9, [{ kind: 'ASSEMBLY', from_mark: 'BUH1B-18', to_mark: '3BUH1B-18' }], 7, 'tao'))
      .rejects.toThrow('มีคนจับคู่ชื่อนี้ไปแล้ว — ปิดหน้านี้แล้วเปิดใหม่')
  })

  // Fix round 1, ruling 4 — paint edited after pairing blocks undo, same as
  // the progress rule
  it('refused once paint was edited on the new mark after pairing', async () => {
    const m = make({ ...base(), paint: [{ id: 1, dispatch_id: 5, assembly_id: 1, paint_type: 'primer', material_id: 1, layers: 2, material: { name: 'Zinc' } }] })
    await m.svc.pair(9, [{ kind: 'ASSEMBLY', from_mark: 'BUH1B-18', to_mark: '3BUH1B-18', keep: 'old' }], 7, 'tao')
    const row = m.paint.find(p => p.assembly_id === 11)!
    row.layers = 9 // someone edited the paint after pairing
    await expect(m.svc.undo(9, 1, 7, 'tao')).rejects.toThrow('แก้ค่าสีของ mark นี้หลังจับคู่แล้ว — ยกเลิกคู่ไม่ได้')
  })

  // Minor fix — re-check the `to` row is still ACTIVE inside the transaction
  it('a concurrent upload superseded the new mark mid-pair → 409, nothing written', async () => {
    const m = make(base())
    m.prisma.bom_assembly.findUnique.mockResolvedValueOnce({ status: 'INACTIVE' })
    await expect(m.svc.pair(9, [{ kind: 'ASSEMBLY', from_mark: 'BUH1B-18', to_mark: '3BUH1B-18' }], 7, 'tao')).rejects.toThrow(ConflictException)
    expect(m.renames).toHaveLength(0)
  })

  // Fix round 1, ruling 5 — big batches prefetch once, writes only inside the transaction
  it('big batches: progress + paint are prefetched once for all ids, not re-read per pair', async () => {
    const m = make({ groups: COMBINED,
      asm: [A(1, 5, 'P1', 'INACTIVE'), A(2, 5, 'P2', 'INACTIVE'), A(11, 9, 'N1'), A(12, 9, 'N2')],
      progress: [prog(1, { cut: 30 }), prog(2, { cut: 40 })] })
    await m.svc.pair(9, [{ kind: 'ASSEMBLY', from_mark: 'P1', to_mark: 'N1' }, { kind: 'ASSEMBLY', from_mark: 'P2', to_mark: 'N2' }], 7, 'tao')
    expect(m.prisma.bom_assembly_progress.findMany).toHaveBeenCalledTimes(1)
    expect(m.prisma.bom_assembly_progress.findUnique).not.toHaveBeenCalled()
    expect(m.prisma.mbom_assembly_paint.findMany).toHaveBeenCalledTimes(1)
    expect(m.progress.find(p => p.assembly_id === 11)!.cut).toBe(30)
    expect(m.progress.find(p => p.assembly_id === 12)!.cut).toBe(40)
  })
})

describe('MarkRenameService.undo — a1', () => {
  const paired = (over: object = {}) => ({ id: 1, dispatch_id: 9, kind: 'ASSEMBLY', from_mark: 'BUH1B-18', to_mark: '3BUH1B-18', from_ref_id: 1, to_ref_id: 11,
    carried: { keep: 'new' }, confirmed_at: new Date('2026-10-21T03:00:00Z'), used_at: null, ...over })

  it('refused once an MO/WO used it', async () => {
    const m = make({ groups: COMBINED, asm: [A(11, 9, '3BUH1B-18')], renames: [paired({ used_at: new Date() })] })
    await expect(m.svc.undo(9, 1, 7, 'tao')).rejects.toThrow('มี MO หรือ WO ใช้ชื่อ 3BUH1B-18 ตามคู่นี้แล้ว')
  })

  it('refused once Project Progress was entered on the new mark after pairing', async () => {
    const m = make({ groups: COMBINED, asm: [A(11, 9, '3BUH1B-18')], renames: [paired()], entries: 1 })
    await expect(m.svc.undo(9, 1, 7, 'tao')).rejects.toThrow('หลังจับคู่แล้ว')
    expect(m.prisma.progress_change_entry.count).toHaveBeenCalledWith({ where: { assembly_id: 11, batch: { create_date: { gt: new Date('2026-10-21T03:00:00Z') } } } })
  })

  // Fix round 1, ruling 3 — undo race: a concurrent undo/MO-WO-use claimed
  // the row first (atomic deleteMany count=0) → 409, never a 500
  it('undo race: a concurrent undo/use already claimed the row → 409, not a 500', async () => {
    const m = make({ groups: COMBINED, asm: [A(11, 9, '3BUH1B-18')], renames: [paired()] })
    m.prisma.bom_mark_rename.deleteMany.mockResolvedValueOnce({ count: 0 })
    await expect(m.svc.undo(9, 1, 7, 'tao')).rejects.toThrow('คู่นี้ถูกยกเลิกหรือถูกใช้ไปแล้ว — เปิดหน้าใหม่')
  })

  it('list() shows each pair with its undo_blocked reason', async () => {
    const m = make({ groups: COMBINED, asm: [A(11, 9, '3BUH1B-18')], renames: [paired({ used_at: new Date() })] })
    const l = await m.svc.list(9)
    expect(l.pairs[0]).toMatchObject({ from_mark: 'BUH1B-18', to_mark: '3BUH1B-18', keep: 'new', undo_blocked: expect.stringContaining('ยกเลิกคู่ไม่ได้') })
  })
})

// ── candidates() end-to-end with the REAL BomDiffService (bug fix, 2026-10-22) ──
//
// Every test above stubs `diff.findPreviousRevisionGroup()` directly, so it
// never exercises BomDiffService.resolveEffectiveGroup()'s own PRE_SHOP bug.
// These tests wire the real BomDiffService in, reproducing the live repro:
// project 16 / zone 33 had only two PRE_SHOP dispatches (58, 59 — per-MO
// pre-shop data, written by PreshopService.createDispatch with
// source='PRE_SHOP') before the zone's first real BOM_UPLOAD (60, "Start new
// version (1)"). The pairing dialog must open empty — PRE_SHOP marks/parts
// must never be offered as "disappeared" rename candidates.

describe('MarkRenameService.candidates — end-to-end with real BomDiffService (PRE_SHOP exclusion)', () => {
  type DRow = { id: number; project_id: number; zone_id: number; sub_zone_id: number | null; status: string; source: string; revision: number; doc_revisions: { doc_type: string }[] }

  function buildRealPrisma(dispatches: DRow[], asmRows: any[], partRows: any[] = []) {
    const prisma: any = {
      bom_dispatch: {
        findUnique: jest.fn(({ where }: any) => Promise.resolve(dispatches.find(d => d.id === where.id) ?? null)),
        findMany: jest.fn(({ where }: any) => {
          if (where?.id?.in) return Promise.resolve(dispatches.filter(d => where.id.in.includes(d.id)))
          let rows = dispatches.filter(d => d.project_id === where.project_id && d.zone_id === where.zone_id && d.sub_zone_id === where.sub_zone_id)
          if (where.status?.not) rows = rows.filter(d => d.status !== where.status.not)
          if (where.revision !== undefined) rows = rows.filter(d => d.revision === where.revision)
          if (where.id?.lte !== undefined) rows = rows.filter(d => d.id <= where.id.lte)
          if (where.id?.lt !== undefined) rows = rows.filter(d => d.id < where.id.lt)
          if (where.source !== undefined) rows = rows.filter(d => d.source === where.source)
          return Promise.resolve([...rows].sort((a, b) => b.id - a.id))
        }),
      },
      bom_assembly: {
        findMany: jest.fn(({ where }: any) => Promise.resolve(asmRows.filter(r => where.id?.in ? where.id.in.includes(r.id) : matchesSlotAwareWhere(r, where)))),
        count: jest.fn(({ where }: any) => Promise.resolve(asmRows.filter(r => r.dispatch_id === where.dispatch_id && r.status === 'ACTIVE').length)),
      },
      bom_part: {
        findMany: jest.fn(({ where }: any) => Promise.resolve(partRows.filter(r => matchesSlotAwareWhere(r, where)))),
        count: jest.fn(({ where }: any) => Promise.resolve(partRows.filter(r => r.dispatch_id === where.dispatch_id && r.status === 'ACTIVE').length)),
      },
      bom_assembly_progress: { findMany: jest.fn().mockResolvedValue([]) },
      mbom_assembly_paint: { findMany: jest.fn().mockResolvedValue([]) },
      bom_mark_rename: { findMany: jest.fn().mockResolvedValue([]) },
    }
    const diff = new BomDiffService(prisma)
    return { svc: new MarkRenameService(prisma, diff), prisma }
  }

  it('first real BOM upload in a zone that only has PRE_SHOP dispatches → no candidates, latest=true, nothing disappeared', async () => {
    const dispatches: DRow[] = [
      { id: 58, project_id: 16, zone_id: 33, sub_zone_id: null, status: 'ready', source: 'PRE_SHOP', revision: 0, doc_revisions: [] },
      { id: 59, project_id: 16, zone_id: 33, sub_zone_id: null, status: 'ready', source: 'PRE_SHOP', revision: 0, doc_revisions: [] },
      { id: 60, project_id: 16, zone_id: 33, sub_zone_id: null, status: 'complete', source: 'BOM_UPLOAD', revision: 1, doc_revisions: [{ doc_type: 'ASSEMBLY_LIST' }] },
    ]
    const asmRows = [
      A(1, 58, 'PS-A0'), A(2, 59, 'PS-A1'),
      A(11, 60, 'A1'),
    ]
    const partRows = [
      PRT(100, 58, 'p-516'), PRT(101, 59, 'p-517'),
    ]
    const { svc } = buildRealPrisma(dispatches, asmRows, partRows)

    const c = await svc.candidates(60)
    expect(c.latest).toBe(true)
    expect(c.assemblies).toEqual([])
    expect(c.parts).toEqual([])
    expect(c.new_assemblies).toEqual([])
    expect(c.new_parts).toEqual([])
  })

  it('a real v1 → v2 still produces rename candidates normally, with an unrelated PRE_SHOP dispatch in the mix', async () => {
    const dispatches: DRow[] = [
      { id: 58, project_id: 16, zone_id: 33, sub_zone_id: null, status: 'ready', source: 'PRE_SHOP', revision: 0, doc_revisions: [] },
      { id: 60, project_id: 16, zone_id: 33, sub_zone_id: null, status: 'complete', source: 'BOM_UPLOAD', revision: 1, doc_revisions: [{ doc_type: 'ASSEMBLY_LIST' }] },
      { id: 70, project_id: 16, zone_id: 33, sub_zone_id: null, status: 'complete', source: 'BOM_UPLOAD', revision: 2, doc_revisions: [{ doc_type: 'ASSEMBLY_LIST' }] },
    ]
    const asmRows = [
      A(1, 58, 'PS-A0'),
      A(11, 60, 'BUH1B-18', 'INACTIVE'), // v1's mark, superseded by v2
      A(12, 70, '3BUH1B-18'), // v2's renamed mark
    ]
    const { svc } = buildRealPrisma(dispatches, asmRows)

    const c = await svc.candidates(70)
    expect(c.latest).toBe(true)
    expect(c.assemblies.map(a => a.mark)).toEqual(['BUH1B-18'])
    expect(c.new_assemblies.map(a => a.mark)).toEqual(['3BUH1B-18'])
  })
})

describe('MarkRenameService — BOM Rev follows a rename pair (2026-10-26)', () => {
  it('pair copies the old rev onto a NEW-rev new name (recorded); undo puts it back', async () => {
    const asm = [A(1, 5, 'BUH1B-18', 'INACTIVE', null, { rev: 2, rev_source: 'MANUAL' }), A(11, 9, '3BUH1B-18', 'ACTIVE', null, { rev: 0, rev_source: 'NEW' })]
    const { svc, events, renames } = make({ groups: COMBINED, asm })
    await svc.pair(9, [{ kind: 'ASSEMBLY', from_mark: 'BUH1B-18', to_mark: '3BUH1B-18' }], 1, 'tao')
    expect(asm[1]).toMatchObject({ rev: 2, rev_source: 'CARRIED' })
    expect(events[0].changes).toContainEqual({ field: 'BOM Rev', old: 0, new: 2 })
    await svc.undo(9, renames[0].id, 1, 'tao')
    expect(asm[1]).toMatchObject({ rev: 0, rev_source: 'NEW' })
    expect(events[1].changes).toContainEqual({ field: 'BOM Rev', old: 2, new: 0 })
  })

  it('a new name whose rev came from the Dispatch Note keeps it', async () => {
    const asm = [A(1, 5, 'BUH1B-18', 'INACTIVE', null, { rev: 2, rev_source: 'MANUAL' }), A(11, 9, '3BUH1B-18', 'ACTIVE', null, { rev: 1, rev_source: 'DISPATCH_NOTE' })]
    const { svc, prisma } = make({ groups: COMBINED, asm })
    await svc.pair(9, [{ kind: 'ASSEMBLY', from_mark: 'BUH1B-18', to_mark: '3BUH1B-18' }], 1, 'tao')
    expect(prisma.bom_assembly.update).not.toHaveBeenCalled()
  })
})
