import { describe, it, expect } from 'vitest'
import { editableGroups, lockedNotes } from './progressDepartments'

describe('editableGroups', () => {
  it.each([
    ['BDP', ['fabrication', 'fab_dates']],
    ['bsc', ['transport', 'transport_dates']],
    [' BCD ', ['fab_dates', 'payment', 'transport_dates', 'erection_dates']],
    ['BTC', ['erection', 'erection_dates']],
    ['admin', ['fabrication', 'fab_dates', 'payment', 'transport', 'transport_dates', 'erection', 'erection_dates']],
    ['Admin', []],
    ['BTE', []],
    [undefined, []],
  ])('%p → %p', (role, expected) => {
    expect([...editableGroups(role)]).toEqual(expected)
  })
})

describe('lockedNotes', () => {
  it('BCD on Fabrication: % locked to BDP, dates open', () => {
    expect(lockedNotes(editableGroups('BCD'), 'fabrication', 'fab_dates')).toEqual(['Editable by BDP only'])
  })
  it('BTE on Erection: both the work and the dates are locked', () => {
    expect(lockedNotes(editableGroups('BTE'), 'erection', 'erection_dates'))
      .toEqual(['Editable by BTC only', 'Dates: editable by BTC / BCD only'])
  })
  it('owner sees no note on its own section', () => {
    expect(lockedNotes(editableGroups('BSC'), 'transport', 'transport_dates')).toEqual([])
  })
})
