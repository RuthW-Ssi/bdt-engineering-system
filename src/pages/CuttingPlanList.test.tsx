import { TABS, tabFromParam } from './CuttingPlanList'

describe('Cutting Plan tabs', () => {
  // 2026-11-26 user report: the remnant register is its own tab (Plate + Shape remnants); CP-Shape-Test stays last
  it('has Remnants after Plate and Shape, CP-Shape-Test last', () => {
    expect(TABS.map(t => t.label)).toEqual(['Plate', 'Shape', 'Remnants', 'CP-Shape-Test'])
  })
  it('reads the tab from ?tab=, Plate by default', () => {
    expect(tabFromParam(null)).toBe('plate')
    expect(tabFromParam('shape')).toBe('shape')
    expect(tabFromParam('shape-test')).toBe('shape-test')
    expect(tabFromParam('remnants')).toBe('remnants')
    expect(tabFromParam('nope')).toBe('plate')
  })
})
