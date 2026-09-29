import { ForbiddenException } from '@nestjs/common'
import { assertDepartmentCanEdit, editableSections, PROGRESS_SECTIONS } from './progress-department'
import { AUDITABLE_FIELDS } from './progress-change-log.service'

describe('PROGRESS_SECTIONS', () => {
  it('assigns every auditable progress field to exactly one section', () => {
    const owned = PROGRESS_SECTIONS.flatMap(s => s.fields)
    expect([...owned].sort()).toEqual([...AUDITABLE_FIELDS].sort())
  })
})

describe('editableSections', () => {
  it.each([
    ['BDP', ['fabrication']],
    ['BCD', ['payment']],
    ['BSC', ['transport']],
    ['BTC', ['erection']],
    [' bdp ', ['fabrication']],
    ['admin', ['fabrication', 'payment', 'transport', 'erection']],
    ['Admin', []],
    ['admin ', []],
    ['BTE', []],
    ['engineer', []],
    ['', []],
  ])('%p → %p', (role, expected) => {
    expect(editableSections(role)).toEqual(expected)
  })
})

describe('assertDepartmentCanEdit', () => {
  it('allows a department to change its own section', () => {
    expect(() => assertDepartmentCanEdit('BDP', ['cut', 'fab_actual_finish_date'])).not.toThrow()
    expect(() => assertDepartmentCanEdit('BCD', ['payment_status'])).not.toThrow()
    expect(() => assertDepartmentCanEdit('BSC', ['loaded_pcs', 'actual_load_date'])).not.toThrow()
    expect(() => assertDepartmentCanEdit('BTC', ['erected_pcs', 'erection_plan_finish_date'])).not.toThrow()
  })

  it('allows admin to change everything', () => {
    expect(() => assertDepartmentCanEdit('admin', [...AUDITABLE_FIELDS])).not.toThrow()
  })

  it('allows a no-op (nothing changed) for anyone', () => {
    expect(() => assertDepartmentCanEdit('BTE', [])).not.toThrow()
  })

  it('rejects a change outside the department\'s section, naming the section', () => {
    expect(() => assertDepartmentCanEdit('BDP', ['cut', 'erected_pcs'])).toThrow(ForbiddenException)
    expect(() => assertDepartmentCanEdit('BDP', ['cut', 'erected_pcs'])).toThrow(/Erection/)
  })

  it('Payment and Transport are separate owners (BSC cannot set payment, BCD cannot set loads)', () => {
    expect(() => assertDepartmentCanEdit('BSC', ['payment_status'])).toThrow(/Material Payment/)
    expect(() => assertDepartmentCanEdit('BCD', ['loaded_pcs'])).toThrow(/Transport/)
  })

  it('rejects any change from a department that owns no section', () => {
    expect(() => assertDepartmentCanEdit('BTE', ['cut'])).toThrow(ForbiddenException)
  })
})
