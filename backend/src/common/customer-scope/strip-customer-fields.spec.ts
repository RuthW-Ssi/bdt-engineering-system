import { stripCustomerFields, isHiddenCustomerKey } from './strip-customer-fields'

describe('stripCustomerFields', () => {
  it.each([
    'weight_kg', 'total_weight_kg', 'NetWeight', 'fab_plan_finish_date', 'plan_load_date', 'start_date',
    'target_handover', 'target_start', 'target_end', 'due_date', 'create_date', 'write_date', 'date',
    'deleted_at', 'createdAt', 'changedAt', 'fab_plan_breakdown', 'schedule_progress', 'window_start',
    'elapsed_days', 'total_days',
  ])('hides %s', (k) => expect(isHiddenCustomerKey(k)).toBe(true))

  it.each(['update', 'can_update', 'id', 'name', 'project_code', 'pct', 'status', 'qty', 'mark', 'state', 'format'])(
    'keeps %s',
    (k) => expect(isHiddenCustomerKey(k)).toBe(false),
  )

  it('strips recursively through arrays and nested objects', () => {
    const input = {
      zones: [{ id: 1, pct: 50, total_weight_kg: 900, rows: [{ mark: 'A1', weight_kg: 10, fab_plan_finish_date: 'x' }] }],
      Quantities: { Length: '60 mm', NetWeight: '0.2' },
    }
    expect(stripCustomerFields(input)).toEqual({
      zones: [{ id: 1, pct: 50, rows: [{ mark: 'A1' }] }],
      Quantities: { Length: '60 mm' },
    })
  })

  it('passes primitives and null through', () => {
    expect(stripCustomerFields(null)).toBeNull()
    expect(stripCustomerFields(5)).toBe(5)
  })
})
