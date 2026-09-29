import { describe, it, expect } from 'vitest'
import { editableSections, lockedNote } from './progressDepartments'

describe('editableSections', () => {
  it.each([
    ['BDP', ['fabrication']],
    ['bsc', ['payment_transport']],
    [' BCD ', ['erection']],
    ['admin', ['fabrication', 'payment_transport', 'erection']],
    ['Admin', []],
    ['BTE', []],
    [undefined, []],
  ])('%p → %p', (role, expected) => {
    expect([...editableSections(role)]).toEqual(expected)
  })
})

describe('lockedNote', () => {
  it('names the owning department', () => {
    expect(lockedNote('erection')).toContain('BCD')
  })
})
