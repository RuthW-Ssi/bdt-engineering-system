import { describe, it, expect } from 'vitest'
import { consumablesPayload } from './OperationBuilder'

// Regression (2026-09-29): publishing a new operation built from a library
// activity that consumes materials returned 500 — the activity's own
// consumes (ids from `materials`) were re-sent as op-level consumables and
// written to op_act_material, whose FK points at equipment_resource.
// Library-linked consumables are read from the source activity everywhere
// (MO/WO/routing consumeMap), so they must never be re-saved.

const material = { material_id: 73, name: 'สเปรย์สีขาว ติดทนนาน', code: 'BIF81100073', formula_id: 20 }

describe('consumablesPayload', () => {
  it('sends nothing for a library-linked activity, even when it carries materials', () => {
    expect(consumablesPayload({ source_activity_id: 133, consumables: [], op_materials: [material] })).toEqual([])
  })

  it('keeps an ad-hoc activity\'s own consumables and op-level materials', () => {
    expect(consumablesPayload({
      source_activity_id: null,
      consumables: [{ resource_id: 5, qty: '2', unit: 'kg' }],
      op_materials: [material],
    })).toEqual([
      { resource_id: 5, qty: 2, unit: 'kg' },
      { resource_id: 73, formula_id: 20 },
    ])
  })
})
