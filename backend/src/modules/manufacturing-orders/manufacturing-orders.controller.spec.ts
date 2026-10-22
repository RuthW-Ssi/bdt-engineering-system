import { BadRequestException } from '@nestjs/common'
import { ManufacturingOrderController } from './manufacturing-orders.controller'

// Focused on GET ':id/drawing-rev-status' (2026-10-21, Task 3) — the rest
// of this controller is exercised indirectly via MoPrintService/
// ManufacturingOrderService's own specs; these pin just the controller's
// own wo_id parsing/validation, which has no service-level equivalent.
describe('ManufacturingOrderController.getDrawingRevStatus', () => {
  function make() {
    const moPrint = { drawingRevStatus: jest.fn().mockResolvedValue({ items: [] }) }
    const ctrl = new ManufacturingOrderController({} as any, moPrint as any, {} as any, {} as any)
    return { ctrl, moPrint }
  }

  it('delegates to MoPrintService.drawingRevStatus with woId undefined when wo_id is omitted', async () => {
    const { ctrl, moPrint } = make()

    const result = await ctrl.getDrawingRevStatus(85, undefined)

    expect(moPrint.drawingRevStatus).toHaveBeenCalledWith(85, undefined)
    expect(result).toEqual({ items: [] })
  })

  it('parses a valid wo_id and passes it through as a number', async () => {
    const { ctrl, moPrint } = make()

    await ctrl.getDrawingRevStatus(85, '1398')

    expect(moPrint.drawingRevStatus).toHaveBeenCalledWith(85, 1398)
  })

  // Decision: wo_id "must be a positive integer, 400 otherwise" — empty
  // string, non-numeric, fractional and zero all fail the same way; a
  // negative value is covered by the same `parsed <= 0` check as zero.
  it.each([
    ['empty string', ''],
    ['non-numeric', 'abc'],
    ['fractional', '3.5'],
    ['zero', '0'],
    ['negative', '-1'],
  ])('throws BadRequestException for an invalid wo_id (%s: %p)', async (_label, raw) => {
    const { ctrl, moPrint } = make()

    expect(() => ctrl.getDrawingRevStatus(85, raw)).toThrow(BadRequestException)
    expect(moPrint.drawingRevStatus).not.toHaveBeenCalled()
  })
})
