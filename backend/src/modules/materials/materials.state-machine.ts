import { UnprocessableEntityException } from '@nestjs/common'

export type MaterialState = 'draft' | 'to_approve' | 'confirmed' | 'cancel' | 'blocked'

const TRANSITIONS: Record<string, MaterialState[]> = {
  draft:      ['to_approve', 'cancel'],
  to_approve: ['confirmed', 'draft', 'cancel'],
  confirmed:  ['blocked', 'cancel'],
  cancel:     ['draft'],
  blocked:    ['confirmed'],
}

export function assertTransition(from: string, to: MaterialState) {
  const allowed = TRANSITIONS[from] ?? []
  if (!allowed.includes(to)) {
    throw new UnprocessableEntityException(
      `Cannot transition from '${from}' to '${to}'. Allowed: ${allowed.join(', ')}`,
    )
  }
}

export const STATE_ACTIONS: Record<string, MaterialState> = {
  action_submit:  'to_approve',
  action_confirm: 'confirmed',
  action_cancel:  'cancel',
  action_reset:   'draft',
  action_block:   'blocked',
  action_unblock: 'confirmed',
}
