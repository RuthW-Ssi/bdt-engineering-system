import { UnprocessableEntityException } from '@nestjs/common'

export type BomState = 'draft' | 'active' | 'obsolete'

const BOM_TRANSITIONS: Record<BomState, BomState[]> = {
  draft:    ['active', 'obsolete'],
  active:   ['obsolete'],
  obsolete: [],
}

export const BOM_ACTIONS: Record<string, BomState> = {
  action_activate: 'active',
  action_obsolete: 'obsolete',
}

export function assertBomTransition(current: BomState, action: string): BomState {
  const target = BOM_ACTIONS[action]
  if (!target) throw new UnprocessableEntityException(`Unknown action: ${action}`)
  const allowed = BOM_TRANSITIONS[current] ?? []
  if (!allowed.includes(target)) {
    throw new UnprocessableEntityException(
      `Cannot transition from '${current}' via '${action}'. Allowed targets: ${allowed.join(', ') || '(none — terminal)'}`,
    )
  }
  return target
}
