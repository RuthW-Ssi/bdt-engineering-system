import { classifyProfile, isNotCut, markGroup } from './profile-family'

describe('classifyProfile', () => {
  it.each([
    ['PIPE101.6X2.4', 'PIPE', 'PIPE 101.6X2.4'],
    ['PIPE 165.2x4.5', 'PIPE', 'PIPE 165.2X4.5'],
    ['PIPEØ139.8X3.2', 'PIPE', 'PIPE 139.8X3.2'],
    ['RODRB25', 'ROD', 'ROD RB25'],
    ['ROD RB25', 'ROD', 'ROD RB25'],
    ['RB25', 'ROD', 'ROD RB25'],
    ['L50X50X5', 'L', 'L 50X50X5'],
    ['L 75x75x6', 'L', 'L 75X75X6'],
    ['RHS100X50X2.3', 'BOX', 'BOX 100X50X2.3'],
    ['SHS150X150X4.5', 'BOX', 'BOX 150X150X4.5'],
    ['□100X100X3.2', 'BOX', 'BOX 100X100X3.2'],
    ['C150X75X6.5X10', 'C', 'C 150X75X6.5X10'],
    ['H200X100X5.5X8', 'H', 'H 200X100X5.5X8'],
    ['H-200X100X5.5X8', 'H', 'H 200X100X5.5X8'],
  ])('%s → %s %s (laid out now)', (raw, family, profile) => {
    expect(classifyProfile(raw)).toEqual({ family, profile, enabled: true })
  })

  it.each([
    ['I150X75X5.5', 'I'], ['I-150X75X5.5X9.5', 'I'], ['FB50X6', 'FB'],
  ])('%s → %s, prepared but not laid out yet', (raw, family) => {
    expect(classifyProfile(raw)).toMatchObject({ family, enabled: false })
  })

  it('a sleeve pipe (SL) is the same size as its pipe, flagged', () => {
    expect(classifyProfile('PIPE139.8X5SL')).toEqual({ family: 'PIPE', profile: 'PIPE 139.8X5', enabled: true, sleeve: true })
    expect(classifyProfile('PIPE 216.3X4.5 SL')).toMatchObject({ profile: 'PIPE 216.3X4.5', sleeve: true })
  })

  it('plates and bought items are known not to be cut; anything else unknown is not', () => {
    for (const p of ['PL10', 'PL5X150', 'COUPLING 1"THREAD R.', 'PD50X12.5', 'PD25x5', 'TURNBUCKLE M20']) expect(isNotCut(p)).toBe(true)
    for (const p of ['LC100X50X20X2.3', 'PIPE60.5X2.4', 'XYZ']) expect(isNotCut(p)).toBe(false)
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
