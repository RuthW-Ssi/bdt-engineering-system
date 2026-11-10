import { describe, expect, it } from 'vitest'
import { planLabel } from './planLabel'

const project = { id: 5, project_code: '0X197', name: 'THEPHA' }
const zone = { id: 50, code: 'Z1', label: 'Zone 1' }

describe('planLabel', () => {
  it('names an upload by project · zone', () => {
    expect(planLabel({ id: 1, project, zone, sub_zone: null })).toBe('0X197 · Z1')
  })
  it('adds the sub-zone code, or its name when it has no code', () => {
    expect(planLabel({ id: 1, project, zone, sub_zone: { id: 9, code: 'SZ-A', name: 'Grid A' } })).toBe('0X197 · Z1 / SZ-A')
    expect(planLabel({ id: 1, project, zone, sub_zone: { id: 9, code: null, name: 'Grid A' } })).toBe('0X197 · Z1 / Grid A')
  })
  it('falls back to the upload number for older uploads without a pick', () => {
    expect(planLabel({ id: 12, project: null, zone: null, sub_zone: null })).toBe('Upload #12')
  })
})
