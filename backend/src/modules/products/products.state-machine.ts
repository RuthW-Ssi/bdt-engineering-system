import { UnprocessableEntityException } from '@nestjs/common'

export type ProductState =
  | 'draft' | 'in_design' | 'in_review' | 'approved'
  | 'released' | 'obsolete'

const TRANSITIONS: Record<string, ProductState[]> = {
  draft:      ['in_design', 'obsolete'],
  in_design:  ['in_review', 'draft'],
  in_review:  ['approved', 'in_design'],
  approved:   ['released', 'in_design'],
  released:   ['obsolete'],
  obsolete:   [],
}

export function assertProductTransition(from: string, to: ProductState) {
  const allowed = TRANSITIONS[from] ?? []
  if (!allowed.includes(to)) {
    throw new UnprocessableEntityException(
      `Cannot transition from '${from}' to '${to}'. Allowed: ${allowed.join(', ') || '(none — terminal)'}`,
    )
  }
}

export const PRODUCT_ACTIONS: Record<string, ProductState> = {
  action_submit_design:  'in_design',
  action_submit_review:  'in_review',
  action_approve:        'approved',
  action_release:        'released',
  action_obsolete:       'obsolete',
  action_reset:          'draft',
}
