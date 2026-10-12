import { fileZoneMismatch } from './moPartZone'

describe('fileZoneMismatch', () => {
  const z1 = { code: 'Z01', label: 'Zone 1' }
  it('null when the file names the same zone (leading zeros, spacing, case)', () => {
    expect(fileZoneMismatch('1. DRIVING RANGE BANGNA ZONE 1 Dispatch Note Rev.2.xls', z1)).toBeNull()
    expect(fileZoneMismatch('x zone1 y.xls', z1)).toBeNull()
  })
  it('returns the file zone when it differs', () => {
    expect(fileZoneMismatch('1. DRIVING RANGE BANGNA ZONE 2 Dispatch Note Rev.2.xls', z1)).toBe('2')
  })
  it('null when the file names no zone, or the selected zone has no number to compare', () => {
    expect(fileZoneMismatch('Material List.xls', z1)).toBeNull()
    expect(fileZoneMismatch('ZONE 3.xls', { code: 'NP', label: 'North Part' })).toBeNull()
  })
})
