import { UnprocessableEntityException } from '@nestjs/common'

export type ProjectState =
  | 'lead' | 'won' | 'in_design' | 'in_fab'
  | 'in_erection' | 'handover' | 'closed'

const TRANSITIONS: Record<string, ProjectState[]> = {
  lead:         ['won', 'closed'],
  won:          ['in_design', 'closed'],
  in_design:    ['in_fab', 'won'],
  in_fab:       ['in_erection', 'in_design'],
  in_erection:  ['handover', 'in_fab'],
  handover:     ['closed'],
  closed:       [],
}

export function assertProjectTransition(from: string, to: ProjectState) {
  const allowed = TRANSITIONS[from] ?? []
  if (!allowed.includes(to)) {
    throw new UnprocessableEntityException(
      `Cannot transition project from '${from}' to '${to}'. Allowed: ${allowed.join(', ') || '(none — terminal)'}`,
    )
  }
}

export const PROJECT_ACTIONS: Record<string, ProjectState> = {
  action_win:           'won',
  action_start_design:  'in_design',
  action_start_fab:     'in_fab',
  action_start_erect:   'in_erection',
  action_handover:      'handover',
  action_close:         'closed',
  action_revert:        'won',
}
