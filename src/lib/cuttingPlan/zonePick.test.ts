import { describe, expect, it } from 'vitest'
import { ALL_ZONES, zonePick } from './zonePick'

describe('zonePick', () => {
  it('sends the picked zone and sub-zone', () => {
    expect(zonePick('50', '500')).toEqual({ zone_id: 50, sub_zone_id: 500 })
    expect(zonePick('50', '')).toEqual({ zone_id: 50, sub_zone_id: undefined })
  })
  it('All zones sends no zone and never a sub-zone', () => {
    expect(zonePick(ALL_ZONES, '500')).toEqual({ zone_id: undefined, sub_zone_id: undefined })
  })
  it('nothing picked yet is not a zone', () => {
    expect(zonePick('', '')).toBeNull()
  })
})
