import { UnprocessableEntityException } from '@nestjs/common'
import { assertProductTransition, PRODUCT_ACTIONS } from './products.state-machine'

describe('Product State Machine', () => {
  describe('assertProductTransition', () => {
    const validTransitions = [
      ['draft', 'in_design'],
      ['draft', 'obsolete'],
      ['in_design', 'in_review'],
      ['in_design', 'draft'],
      ['in_review', 'approved'],
      ['in_review', 'in_design'],
      ['approved', 'released'],
      ['approved', 'in_design'],
      ['released', 'obsolete'],
    ]

    test.each(validTransitions)('%s → %s (valid)', (from, to) => {
      expect(() => assertProductTransition(from, to as any)).not.toThrow()
    })

    const invalidTransitions = [
      ['draft', 'approved'],
      ['draft', 'released'],
      ['in_design', 'released'],
      ['in_review', 'released'],
      ['released', 'draft'],
      ['obsolete', 'draft'],
      ['obsolete', 'released'],
    ]

    test.each(invalidTransitions)('%s → %s (invalid)', (from, to) => {
      expect(() => assertProductTransition(from, to as any)).toThrow(UnprocessableEntityException)
    })

    it('throws for unknown source state', () => {
      expect(() => assertProductTransition('unknown', 'draft')).toThrow(UnprocessableEntityException)
    })
  })

  describe('PRODUCT_ACTIONS', () => {
    it('maps action_submit_design to in_design', () => {
      expect(PRODUCT_ACTIONS.action_submit_design).toBe('in_design')
    })

    it('maps action_release to released', () => {
      expect(PRODUCT_ACTIONS.action_release).toBe('released')
    })

    it('maps action_obsolete to obsolete', () => {
      expect(PRODUCT_ACTIONS.action_obsolete).toBe('obsolete')
    })
  })
})
