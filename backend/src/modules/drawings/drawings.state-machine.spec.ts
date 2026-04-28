import { UnprocessableEntityException } from '@nestjs/common'
import { assertDrawingTransition } from './drawings.state-machine'

describe('Drawing State Machine', () => {
  it('draft → in_review via action_submit_review', () => {
    expect(assertDrawingTransition('draft', 'action_submit_review')).toBe('in_review')
  })

  it('draft → obsolete via action_obsolete', () => {
    expect(assertDrawingTransition('draft', 'action_obsolete')).toBe('obsolete')
  })

  it('in_review → approved via action_approve', () => {
    expect(assertDrawingTransition('in_review', 'action_approve')).toBe('approved')
  })

  it('in_review → draft via action_reject', () => {
    expect(assertDrawingTransition('in_review', 'action_reject')).toBe('draft')
  })

  it('approved → released via action_release', () => {
    expect(assertDrawingTransition('approved', 'action_release')).toBe('released')
  })

  it('released → superseded via action_supersede', () => {
    expect(assertDrawingTransition('released', 'action_supersede')).toBe('superseded')
  })

  it('released → obsolete via action_obsolete', () => {
    expect(assertDrawingTransition('released', 'action_obsolete')).toBe('obsolete')
  })

  it('superseded is terminal', () => {
    expect(() => assertDrawingTransition('superseded', 'action_submit_review')).toThrow(UnprocessableEntityException)
  })

  it('obsolete is terminal', () => {
    expect(() => assertDrawingTransition('obsolete', 'action_release')).toThrow(UnprocessableEntityException)
  })

  it('unknown action throws', () => {
    expect(() => assertDrawingTransition('draft', 'action_unknown')).toThrow(UnprocessableEntityException)
  })
})
