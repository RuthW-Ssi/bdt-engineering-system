import { ConflictException, NotFoundException } from '@nestjs/common'
import { JobSheetService, MAX_JOB_SHEETS, MAX_ZONE_MOS, ZONE_MO_STATUSES, withTotals } from './job-sheet.service'

// Per-piece job sheet — service spec. Not yet run under Jest - run
// `pnpm jest job-sheet.service` before merge. The mocks follow the shapes
// JobSheetService reads; tighten them against mo-print.service.spec.ts's
// fixtures when this is picked up.

const packet = (over: Record<string, unknown> = {}) => ({
  mo: { id: 1, mo_code: 'MO-00001', revision: 2, plan_finish: new Date('2026-12-01T00:00:00Z'), projectCode: 'P001', projectName: 'Demo', zoneLabel: 'Z1', subZoneName: null },
  rows: [
    {
      wo: { id: 11, wo_code: 'WO-TEST-0011', sequence: 20 },
      operationLabel: 'DRILL — Drilling', workCenterName: 'Drill line',
      marks: [{ assemblyMark: 'A12', drawings: [{ file_key: 'k', file_name: 'A12.pdf', rev: 1, uploaded_at: new Date('2026-11-01T00:00:00Z') }] }],
    },
    {
      wo: { id: 10, wo_code: 'WO-TEST-0010', sequence: 10 },
      operationLabel: 'CUT — Cutting', workCenterName: 'Saw',
      marks: [{ assemblyMark: 'A12', drawings: [] }],
    },
  ],
  routingOps: [{ sequence: 10, operationLabel: 'CUT — Cutting', workCenterName: 'Saw', woCodes: [] }],
  ...over,
})

const line = (assemblyMark: string, qty: number, parts: { part_mark: string; qty: number; attributes?: unknown; profile?: string }[], zoneId = 5) => ({
  qty,
  bom_assembly: {
    assembly_mark: assemblyMark,
    name: 'Column',
    dispatch: { zone_id: zoneId, sub_zone_id: null, zone: { label: 'Z1', project: { project_code: 'P001', name: 'Demo' } }, sub_zone: null },
    assembly_parts: parts.map(p => ({
      qty: p.qty,
      part: { part_mark: p.part_mark, description: null, profile: p.profile ?? 'PL12x200', grade: 'SS400', length_mm: 500, weight_kg: 9.42, attributes: p.attributes ?? {} },
    })),
  },
})

function makeService(lines: unknown[], partLines: unknown[] = [], pk = packet(), extra: Record<string, unknown> = {}) {
  const prisma = {
    mo_assembly_line: { findMany: jest.fn().mockResolvedValue(lines) },
    mo_part_line: { findMany: jest.fn().mockResolvedValue(partLines) },
    manufacturing_order: { findUnique: jest.fn().mockResolvedValue({ zone_id: 5, sub_zone_id: null }), findMany: jest.fn().mockResolvedValue([]) },
    project_zone: { findUnique: jest.fn().mockResolvedValue({ id: 5, code: 'Z1', label: 'Zone 1', project: { project_code: 'P001' } }) },
    ...extra,
  }
  const moPrint = { buildPlan: jest.fn().mockResolvedValue(pk) }
  return { svc: new JobSheetService(prisma as never, moPrint as never), prisma, moPrint }
}

describe('JobSheetService.buildPlan', () => {
  it('prints one sheet per physical piece (line qty x per-assembly qty)', async () => {
    const { svc } = makeService([line('A12', 2, [{ part_mark: 'P101', qty: 3 }])])
    const plan = await svc.buildPlan(1)
    expect(plan.sheets).toHaveLength(6)
    expect(plan.sheets[0]).toMatchObject({ sheetNo: 1, pieceNo: 1, pieceTotal: 6, partMark: 'P101', assemblyMark: 'A12', thickness_mm: 12, width_mm: 200, heatNo: null, plateId: null })
    expect(plan.sheets[5].pieceId).toBe('MO-00001/A12/P101/06-06')
    expect(plan.sheets[0]).toMatchObject({ moId: 1, moCode: 'MO-00001', moRevision: 2 })
  })

  it('part mode prints one sheet per part mark', async () => {
    const { svc } = makeService([line('A12', 2, [{ part_mark: 'P101', qty: 3 }, { part_mark: 'P102', qty: 1 }])])
    const plan = await svc.buildPlan(1, { mode: 'part' })
    expect(plan.sheets.map(s => [s.partMark, s.pieceNo, s.pieceTotal])).toEqual([['P101', null, 6], ['P102', null, 2]])
  })

  it('lists every WO operation of the assembly in sequence order, with the drawing reference', async () => {
    const { svc } = makeService([line('A12', 1, [{ part_mark: 'P101', qty: 1 }])])
    const [sheet] = (await svc.buildPlan(1)).sheets
    expect(sheet.routing.map(op => op.woCode)).toEqual(['WO-TEST-0010', 'WO-TEST-0011'])
    expect(sheet.drawings).toEqual([{ file_name: 'A12.pdf', rev: 1, uploaded_at: new Date('2026-11-01T00:00:00Z') }])
    expect(sheet.qrUrl).toContain('/order/wo/10?')
    expect(sheet.qrUrl).toContain('part=P101')
  })

  it('reads hole groups from part attributes, else from the MO part line of the same mark', async () => {
    const { svc } = makeService(
      [line('A12', 1, [{ part_mark: 'P101', qty: 1, attributes: { holes: [{ diameter_mm: 22, count: 4 }] } }, { part_mark: 'P102', qty: 1 }, { part_mark: 'P103', qty: 1 }])],
      [{ part_mark: 'P102', holes: [{ diameter_mm: 18, count: 2 }], mark: null }],
    )
    const sheets = (await svc.buildPlan(1)).sheets
    expect(sheets[0]).toMatchObject({ holesKnown: true, holes: [{ diameter_mm: 22, count: 4 }] })
    expect(sheets[1]).toMatchObject({ holesKnown: true, holes: [{ diameter_mm: 18, count: 2 }] })
    expect(sheets[2]).toMatchObject({ holesKnown: false, holes: [] }) // unknown ≠ zero holes
  })

  it('wo_ids keeps only assemblies on the selected WOs', async () => {
    const { svc } = makeService([line('A12', 1, [{ part_mark: 'P101', qty: 1 }]), line('B07', 1, [{ part_mark: 'P201', qty: 1 }])])
    const plan = await svc.buildPlan(1, { woIds: [11] })
    expect(plan.sheets.map(s => s.assemblyMark)).toEqual(['A12'])
  })

  it('zone_id keeps only assemblies dispatched to that zone', async () => {
    const { svc } = makeService([line('A12', 1, [{ part_mark: 'P101', qty: 1 }], 5), line('B07', 1, [{ part_mark: 'P201', qty: 1 }], 6)])
    const plan = await svc.buildPlan(1, { zoneId: 6 })
    expect(plan.sheets.map(s => s.assemblyMark)).toEqual(['B07'])
  })

  it('409 JOB_SHEET_EMPTY when nothing matches', async () => {
    const { svc } = makeService([line('A12', 1, [{ part_mark: 'P101', qty: 1 }])])
    await expect(svc.buildPlan(1, { partMarks: ['NOPE'] })).rejects.toBeInstanceOf(ConflictException)
  })

  it('409 JOB_SHEET_TOO_MANY above the cap, but the same batch fits in part mode', async () => {
    const lines = [line('A12', MAX_JOB_SHEETS + 1, [{ part_mark: 'P101', qty: 1 }])]
    await expect(makeService(lines).svc.buildPlan(1)).rejects.toMatchObject({ response: { code: 'JOB_SHEET_TOO_MANY' } })
    await expect(makeService(lines).svc.buildPlan(1, { mode: 'part' })).resolves.toMatchObject({ sheets: [{ pieceTotal: MAX_JOB_SHEETS + 1 }] })
  })

  it('a size-based MO Part (no assembly lines) prints its own lines', async () => {
    const { svc } = makeService([], [{ part_mark: null, profile: 'PL9x150', grade: 'SS400', length_mm: 300, qty: 2, unit_weight_kg: 3.18, holes: [], mark: { mark: 'M1' } }])
    const plan = await svc.buildPlan(1)
    expect(plan.sheets).toHaveLength(2)
    expect(plan.sheets[0]).toMatchObject({ source: 'MO_PART_LINE', assemblyMark: 'M1', partMark: 'PL9x150 L300', thickness_mm: 9, width_mm: 150 })
  })

  it('an assembly with no WO falls back to the MO routing template (QR → /mo/:id)', async () => {
    const { svc } = makeService([line('Z99', 1, [{ part_mark: 'P900', qty: 1 }])])
    const [sheet] = (await svc.buildPlan(1)).sheets
    expect(sheet.routing).toEqual([{ sequence: 10, operationLabel: 'CUT — Cutting', workCenterName: 'Saw', woCode: null, woId: null }])
    expect(sheet.drawings).toEqual([])
    expect(sheet.qrUrl).toContain('/mo/1?')
    expect(sheet.qrUrl).toContain('asm=Z99')
  })

  it('preview() totals: sheets / partMarks / pieces / weight_kg / missing-data counts', async () => {
    const { svc } = makeService([line('A12', 2, [{ part_mark: 'P101', qty: 1 }]), line('Z99', 1, [{ part_mark: 'P900', qty: 1 }])])
    const pv = await svc.preview(1)
    expect(pv.totals).toEqual({ sheets: 3, partMarks: 2, pieces: 3, weight_kg: 28.26, withoutHoleData: 3, withoutDrawing: 1, withoutRouting: 0 })
    expect(pv.max_sheets).toBe(MAX_JOB_SHEETS)
  })

  it('heat_no / plate_id are read from bom_part.attributes when present (plate heat traceability hand-over point)', async () => {
    const { svc } = makeService([line('A12', 1, [{ part_mark: 'P101', qty: 1, attributes: { heat_no: 'H123', plate_id: 'PLT-7' } }])])
    const [sheet] = (await svc.buildPlan(1)).sheets
    expect(sheet).toMatchObject({ heatNo: 'H123', plateId: 'PLT-7' })
  })

  it('404 from MoPrintService.buildPlan (unknown MO) propagates unchanged', async () => {
    const { svc, moPrint } = makeService([])
    const notFound = new NotFoundException({ message: 'MO 999 not found' })
    moPrint.buildPlan.mockRejectedValueOnce(notFound)
    await expect(svc.buildPlan(999)).rejects.toBe(notFound)
  })
})

// Zone batch (GET /mo/job-sheets/zone/:zoneId) — buildPlan is spied so these
// cases test only the cross-MO concatenation, caps and skips.
describe('JobSheetService.buildZonePlan', () => {
  const sheetOf = (moId: number, moCode: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({ moId, moCode, moRevision: 0, sheetNo: i + 1, assemblyMark: 'A1', partMark: `P${i}`, pieceTotal: 1, unitWeight_kg: 1, holesKnown: true, drawings: [], routing: [] }))
  const planOf = (moId: number, moCode: string, n: number) => ({ mo: { id: moId, mo_code: moCode, revision: 0, plan_finish: null }, mode: 'piece', sheets: sheetOf(moId, moCode, n), generatedAt: new Date() })

  function zoneService(mos: { id: number; mo_code: string }[]) {
    const made = makeService([])
    made.prisma.manufacturing_order.findMany.mockResolvedValue(mos)
    const spy = jest.spyOn(made.svc, 'buildPlan')
    return { ...made, spy }
  }

  it('concatenates every MO of the zone in MO-code order and renumbers the sheets', async () => {
    const { svc, spy, prisma } = zoneService([{ id: 1, mo_code: 'MO-1' }, { id: 2, mo_code: 'MO-2' }])
    spy.mockResolvedValueOnce(planOf(1, 'MO-1', 2) as never).mockResolvedValueOnce(planOf(2, 'MO-2', 3) as never)
    const plan = await svc.buildZonePlan(5, { mode: 'piece' })
    expect(plan.mo).toBeNull()
    expect(plan.zone).toMatchObject({ id: 5, code: 'Z1', moCodes: ['MO-1', 'MO-2'], skippedMoCodes: [] })
    expect(plan.sheets.map(s => [s.moCode, s.sheetNo])).toEqual([['MO-1', 1], ['MO-1', 2], ['MO-2', 3], ['MO-2', 4], ['MO-2', 5]])
    expect(spy).toHaveBeenCalledWith(1, expect.objectContaining({ zoneId: 5, mode: 'piece' }))
    expect(prisma.manufacturing_order.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: { in: ZONE_MO_STATUSES } }) }))
  })

  it('skips an MO with nothing matching instead of failing the batch', async () => {
    const { svc, spy } = zoneService([{ id: 1, mo_code: 'MO-1' }, { id: 2, mo_code: 'MO-2' }])
    spy.mockRejectedValueOnce(new ConflictException({ code: 'JOB_SHEET_EMPTY' })).mockResolvedValueOnce(planOf(2, 'MO-2', 1) as never)
    const plan = await svc.buildZonePlan(5)
    expect(plan.zone).toMatchObject({ moCodes: ['MO-2'], skippedMoCodes: ['MO-1'] })
  })

  it('404 ZONE_NOT_FOUND for an unknown zone', async () => {
    const { svc, prisma } = zoneService([])
    prisma.project_zone.findUnique.mockResolvedValue(null)
    await expect(svc.buildZonePlan(999)).rejects.toMatchObject({ response: { code: 'ZONE_NOT_FOUND' } })
  })

  it('409 JOB_SHEET_EMPTY when the zone has no confirmed / in-progress MO, or every MO is empty', async () => {
    await expect(zoneService([]).svc.buildZonePlan(5)).rejects.toMatchObject({ response: { code: 'JOB_SHEET_EMPTY' } })
    const { svc, spy } = zoneService([{ id: 1, mo_code: 'MO-1' }])
    spy.mockRejectedValueOnce(new ConflictException({ code: 'JOB_SHEET_EMPTY' }))
    await expect(svc.buildZonePlan(5)).rejects.toMatchObject({ response: { code: 'JOB_SHEET_EMPTY' } })
  })

  it('409 JOB_SHEET_TOO_MANY_MOS above the MO cap, before any plan is built', async () => {
    const mos = Array.from({ length: MAX_ZONE_MOS + 1 }, (_, i) => ({ id: i + 1, mo_code: `MO-${i + 1}` }))
    const { svc, spy } = zoneService(mos)
    await expect(svc.buildZonePlan(5)).rejects.toMatchObject({ response: { code: 'JOB_SHEET_TOO_MANY_MOS' } })
    expect(spy).not.toHaveBeenCalled()
  })

  it('409 JOB_SHEET_TOO_MANY when the MOs together pass the sheet cap', async () => {
    const { svc, spy } = zoneService([{ id: 1, mo_code: 'MO-1' }, { id: 2, mo_code: 'MO-2' }])
    spy.mockResolvedValueOnce(planOf(1, 'MO-1', MAX_JOB_SHEETS - 1) as never).mockResolvedValueOnce(planOf(2, 'MO-2', 2) as never)
    await expect(svc.buildZonePlan(5)).rejects.toMatchObject({ response: { code: 'JOB_SHEET_TOO_MANY' } })
  })

  it('withTotals counts the same part mark under two MOs as two part marks', () => {
    const p = { mo: null, mode: 'piece' as const, sheets: [...sheetOf(1, 'MO-1', 1), ...sheetOf(2, 'MO-2', 1)], generatedAt: new Date() }
    expect(withTotals(p as never).totals).toMatchObject({ sheets: 2, partMarks: 2, pieces: 2, weight_kg: 2 })
  })

  it('a PART MO outside the requested zone prints nothing (single-MO batch with zone_id)', async () => {
    const { svc, prisma } = makeService([], [{ part_mark: 'P1', profile: 'PL9x150', grade: 'SS400', length_mm: 300, qty: 1, unit_weight_kg: 3.18, holes: [], mark: null }])
    prisma.manufacturing_order.findUnique.mockResolvedValue({ zone_id: 7, sub_zone_id: null })
    await expect(svc.buildPlan(1, { zoneId: 5 })).rejects.toMatchObject({ response: { code: 'JOB_SHEET_EMPTY' } })
  })

  it('due date falls back to the latest planned end of the assembly WOs when the MO has no plan_finish', async () => {
    const base = packet()
    const pk = packet({
      mo: { ...base.mo, plan_finish: null },
      rows: [
        { ...base.rows[0], planEnd: new Date('2026-12-20T00:00:00Z') },
        { ...base.rows[1], planEnd: new Date('2026-12-10T00:00:00Z') },
      ],
    })
    const { svc } = makeService([line('A12', 1, [{ part_mark: 'P101', qty: 1 }])], [], pk)
    const plan = await svc.buildPlan(1)
    expect(plan.sheets[0].dueDate).toEqual(new Date('2026-12-20T00:00:00Z'))
  })

  it('a PART MO prints its own project / zone / sub-zone (the packet has none without assembly lines)', async () => {
    const pk = packet({ mo: { ...packet().mo, projectCode: null, projectName: null, zoneLabel: null, subZoneName: null } })
    const { svc, prisma } = makeService([], [{ part_mark: 'P1', profile: 'PL9x150', grade: 'SS400', length_mm: 300, qty: 1, unit_weight_kg: 3.18, holes: [], mark: null }], pk)
    prisma.manufacturing_order.findUnique.mockResolvedValue({ zone_id: 5, sub_zone_id: 9, project: { project_code: 'P009', name: 'Part job' }, zone: { label: 'Z9' }, sub_zone: { name: 'S9-A' } })
    const plan = await svc.buildPlan(1)
    expect(plan.sheets[0]).toMatchObject({ source: 'MO_PART_LINE', projectCode: 'P009', projectName: 'Part job', zoneLabel: 'Z9', subZoneName: 'S9-A' })
  })
})
