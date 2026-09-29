import { describe, it, expect } from 'vitest'
import { editableSections, lockedNote } from './progressDepartments'

describe('editableSections', () => {
  it.each([
    ['BDP', ['fabrication']],
    ['bsc', ['transport']],
    [' BCD ', ['payment']],
    ['BTC', ['erection']],
    ['admin', ['fabrication', 'payment', 'transport', 'erection']],
    ['Admin', []],
    ['BTE', []],
    [undefined, []],
  ])('%p → %p', (role, expected) => {
    expect([...editableSections(role)]).toEqual(expected)
  })
})

describe('lockedNote', () => {
  it('names the owning department', () => {
    expect(lockedNote('erection')).toContain('BTC')
  })
})
