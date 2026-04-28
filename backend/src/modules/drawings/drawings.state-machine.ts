import { UnprocessableEntityException } from '@nestjs/common'

export type DrawingState = 'draft' | 'in_review' | 'approved' | 'released' | 'superseded' | 'obsolete'

const DRAWING_TRANSITIONS: Record<DrawingState, DrawingState[]> = {
  draft:      ['in_review', 'obsolete'],
  in_review:  ['approved', 'draft'],
  approved:   ['released', 'in_review'],
  released:   ['superseded', 'obsolete'],
  superseded: [],
  obsolete:   [],
}

export const DRAWING_ACTIONS: Record<string, DrawingState> = {
  action_submit_review: 'in_review',
  action_approve:       'approved',
  action_reject:        'draft',
  action_release:       'released',
  action_supersede:     'superseded',
  action_obsolete:      'obsolete',
}

export function assertDrawingTransition(current: DrawingState, action: string): DrawingState {
  const target = DRAWING_ACTIONS[action]
  if (!target) throw new UnprocessableEntityException(`Unknown action: ${action}`)
  const allowed = DRAWING_TRANSITIONS[current] ?? []
  if (!allowed.includes(target)) {
    throw new UnprocessableEntityException(
      `Cannot transition from '${current}' via '${action}'. Allowed targets: ${allowed.join(', ') || '(none — terminal)'}`,
    )
  }
  return target
}
