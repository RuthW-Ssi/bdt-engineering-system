import { JobSheetController } from './job-sheet.controller'

// Job sheet controller spec (not yet run under Jest - run
// `pnpm jest job-sheet.controller` before merge). Same style as manufacturing-orders.controller.spec.ts:
// the controller is constructed directly with a mocked service.
function make() {
  const svc = {
    preview: jest.fn().mockResolvedValue({ sheets: [] }),
    buildPdf: jest.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70])),
    previewZone: jest.fn().mockResolvedValue({ sheets: [] }),
    buildZonePdf: jest.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70])),
  }
  return { svc, ctrl: new JobSheetController(svc as never) }
}

describe('JobSheetController', () => {
  it('preview: parses the query into a scope', async () => {
    const { svc, ctrl } = make()
    await ctrl.preview(7, '11, 12', '5', undefined, 'A12,B07', ' P101 ', 'part')
    expect(svc.preview.mock.calls[0]).toEqual([7, { woIds: [11, 12], zoneId: 5, subZoneId: undefined, assemblyMarks: ['A12', 'B07'], partMarks: ['P101'], mode: 'part' }])
  })

  it('preview: omitted params mean "no filter", per-piece mode', async () => {
    const { svc, ctrl } = make()
    await ctrl.preview(7, undefined, undefined, undefined, undefined, undefined, undefined)
    expect(svc.preview.mock.calls[0]).toEqual([7, { woIds: undefined, zoneId: undefined, subZoneId: undefined, assemblyMarks: undefined, partMarks: undefined, mode: 'piece' }])
  })

  it('a repeated single-value key (array) is treated as not given instead of crashing', async () => {
    const { svc, ctrl } = make()
    await ctrl.preview(7, undefined, ['5', '6'], undefined, undefined, undefined, ['part', 'piece'])
    expect(svc.preview.mock.calls[0][1]).toMatchObject({ zoneId: undefined, mode: 'piece' })
  })

  it('a repeated list key (?wo_ids=1&wo_ids=2, marks) is joined, never dropped (dropping would widen the batch)', async () => {
    const { svc, ctrl } = make()
    await ctrl.preview(7, ['1', '2'], undefined, undefined, ['A1', 'A2'], ['P1'], undefined)
    expect(svc.preview.mock.calls[0][1]).toMatchObject({ woIds: [1, 2], assemblyMarks: ['A1', 'A2'], partMarks: ['P1'], mode: 'piece' })
  })

  it('pdf: sends application/pdf bytes and defaults the language to en', async () => {
    const { svc, ctrl } = make()
    const res = { set: jest.fn(), send: jest.fn() }
    await ctrl.pdf(7, undefined, undefined, undefined, undefined, undefined, undefined, 'xx', res as never)
    expect(svc.buildPdf.mock.calls[0][2]).toBe('en')
    expect(res.set.mock.calls[0][0]).toEqual({ 'Content-Type': 'application/pdf' })
    expect(Buffer.isBuffer(res.send.mock.calls[0][0])).toBe(true)
  })

  it('zone preview: parses sub-zone / marks / mode (no wo_ids, no zone_id in the scope)', async () => {
    const { svc, ctrl } = make()
    await ctrl.previewZone(5, '9', 'A12', undefined, 'part')
    expect(svc.previewZone.mock.calls[0]).toEqual([5, { subZoneId: 9, assemblyMarks: ['A12'], partMarks: undefined, mode: 'part' }])
  })

  it('zone pdf: sends application/pdf bytes in the requested language', async () => {
    const { svc, ctrl } = make()
    const res = { set: jest.fn(), send: jest.fn() }
    await ctrl.zonePdf(5, undefined, undefined, undefined, undefined, 'th', res as never)
    expect(svc.buildZonePdf.mock.calls[0]).toEqual([5, { subZoneId: undefined, assemblyMarks: undefined, partMarks: undefined, mode: 'piece' }, 'th'])
    expect(res.set.mock.calls[0][0]).toEqual({ 'Content-Type': 'application/pdf' })
  })

  it.todo('e2e: 401 without a token, 403 without orders:view, 404 unknown MO, 409 codes pass through')
})
