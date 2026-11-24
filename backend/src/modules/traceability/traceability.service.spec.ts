import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { TraceabilityService } from './traceability.service'

// The Prisma client is mocked by hand, the same way as cutting-plan.service.spec.ts.
// Not yet run under Jest - run `pnpm jest src/modules/traceability` before merge.
function buildPrisma() {
  const tx = {
    heat_lot: { upsert: jest.fn() },
    plate_cut_record: { updateMany: jest.fn(), create: jest.fn() },
    part_trace: { createMany: jest.fn() },
  }
  const prisma = {
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    heat_lot: { findMany: jest.fn(), upsert: jest.fn() },
    cutting_plan_upload: { findUnique: jest.fn() },
    cutting_plan_nesting: { findUnique: jest.fn(), findMany: jest.fn() },
    cutting_plan_order_part: { findMany: jest.fn() },
    plate_cut_record: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findMany: jest.fn() },
    part_trace: { findMany: jest.fn() },
    project: { findUnique: jest.fn(), findMany: jest.fn() },
    bom_part: { findMany: jest.fn() },
  }
  return { prisma, tx }
}

const NESTING = {
  id: 10, upload_id: 1, cuttingplan_number: 'P901-Z0-5-1', nc_file: '00000901.cld', quality: 'SS400', thick_mm: 12,
  upload: { id: 1, plan_type: 'PLATE' },
  order_parts: [
    { id: 100, project_code: '0P901', drawing_part_no_version_no: 'A-p11 ', nested: 4, weight_kg: 12.5 },
    { id: 101, project_code: '0P901', drawing_part_no_version_no: 'A-f12', nested: 2, weight_kg: 3 },
  ],
}

describe('TraceabilityService', () => {
  let prisma: ReturnType<typeof buildPrisma>['prisma']
  let tx: ReturnType<typeof buildPrisma>['tx']
  let svc: TraceabilityService

  beforeEach(() => {
    ({ prisma, tx } = buildPrisma())
    svc = new TraceabilityService(prisma as never)
  })

  describe('assignHeatToSheet', () => {
    beforeEach(() => {
      prisma.cutting_plan_nesting.findUnique.mockResolvedValue(NESTING)
      prisma.project.findMany.mockResolvedValue([{ id: 5, project_code: '0P901' }])
      prisma.bom_part.findMany.mockResolvedValue([
        { id: 900, part_mark: 'A-p11', slot: 'MAIN', dispatch: { project_id: 5 } },
        { id: 901, part_mark: 'A-f12', slot: 'ACC', dispatch: { project_id: 5 } },
      ])
      tx.heat_lot.upsert.mockResolvedValue({ id: 7, heat_no: 'H12345', mill: '', cert_no: null, grade: 'SS400', thick_mm: 12 })
      tx.plate_cut_record.updateMany.mockResolvedValue({ count: 0 })
      tx.plate_cut_record.create.mockResolvedValue({ id: 55 })
      tx.part_trace.createMany.mockResolvedValue({ count: 2 })
    })

    it('writes one plate cut record and passes the heat on to every part of the sheet', async () => {
      const out = await svc.assignHeatToSheet(10, { heat_no: ' h 12345 ' }, 1)
      expect(tx.heat_lot.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { heat_no_mill: { heat_no: 'H12345', mill: '' } } }))
      expect(tx.plate_cut_record.create).toHaveBeenCalledTimes(1)
      const traces = tx.part_trace.createMany.mock.calls[0][0].data
      expect(traces).toHaveLength(2)
      expect(traces[0]).toEqual(expect.objectContaining({ plate_cut_id: 55, heat_lot_id: 7, order_part_id: 100, part_mark: 'A-p11', is_main_part: true, bom_part_id: 900 }))
      expect(traces[1]).toEqual(expect.objectContaining({ order_part_id: 101, is_main_part: false }))
      expect(out).toEqual(expect.objectContaining({ plate_cut_id: 55, parts_traced: 2, replaced: 0, warnings: [] }))
    })

    it('voids the current record of the same plate before writing the new one', async () => {
      tx.plate_cut_record.updateMany.mockResolvedValue({ count: 1 })
      const out = await svc.assignHeatToSheet(10, { heat_no: 'H999', reason: 'wrong heat typed' }, 1)
      expect(tx.plate_cut_record.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { nesting_id: 10, plate_seq: 1, status: 'ACTIVE' },
        data: expect.objectContaining({ status: 'VOID', void_reason: 'wrong heat typed' }),
      }))
      expect(out.replaced).toBe(1)
    })

    it('warns, but does not block, when the heat lot grade differs from the sheet', async () => {
      tx.heat_lot.upsert.mockResolvedValue({ id: 7, heat_no: 'H12345', mill: '', cert_no: null, grade: 'SM490', thick_mm: 12 })
      const out = await svc.assignHeatToSheet(10, { heat_no: 'H12345' }, 1)
      expect(out.warnings).toEqual([expect.stringContaining('Grade differs')])
    })

    it('rejects an empty heat number and an unknown sheet', async () => {
      await expect(svc.assignHeatToSheet(10, { heat_no: '   ' }, 1)).rejects.toBeInstanceOf(BadRequestException)
      prisma.cutting_plan_nesting.findUnique.mockResolvedValue(null)
      await expect(svc.assignHeatToSheet(99, { heat_no: 'H1' }, 1)).rejects.toBeInstanceOf(NotFoundException)
    })

    it('rejects a shape (1D) cutting plan', async () => {
      prisma.cutting_plan_nesting.findUnique.mockResolvedValue({ ...NESTING, upload: { id: 1, plan_type: 'SHAPE' } })
      await expect(svc.assignHeatToSheet(10, { heat_no: 'H1' }, 1)).rejects.toBeInstanceOf(BadRequestException)
    })

    it('turns a unique-index clash (two users, same plate) into 409 Conflict', async () => {
      prisma.$transaction.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '6' }))
      await expect(svc.assignHeatToSheet(10, { heat_no: 'H12345' }, 1)).rejects.toBeInstanceOf(ConflictException)
    })

    it('passes any other database error through unchanged', async () => {
      const boom = new Error('connection lost')
      prisma.$transaction.mockRejectedValueOnce(boom)
      await expect(svc.assignHeatToSheet(10, { heat_no: 'H12345' }, 1)).rejects.toBe(boom)
    })
  })

  describe('sheetsOfUpload', () => {
    it('offers the heat of the newest older upload of the same NC file, without copying it', async () => {
      prisma.cutting_plan_upload.findUnique.mockResolvedValue({ id: 3 })
      prisma.cutting_plan_nesting.findMany.mockResolvedValue([
        { id: 30, cuttingplan_number: 'X-1', nc_file: '00000901.cld', count: 1, quality: 'SS400', thick_mm: 12, _count: { order_parts: 2 }, plate_cuts: [] },
        { id: 31, cuttingplan_number: 'X-2', nc_file: null, count: 1, quality: 'SS400', thick_mm: 12, _count: { order_parts: 1 }, plate_cuts: [] },
      ])
      const lot = (heat_no: string) => ({ id: 7, heat_no, mill: '', cert_no: null })
      prisma.plate_cut_record.findMany.mockResolvedValue([
        { id: 61, upload_id: 2, cuttingplan_number: 'X-1', nc_file: '00000901.cld', plate_seq: 1, plate_no: 'P-9', heat_lot: lot('H2') },
        { id: 51, upload_id: 1, cuttingplan_number: 'X-1', nc_file: '00000901.cld', plate_seq: 1, plate_no: null, heat_lot: lot('H1') },
      ])
      const out = await svc.sheetsOfUpload(3)
      expect(prisma.plate_cut_record.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { status: 'ACTIVE', nc_file: { in: ['00000901.cld'] }, upload_id: { lt: 3 } },
      }))
      expect(out[0].traced).toBe(false)
      expect(out[0].previous_cuts).toEqual([expect.objectContaining({ plate_cut_id: 61, upload_id: 2, plate_no: 'P-9' })])
      expect(out[1].previous_cuts).toEqual([])
      expect(out[0].parent_cuts).toEqual([]) // no Charge → no remnant hint, no second query
      expect(prisma.plate_cut_record.findMany).toHaveBeenCalledTimes(1)
    })

    it('offers the heat of the plate the report names as Charge (sheet cut from its remnant)', async () => {
      prisma.cutting_plan_upload.findUnique.mockResolvedValue({ id: 3 })
      prisma.cutting_plan_nesting.findMany.mockResolvedValue([
        { id: 32, cuttingplan_number: '901-Z0-10-3-1REVISE2', charge: '901-Z0-10-3', nc_file: null, count: 1, quality: 'SS400', thick_mm: 10, _count: { order_parts: 1 }, plate_cuts: [] },
      ])
      prisma.plate_cut_record.findMany.mockResolvedValueOnce([
        { id: 71, upload_id: 2, cuttingplan_number: '901-Z0-10-3', nc_file: null, plate_seq: 1, plate_no: null, heat_lot: { id: 8, heat_no: 'H777', mill: '', cert_no: null } },
      ])
      const out = await svc.sheetsOfUpload(3)
      expect(prisma.plate_cut_record.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { status: 'ACTIVE', cuttingplan_number: { in: ['901-Z0-10-3'] } },
      }))
      expect(out[0].parent_plate).toBe('901-Z0-10-3')
      expect(out[0].parent_cuts).toEqual([expect.objectContaining({ plate_cut_id: 71, heat_lot: expect.objectContaining({ heat_no: 'H777' }) })])
    })
  })

  describe('projectCompleteness', () => {
    it('counts only the newest version of a sheet and classes parts by BOM slot', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 5, project_code: '0P901', name: 'demo' })
      prisma.project.findMany.mockResolvedValue([{ id: 5, project_code: '0P901' }])
      const sheet = (id: number, upload_id: number) => ({ id, upload_id, nc_file: '00000901.cld', cuttingplan_number: 'X-1', plate_number: null, quality: 'SS400', thick_mm: 12 })
      prisma.cutting_plan_order_part.findMany.mockResolvedValue([
        { id: 100, upload_id: 1, nesting_id: 10, cuttingplan_number: 'X-1', project_code: '0P901', drawing_part_no_version_no: 'A-p1', nested: 1, weight_kg: 5, nesting: sheet(10, 1) },
        { id: 200, upload_id: 2, nesting_id: 20, cuttingplan_number: 'X-1', project_code: '0P901', drawing_part_no_version_no: 'A-p1', nested: 1, weight_kg: 5, nesting: sheet(20, 2) },
        { id: 201, upload_id: 2, nesting_id: 20, cuttingplan_number: 'X-1', project_code: '0P901', drawing_part_no_version_no: 'A-p2', nested: 3, weight_kg: 9, nesting: sheet(20, 2) },
      ])
      prisma.cutting_plan_nesting.findMany.mockResolvedValue([sheet(10, 1), sheet(20, 2)])
      prisma.bom_part.findMany.mockResolvedValue([{ id: 900, part_mark: 'A-p1', slot: 'MAIN', dispatch: { project_id: 5 } }])
      prisma.part_trace.findMany.mockResolvedValue([
        { order_part_id: 200, heat_lot: { id: 7, heat_no: 'H12345', mill: '', cert_no: null }, plate_cut: { id: 55, plate_no: null, plate_seq: 1, cut_date: null } },
      ])
      const { completeness } = await svc.projectCompleteness(5, 'main_or_unknown')
      expect(completeness.parts_total).toBe(2) // the part of the superseded sheet (id 100) is not counted
      expect(completeness.parts_traced).toBe(1)
      expect(completeness.pct_parts).toBe(50)
      expect(completeness.main_unknown).toBe(1)
    })

    it('answers 404 for an unknown project', async () => {
      prisma.project.findUnique.mockResolvedValue(null)
      await expect(svc.projectCompleteness(1)).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  describe('sheetHistory', () => {
    it('404 when the sheet does not exist', async () => {
      prisma.cutting_plan_nesting.findUnique.mockResolvedValue(null)
      await expect(svc.sheetHistory(999)).rejects.toBeInstanceOf(NotFoundException)
    })

    it('lists ACTIVE and VOID records; who / when voided only for VOID rows', async () => {
      prisma.cutting_plan_nesting.findUnique.mockResolvedValue({ id: 10, cuttingplan_number: 'X-1' })
      const rec = (id: number, status: string, reason: string | null) => ({
        id, plate_seq: 1, plate_no: null, status, void_reason: reason, cut_date: null, machine: null, note: null,
        create_date: new Date('2026-11-23T01:00:00Z'), write_date: new Date('2026-11-23T02:00:00Z'),
        heat_lot: { id: 7, heat_no: id === 56 ? 'H2' : 'H1', mill: '', cert_no: null },
        create_user: { id: 1, name: 'Planner' }, write_user: { id: 2, name: 'QA' }, _count: { part_traces: 2 },
      })
      prisma.plate_cut_record.findMany.mockResolvedValue([rec(56, 'ACTIVE', null), rec(55, 'VOID', 'typo')])
      const res = await svc.sheetHistory(10)
      expect(prisma.plate_cut_record.findMany.mock.calls[0][0].where).toEqual({ nesting_id: 10 })
      expect(res.records.length).toBe(2)
      expect(res.records[0].voided_by).toBe(null)
      expect(res.records[0].assigned_by).toBe('Planner')
      expect(res.records[1].voided_by).toBe('QA')
      expect(res.records[1].void_reason).toBe('typo')
      expect(res.records[1].parts_traced).toBe(2)
    })
  })

  describe('forwardCsv', () => {
    it('one line per part of the heat, BOM + header first, main flag as Y / ?', async () => {
      prisma.heat_lot.findMany.mockResolvedValue([{
        id: 1, heat_no: 'H12345', mill: 'MILL A', grade: 'SS400', thick_mm: 12, cert_no: 'C-1', supplier: null,
        plate_cuts: [{
          id: 55, nesting_id: 10, upload_id: 1, cuttingplan_number: 'X-1', nc_file: 'a.cld', plate_no: 'P-9', plate_seq: 1, cut_date: null,
          part_traces: [
            { part_mark: 'A-p1', project_code: '0P901', qty: 2, weight_kg: 1.5, is_main_part: true },
            { part_mark: 'A-p2', project_code: '0P901', qty: 1, weight_kg: null, is_main_part: null },
          ],
        }],
      }])
      const { fileName, csv } = await svc.forwardCsv('h 12345')
      const lines = csv.replace(/^﻿/, '').split('\r\n')
      expect(csv.charCodeAt(0)).toBe(0xfeff)
      expect(fileName.startsWith('heat-H12345-')).toBe(true)
      expect(lines[0]).toBe('heat_no,mill,cert_no,sheet,nc_file,plate_no,plate_seq,cut_date,project_code,part_mark,main_part,qty,weight_kg')
      expect(lines[1]).toBe('H12345,MILL A,C-1,X-1,a.cld,P-9,1,,0P901,A-p1,Y,2,1.5')
      expect(lines[2]).toBe('H12345,MILL A,C-1,X-1,a.cld,P-9,1,,0P901,A-p2,?,1,')
    })
  })

  describe('queries', () => {
    it('forward: one heat number held by two mills comes back as two lots, parts counted per lot', async () => {
      const cut = (id: number, marks: string[]) => ({
        id, nesting_id: 10, upload_id: 1, cuttingplan_number: 'X-1', nc_file: null, plate_no: null, plate_seq: 1, cut_date: new Date('2026-11-23T00:00:00Z'),
        part_traces: marks.map(m => ({ part_mark: m, project_code: '0P901', qty: 1, weight_kg: 1, is_main_part: true })),
      })
      const lot = (id: number, mill: string, cuts: ReturnType<typeof cut>[]) => ({ id, heat_no: 'H12345', mill, grade: 'SS400', thick_mm: 12, cert_no: null, supplier: null, plate_cuts: cuts })
      prisma.heat_lot.findMany.mockResolvedValue([lot(1, 'MILL A', [cut(55, ['A-p1', 'A-p2'])]), lot(2, 'MILL B', [])])
      const out = await svc.forward(' h12345 ')
      expect(prisma.heat_lot.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { heat_no: 'H12345' } }))
      expect(out.lots).toHaveLength(2)
      expect(out.lots[0].parts_total).toBe(2)
      expect(out.lots[0].plates[0].cut_date).toBe('2026-11-23')
    })

    it('backward: asks for ACTIVE records only, by mark without regard to case', async () => {
      prisma.part_trace.findMany.mockResolvedValue([])
      const out = await svc.backward(' A-p11 ', '0P901')
      expect(prisma.part_trace.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { part_mark: { equals: 'A-p11', mode: 'insensitive' }, project_code: '0P901', plate_cut: { status: 'ACTIVE' } },
      }))
      expect(out.traces).toEqual([])
    })

    it('voidPlateCut: refuses a record that is already void', async () => {
      prisma.plate_cut_record.findUnique.mockResolvedValue({ id: 55, status: 'VOID' })
      await expect(svc.voidPlateCut(55, 'typo', 1)).rejects.toBeInstanceOf(BadRequestException)
      prisma.plate_cut_record.findUnique.mockResolvedValue({ id: 55, status: 'ACTIVE' })
      prisma.plate_cut_record.updateMany.mockResolvedValue({ count: 1 })
      expect(await svc.voidPlateCut(55, ' typo ', 1)).toEqual({ voided: true })
      expect(prisma.plate_cut_record.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 55, status: 'ACTIVE' }, data: expect.objectContaining({ status: 'VOID', void_reason: 'typo' }) }))
      // lost race: someone voided it between the read and the write
      prisma.plate_cut_record.updateMany.mockResolvedValue({ count: 0 })
      await expect(svc.voidPlateCut(55, 'typo', 1)).rejects.toBeInstanceOf(BadRequestException)
    })

    it('projectCsv: file name carries the project code and the date; untraced filter keeps only open parts', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 5, project_code: '0P901', name: 'demo' })
      prisma.project.findMany.mockResolvedValue([{ id: 5, project_code: '0P901' }])
      const sheet = { id: 10, upload_id: 1, nc_file: null, cuttingplan_number: 'X-1', plate_number: null, quality: 'SS400', thick_mm: 12 }
      prisma.cutting_plan_order_part.findMany.mockResolvedValue([
        { id: 100, upload_id: 1, nesting_id: 10, cuttingplan_number: 'X-1', project_code: '0P901', drawing_part_no_version_no: 'A-p1', nested: 1, weight_kg: 5, nesting: sheet },
        { id: 101, upload_id: 1, nesting_id: 10, cuttingplan_number: 'X-1', project_code: '0P901', drawing_part_no_version_no: 'A-p2', nested: 2, weight_kg: 6, nesting: sheet },
      ])
      prisma.bom_part.findMany.mockResolvedValue([])
      prisma.part_trace.findMany.mockResolvedValue([
        { order_part_id: 100, heat_lot: { id: 7, heat_no: 'H12345', mill: '', cert_no: null }, plate_cut: { id: 55, plate_no: null, plate_seq: 1, cut_date: null } },
      ])
      const out = await svc.projectCsv(5, { untraced: 'true' })
      expect(out.fileName).toMatch(/^traceability-0P901-\d{4}-\d{2}-\d{2}\.csv$/)
      const lines = out.csv.replace(/^﻿/, '').trim().split('\r\n')
      expect(lines).toHaveLength(2) // header + the one untraced part
      expect(lines[1].startsWith('0P901,A-p2,')).toBe(true)
    })

    it('assignHeatToSheets: one failing sheet does not undo the others', async () => {
      prisma.cutting_plan_nesting.findUnique.mockImplementation(async ({ where }: { where: { id: number } }) => (where.id === 10 ? NESTING : null))
      prisma.project.findMany.mockResolvedValue([])
      tx.heat_lot.upsert.mockResolvedValue({ id: 7, heat_no: 'H12345', mill: '', cert_no: null, grade: 'SS400', thick_mm: 12 })
      tx.plate_cut_record.updateMany.mockResolvedValue({ count: 0 })
      tx.plate_cut_record.create.mockResolvedValue({ id: 55 })
      tx.part_trace.createMany.mockResolvedValue({ count: 2 })
      const out = await svc.assignHeatToSheets({ heat_no: 'H12345', nesting_ids: [10, 99, 10] }, 1)
      expect(out.assigned).toBe(1) // the repeated id 10 is saved once
      expect(out.parts_traced).toBe(2)
      expect(out.failed).toEqual([{ nesting_id: 99, message: expect.stringContaining('99') }])
    })
  })
})
