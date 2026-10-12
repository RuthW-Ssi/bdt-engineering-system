import { describe, expect, it } from 'vitest'
import { scopeWorkcenters } from './workcenterScope'

// Active workcenters as GET /workcenters returns them (inactive ones never appear).
const ACTIVE = [
  { id: 26, code: 'WC-CUT-PLATE2.5M', name: 'Cutting' },
  { id: 27, code: 'WC-CUT-PLATE6.0M', name: 'Cutting' },
  { id: 16, code: 'WC-DRILL', name: 'Drilling & Threading' },
  { id: 29, code: 'WC-THREAD', name: 'Drilling & Threading' },
  { id: 22, code: 'WC-GRIND', name: 'Surface & Finishing (manual)' },
]

describe('scopeWorkcenters', () => {
  it('scopes to the default workcenter category when the default is active', () => {
    const r = scopeWorkcenters(16, ACTIVE, null)
    expect(r.category).toBe('Drilling & Threading')
    expect(r.options.map(w => w.code)).toEqual(['WC-DRILL', 'WC-THREAD'])
    expect(r.defaultId).toBe(16)
  })

  it('ignores a retired default — Drill pointing at inactive cutting WC 6 must not hide WC-DRILL', () => {
    const r = scopeWorkcenters(6, ACTIVE, null)
    expect(r.category).toBeNull()
    expect(r.options.map(w => w.code)).toContain('WC-DRILL')
    expect(r.options).toHaveLength(ACTIVE.length)
    expect(r.defaultId).toBeNull()
  })

  it('shows every workcenter when the type has no default', () => {
    const r = scopeWorkcenters(null, ACTIVE, null)
    expect(r.category).toBeNull()
    expect(r.options).toHaveLength(ACTIVE.length)
    expect(r.defaultId).toBeNull()
  })

  it('keeps an already-selected workcenter visible outside the scope', () => {
    const r = scopeWorkcenters(27, ACTIVE, 22)
    expect(r.options.map(w => w.code)).toEqual(['WC-GRIND', 'WC-CUT-PLATE2.5M', 'WC-CUT-PLATE6.0M'])
  })
})
