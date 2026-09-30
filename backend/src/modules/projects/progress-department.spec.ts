import { ForbiddenException } from '@nestjs/common'
import { assertDepartmentCanEdit, editableGroups, PROGRESS_GROUPS } from './progress-department'
import { AUDITABLE_FIELDS } from './progress-change-log.service'

describe('PROGRESS_GROUPS', () => {
  it('assigns every auditable progress field to exactly one group', () => {
    const owned = PROGRESS_GROUPS.flatMap(g => g.fields)
    expect([...owned].sort()).toEqual([...AUDITABLE_FIELDS].sort())
  })
})

describe('editableGroups', () => {
  it.each([
    ['BDP', ['fabrication', 'fab_dates']],
    ['BCD', ['fab_dates', 'payment', 'transport_dates', 'erection_dates']],
    ['BSC', ['transport', 'transport_dates']],
    ['BTC', ['erection', 'erection_dates']],
    [' bdp ', ['fabrication', 'fab_dates']],
    ['admin', ['fabrication', 'fab_dates', 'payment', 'transport', 'transport_dates', 'erection', 'erection_dates']],
    ['Admin', []],
    ['admin ', []],
    ['BTE', []],
    ['engineer', []],
    ['', []],
  ])('%p → %p', (role, expected) => {
    expect(editableGroups(role)).toEqual(expected)
  })
})

describe('assertDepartmentCanEdit', () => {
  it('allows each owner its own work and its own dates', () => {
    expect(() => assertDepartmentCanEdit('BDP', ['cut', 'fab_actual_finish_date'])).not.toThrow()
    expect(() => assertDepartmentCanEdit('BSC', ['loaded_pcs', 'actual_load_date'])).not.toThrow()
    expect(() => assertDepartmentCanEdit('BTC', ['erected_pcs', 'erection_plan_finish_date'])).not.toThrow()
  })

  // 2026-09-30 — BCD also edits every Plan/Actual date, plus Material Payment.
  it('allows BCD every section\'s dates and Material Payment', () => {
    expect(() => assertDepartmentCanEdit('BCD', [
      'payment_status', 'fab_plan_finish_date', 'fab_actual_finish_date',
      'plan_load_date', 'actual_load_date', 'erection_plan_finish_date', 'erection_actual_finish_date',
    ])).not.toThrow()
  })

  it('does not let BCD edit the owners\' work (%, loaded, erected)', () => {
    expect(() => assertDepartmentCanEdit('BCD', ['cut'])).toThrow(/Fabrication \(/)
    expect(() => assertDepartmentCanEdit('BCD', ['loaded_pcs'])).toThrow(/Transport \(/)
    expect(() => assertDepartmentCanEdit('BCD', ['erected_pcs'])).toThrow(/Erection \(/)
  })

  it('does not let an owner edit another section\'s dates', () => {
    expect(() => assertDepartmentCanEdit('BDP', ['erection_actual_finish_date'])).toThrow(/Erection dates \(เฉพาะแผนก BTC \/ BCD\)/)
    expect(() => assertDepartmentCanEdit('BSC', ['fab_plan_finish_date'])).toThrow(ForbiddenException)
  })

  it('allows admin to change everything', () => {
    expect(() => assertDepartmentCanEdit('admin', [...AUDITABLE_FIELDS])).not.toThrow()
  })

  it('allows a no-op (nothing changed) for anyone', () => {
    expect(() => assertDepartmentCanEdit('BTE', [])).not.toThrow()
  })

  it('rejects a change outside the department\'s groups, naming the group', () => {
    expect(() => assertDepartmentCanEdit('BDP', ['cut', 'erected_pcs'])).toThrow(ForbiddenException)
    expect(() => assertDepartmentCanEdit('BDP', ['cut', 'erected_pcs'])).toThrow(/Erection/)
  })

  it('Payment and Transport are separate owners (BSC cannot set payment)', () => {
    expect(() => assertDepartmentCanEdit('BSC', ['payment_status'])).toThrow(/Material Payment/)
  })

  it('rejects any change from a department that owns no group', () => {
    expect(() => assertDepartmentCanEdit('BTE', ['cut'])).toThrow(ForbiddenException)
  })
})
