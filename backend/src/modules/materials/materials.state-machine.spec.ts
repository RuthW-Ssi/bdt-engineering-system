import { assertTransition, STATE_ACTIONS } from './materials.state-machine'

describe('MaterialsStateMachine', () => {
  it('allows draft → to_approve', () => {
    expect(() => assertTransition('draft', 'to_approve')).not.toThrow()
  })

  it('blocks draft → confirmed directly', () => {
    expect(() => assertTransition('draft', 'confirmed')).toThrow()
  })

  it('allows to_approve → confirmed', () => {
    expect(() => assertTransition('to_approve', 'confirmed')).not.toThrow()
  })

  it('allows to_approve → draft (reset)', () => {
    expect(() => assertTransition('to_approve', 'draft')).not.toThrow()
  })

  it('blocks confirmed → draft directly', () => {
    expect(() => assertTransition('confirmed', 'draft')).toThrow()
  })

  it('STATE_ACTIONS maps action_submit → to_approve', () => {
    expect(STATE_ACTIONS['action_submit']).toBe('to_approve')
  })

  it('STATE_ACTIONS maps action_confirm → confirmed', () => {
    expect(STATE_ACTIONS['action_confirm']).toBe('confirmed')
  })
})
