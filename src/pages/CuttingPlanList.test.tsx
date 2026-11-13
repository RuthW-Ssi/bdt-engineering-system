import { TABS, tabFromParam } from './CuttingPlanList'

describe('Cutting Plan tabs', () => {
  it('has CP-Shape-Test as its own tab after Plate and Shape', () => {
    expect(TABS.map(t => t.label)).toEqual(['Plate', 'Shape', 'CP-Shape-Test'])
  })
  it('reads the tab from ?tab=, Plate by default', () => {
    expect(tabFromParam(null)).toBe('plate')
    expect(tabFromParam('shape')).toBe('shape')
    expect(tabFromParam('shape-test')).toBe('shape-test')
    expect(tabFromParam('nope')).toBe('plate')
  })
})
