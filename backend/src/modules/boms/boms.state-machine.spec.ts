import { UnprocessableEntityException } from '@nestjs/common'
import { assertBomTransition } from './boms.state-machine'

describe('BOM State Machine', () => {
  it('draft → active via action_activate', () => {
    expect(assertBomTransition('draft', 'action_activate')).toBe('active')
  })

  it('draft → obsolete via action_obsolete', () => {
    expect(assertBomTransition('draft', 'action_obsolete')).toBe('obsolete')
  })

  it('active → obsolete via action_obsolete', () => {
    expect(assertBomTransition('active', 'action_obsolete')).toBe('obsolete')
  })

  it('active cannot re-activate', () => {
    expect(() => assertBomTransition('active', 'action_activate')).toThrow(UnprocessableEntityException)
  })

  it('obsolete is terminal — action_activate throws', () => {
    expect(() => assertBomTransition('obsolete', 'action_activate')).toThrow(UnprocessableEntityException)
  })

  it('obsolete is terminal — action_obsolete throws', () => {
    expect(() => assertBomTransition('obsolete', 'action_obsolete')).toThrow(UnprocessableEntityException)
  })

  it('unknown action throws', () => {
    expect(() => assertBomTransition('draft', 'action_unknown')).toThrow(UnprocessableEntityException)
  })
})
