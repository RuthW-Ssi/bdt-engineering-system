import { classifyProfile, markGroup } from './profile-family'

describe('classifyProfile', () => {
  it.each([
    ['PIPE101.6X2.4', 'PIPE', 'PIPE 101.6X2.4'],
    ['PIPE 165.2x4.5', 'PIPE', 'PIPE 165.2X4.5'],
    ['PIPEØ139.8X3.2', 'PIPE', 'PIPE 139.8X3.2'],
    ['RODRB25', 'ROD', 'ROD RB25'],
    ['ROD RB25', 'ROD', 'ROD RB25'],
    ['RB25', 'ROD', 'ROD RB25'],
  ])('%s → %s %s (laid out now)', (raw, family, profile) => {
    expect(classifyProfile(raw)).toEqual({ family, profile, enabled: true })
  })

  it.each([
    ['H200X100X5.5X8', 'H'], ['C100X50X5', 'C'], ['L65X65X6', 'L'], ['□100X100X3.2', 'BOX'], ['SHS100X100X3.2', 'BOX'], ['FB50X6', 'FB'],
  ])('%s → %s, prepared but not laid out yet', (raw, family) => {
    expect(classifyProfile(raw)).toMatchObject({ family, enabled: false })
  })

  it('plates and bought items are not 1D cuts', () => {
    expect(classifyProfile('PL10')).toBeNull()
    expect(classifyProfile('COUPLING 1"THREAD R.')).toBeNull()
    expect(classifyProfile('PD50x12.5')).toBeNull()
    expect(classifyProfile(null)).toBeNull()
  })
})

describe('markGroup', () => {
  it('drops the last "-" segment', () => {
    expect(markGroup('DBN-A3-m49')).toBe('DBN-A3')
    expect(markGroup('DBN-A1-m37')).toBe('DBN-A1')
    expect(markGroup('X12')).toBe('X12')
  })
})
