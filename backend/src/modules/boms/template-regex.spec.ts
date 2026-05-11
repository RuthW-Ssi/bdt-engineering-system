/**
 * Unit tests for the 9 ProductTemplate parser_regex patterns (Sprint 7 F2 — T2.7).
 * Tests run purely against regex strings — no DB or PrismaClient involved.
 * Regex values mirror exactly what is seeded in backend/prisma/seed.ts.
 */

const REGEXES: Record<string, RegExp> = {
  PLATE:     /^(?:PL|PLT)\s*(\d+(?:\.\d+)?)[xX*×](\d+(?:\.\d+)?)(?:[xX*×](\d+(?:\.\d+)?))?/,
  L_ANGLE:   /^L\s*(\d+(?:\.\d+)?)[xX*×](\d+(?:\.\d+)?)[xX*×](\d+(?:\.\d+)?)/,
  H_BEAM:    /^H\s*(\d+(?:\.\d+)?)[xX*×](\d+(?:\.\d+)?)[xX*×](\d+(?:\.\d+)?)[xX*×](\d+(?:\.\d+)?)/,
  C_CHANNEL: /^C\s*(\d+(?:\.\d+)?)[xX*×](\d+(?:\.\d+)?)[xX*×](\d+(?:\.\d+)?)[xX*×](\d+(?:\.\d+)?)/,
  CHS:       /^CHS\s*(\d+(?:\.\d+)?)[xX*×](\d+(?:\.\d+)?)(?:SL)?/,
  PIPE:      /^PIPE\s*(\d+(?:\.\d+)?)[xX*×](\d+(?:\.\d+)?)(?:SL)?/,
  RHS:       /^RHS\s*(\d+(?:\.\d+)?)[xX*×](\d+(?:\.\d+)?)[xX*×](\d+(?:\.\d+)?)/,
  SHS:       /^SHS\s*(\d+(?:\.\d+)?)[xX*×](\d+(?:\.\d+)?)/,
  ROD:       /^(?:ROD\s*)?(?:RODRB|RB)\s*(\d+(?:\.\d+)?)/,
}

function m(template: string, profile: string) {
  return profile.match(REGEXES[template])
}

// ────────────────────────────────────────────────────────────
describe('PLATE regex', () => {
  it('matches PL prefix with 2 dims', () => {
    const r = m('PLATE', 'PL12x200')!
    expect(r).toBeTruthy()
    expect(r[1]).toBe('12')
    expect(r[2]).toBe('200')
  })
  it('matches PL prefix with 3 dims', () => {
    const r = m('PLATE', 'PL12x200x6000')!
    expect(r[1]).toBe('12'); expect(r[2]).toBe('200'); expect(r[3]).toBe('6000')
  })
  it('matches PLT alias (T2.4 fix)', () => {
    const r = m('PLATE', 'PLT16x300')!
    expect(r).toBeTruthy(); expect(r[1]).toBe('16')
  })
  it('matches decimal thickness', () => {
    const r = m('PLATE', 'PL6.0x400')!
    expect(r[1]).toBe('6.0')
  })
  it('matches uppercase X separator', () => {
    expect(m('PLATE', 'PL25X500X6000')).toBeTruthy()
  })
  it('matches * separator', () => {
    expect(m('PLATE', 'PL12*200')).toBeTruthy()
  })
  it('matches space after prefix', () => {
    expect(m('PLATE', 'PL 12x200')).toBeTruthy()
  })
  it('matches PLT with 3 dims', () => {
    const r = m('PLATE', 'PLT9x600x12000')!
    expect(r[1]).toBe('9'); expect(r[2]).toBe('600'); expect(r[3]).toBe('12000')
  })
  it('does not match H_BEAM profile', () => {
    expect(m('PLATE', 'H150x75x7x10')).toBeNull()
  })
  it('does not match L_ANGLE profile', () => {
    expect(m('PLATE', 'L50x50x5')).toBeNull()
  })
})

// ────────────────────────────────────────────────────────────
describe('L_ANGLE regex', () => {
  it('matches equal-leg angle', () => {
    const r = m('L_ANGLE', 'L50x50x5')!
    expect(r[1]).toBe('50'); expect(r[2]).toBe('50'); expect(r[3]).toBe('5')
  })
  it('matches unequal-leg angle', () => {
    const r = m('L_ANGLE', 'L75x50x6')!
    expect(r[1]).toBe('75'); expect(r[2]).toBe('50'); expect(r[3]).toBe('6')
  })
  it('matches uppercase X', () => {
    expect(m('L_ANGLE', 'L100X100X8')).toBeTruthy()
  })
  it('matches space after prefix', () => {
    expect(m('L_ANGLE', 'L 65x65x6')).toBeTruthy()
  })
  it('matches decimal thickness', () => {
    const r = m('L_ANGLE', 'L50x50x5.5')!
    expect(r[3]).toBe('5.5')
  })
  it('matches large section', () => {
    expect(m('L_ANGLE', 'L150x90x10')).toBeTruthy()
  })
  it('does not match PLATE profile', () => {
    expect(m('L_ANGLE', 'PL12x200')).toBeNull()
  })
  it('does not match H_BEAM profile', () => {
    expect(m('L_ANGLE', 'H150x150x7x10')).toBeNull()
  })
  it('does not match 2-dim only', () => {
    expect(m('L_ANGLE', 'L50x5')).toBeNull()
  })
  it('matches × separator', () => {
    expect(m('L_ANGLE', 'L65×65×6')).toBeTruthy()
  })
})

// ────────────────────────────────────────────────────────────
describe('H_BEAM regex (Rev 2: 4-dim HxBxTwxTf)', () => {
  it('matches standard H section', () => {
    const r = m('H_BEAM', 'H150x75x7x10')!
    expect(r[1]).toBe('150'); expect(r[2]).toBe('75')
    expect(r[3]).toBe('7');   expect(r[4]).toBe('10')
  })
  it('matches decimal web and flange thickness', () => {
    const r = m('H_BEAM', 'H200x100x5.5x8')!
    expect(r[3]).toBe('5.5'); expect(r[4]).toBe('8')
  })
  it('matches space after prefix', () => {
    const r = m('H_BEAM', 'H 300x150x6.5x10')!
    expect(r).toBeTruthy(); expect(r[1]).toBe('300')
  })
  it('matches uppercase X', () => {
    expect(m('H_BEAM', 'H400X200X8X13')).toBeTruthy()
  })
  it('matches deep section', () => {
    expect(m('H_BEAM', 'H500x200x10x16')).toBeTruthy()
  })
  it('matches wide-flange section', () => {
    expect(m('H_BEAM', 'H250x250x9x14')).toBeTruthy()
  })
  it('does not match 3-dim profile', () => {
    expect(m('H_BEAM', 'H150x75x7')).toBeNull()
  })
  it('does not match C_CHANNEL profile', () => {
    expect(m('H_BEAM', 'C150x65x8x12')).toBeNull()
  })
  it('does not match PLATE', () => {
    expect(m('H_BEAM', 'PL12x200')).toBeNull()
  })
  it('captures Tw ≠ Tf (key Rev 2 invariant)', () => {
    const r = m('H_BEAM', 'H700x300x13x24')!
    expect(r[3]).not.toBe(r[4])
  })
})

// ────────────────────────────────────────────────────────────
describe('C_CHANNEL regex (4-dim — T2.4 fix)', () => {
  it('matches standard C section', () => {
    const r = m('C_CHANNEL', 'C150x65x8x12')!
    expect(r[1]).toBe('150'); expect(r[2]).toBe('65')
    expect(r[3]).toBe('8');   expect(r[4]).toBe('12')
  })
  it('matches decimal dims', () => {
    const r = m('C_CHANNEL', 'C200x75x8.5x12.5')!
    expect(r[3]).toBe('8.5'); expect(r[4]).toBe('12.5')
  })
  it('matches space after prefix', () => {
    expect(m('C_CHANNEL', 'C 180x75x8x13')).toBeTruthy()
  })
  it('matches uppercase X', () => {
    expect(m('C_CHANNEL', 'C150X65X8X12')).toBeTruthy()
  })
  it('matches small section', () => {
    expect(m('C_CHANNEL', 'C100x50x5x8')).toBeTruthy()
  })
  it('does not match H_BEAM profile', () => {
    expect(m('C_CHANNEL', 'H150x75x7x10')).toBeNull()
  })
  it('does not match 3-dim only', () => {
    expect(m('C_CHANNEL', 'C150x65x8')).toBeNull()
  })
  it('does not match RHS profile', () => {
    expect(m('C_CHANNEL', 'RHS200x100x5')).toBeNull()
  })
  it('matches large channel', () => {
    expect(m('C_CHANNEL', 'C380x100x10x17')).toBeTruthy()
  })
  it('matches × separator', () => {
    expect(m('C_CHANNEL', 'C150×65×8×12')).toBeTruthy()
  })
})

// ────────────────────────────────────────────────────────────
describe('CHS regex (SL suffix strip — T2.4 fix)', () => {
  it('matches standard CHS', () => {
    const r = m('CHS', 'CHS89x4')!
    expect(r[1]).toBe('89'); expect(r[2]).toBe('4')
  })
  it('matches decimal outer diameter', () => {
    const r = m('CHS', 'CHS114.3x5')!
    expect(r[1]).toBe('114.3')
  })
  it('strips SL suffix — captures dims without SL', () => {
    const r = m('CHS', 'CHS219.1x8SL')!
    expect(r[1]).toBe('219.1'); expect(r[2]).toBe('8')
  })
  it('matches space after prefix', () => {
    expect(m('CHS', 'CHS 60.3x4')).toBeTruthy()
  })
  it('matches SL on typical pipe size', () => {
    expect(m('CHS', 'CHS168.3x6SL')).toBeTruthy()
  })
  it('matches decimal wall thickness', () => {
    expect(m('CHS', 'CHS76x4.5')).toBeTruthy()
  })
  it('does not match PIPE profile', () => {
    expect(m('CHS', 'PIPE89x4')).toBeNull()
  })
  it('does not match SHS profile', () => {
    expect(m('CHS', 'SHS100x5')).toBeNull()
  })
  it('does not match 1-dim only', () => {
    expect(m('CHS', 'CHS89')).toBeNull()
  })
  it('matches uppercase X', () => {
    expect(m('CHS', 'CHS89X4')).toBeTruthy()
  })
})

// ────────────────────────────────────────────────────────────
describe('PIPE regex (SL suffix strip — T2.4 fix)', () => {
  it('matches standard pipe', () => {
    const r = m('PIPE', 'PIPE89x4')!
    expect(r[1]).toBe('89'); expect(r[2]).toBe('4')
  })
  it('matches decimal OD', () => {
    const r = m('PIPE', 'PIPE114.3x5')!
    expect(r[1]).toBe('114.3')
  })
  it('strips SL suffix — captures dims without SL', () => {
    const r = m('PIPE', 'PIPE219.1x8SL')!
    expect(r[1]).toBe('219.1'); expect(r[2]).toBe('8')
  })
  it('matches space after prefix', () => {
    expect(m('PIPE', 'PIPE 60x3.5')).toBeTruthy()
  })
  it('matches pipe with SL on common size', () => {
    expect(m('PIPE', 'PIPE168x6SL')).toBeTruthy()
  })
  it('matches decimal wall thickness', () => {
    expect(m('PIPE', 'PIPE76.1x5')).toBeTruthy()
  })
  it('does not match CHS profile', () => {
    expect(m('PIPE', 'CHS89x4')).toBeNull()
  })
  it('does not match 1-dim only', () => {
    expect(m('PIPE', 'PIPE89')).toBeNull()
  })
  it('matches uppercase X with SL', () => {
    expect(m('PIPE', 'PIPE89X4SL')).toBeTruthy()
  })
  it('does not match PLATE', () => {
    expect(m('PIPE', 'PL12x200')).toBeNull()
  })
})

// ────────────────────────────────────────────────────────────
describe('RHS regex', () => {
  it('matches standard RHS', () => {
    const r = m('RHS', 'RHS200x100x5')!
    expect(r[1]).toBe('200'); expect(r[2]).toBe('100'); expect(r[3]).toBe('5')
  })
  it('matches small section', () => {
    expect(m('RHS', 'RHS150x50x4')).toBeTruthy()
  })
  it('matches large section', () => {
    expect(m('RHS', 'RHS300x150x8')).toBeTruthy()
  })
  it('matches space after prefix', () => {
    expect(m('RHS', 'RHS 250x125x6.5')).toBeTruthy()
  })
  it('matches uppercase X', () => {
    expect(m('RHS', 'RHS200X100X5')).toBeTruthy()
  })
  it('matches square RHS (H=W)', () => {
    expect(m('RHS', 'RHS100x100x4')).toBeTruthy()
  })
  it('does not match SHS profile', () => {
    expect(m('RHS', 'SHS100x5')).toBeNull()
  })
  it('does not match CHS profile', () => {
    expect(m('RHS', 'CHS89x4')).toBeNull()
  })
  it('does not match 2-dim only', () => {
    expect(m('RHS', 'RHS200x100')).toBeNull()
  })
  it('matches decimal wall', () => {
    const r = m('RHS', 'RHS200x100x6.3')!
    expect(r[3]).toBe('6.3')
  })
})

// ────────────────────────────────────────────────────────────
describe('SHS regex', () => {
  it('matches standard SHS', () => {
    const r = m('SHS', 'SHS100x5')!
    expect(r[1]).toBe('100'); expect(r[2]).toBe('5')
  })
  it('matches large SHS', () => {
    expect(m('SHS', 'SHS150x6')).toBeTruthy()
  })
  it('matches space after prefix', () => {
    expect(m('SHS', 'SHS 200x8')).toBeTruthy()
  })
  it('matches decimal size', () => {
    const r = m('SHS', 'SHS75.5x4')!
    expect(r[1]).toBe('75.5')
  })
  it('matches uppercase X', () => {
    expect(m('SHS', 'SHS100X5')).toBeTruthy()
  })
  it('matches small section', () => {
    expect(m('SHS', 'SHS50x3')).toBeTruthy()
  })
  it('does not match RHS profile', () => {
    expect(m('SHS', 'RHS100x50x5')).toBeNull()
  })
  it('does not match CHS profile', () => {
    expect(m('SHS', 'CHS100x5')).toBeNull()
  })
  it('does not match 1-dim only', () => {
    expect(m('SHS', 'SHS100')).toBeNull()
  })
  it('captures both width and thickness', () => {
    const r = m('SHS', 'SHS100x5x4')!
    expect(r[1]).toBe('100'); expect(r[2]).toBe('5')
  })
})

// ────────────────────────────────────────────────────────────
describe('ROD regex (RODRB/RB variants — T2.4 fix)', () => {
  it('matches RODRB format', () => {
    const r = m('ROD', 'RODRB16')!
    expect(r[1]).toBe('16')
  })
  it('matches RB format', () => {
    const r = m('ROD', 'RB20')!
    expect(r[1]).toBe('20')
  })
  it('matches ROD RB format with space', () => {
    const r = m('ROD', 'ROD RB12')!
    expect(r[1]).toBe('12')
  })
  it('matches RODRB with space before dia', () => {
    const r = m('ROD', 'RODRB 25')!
    expect(r[1]).toBe('25')
  })
  it('matches small dia', () => {
    expect(m('ROD', 'RB10')).toBeTruthy()
  })
  it('matches large dia', () => {
    expect(m('ROD', 'RB32')).toBeTruthy()
  })
  it('matches another RODRB size', () => {
    expect(m('ROD', 'RODRB13')).toBeTruthy()
  })
  it('matches decimal dia', () => {
    const r = m('ROD', 'RODRB16.5')!
    expect(r[1]).toBe('16.5')
  })
  it('does not match plain ROD## without RB variant', () => {
    expect(m('ROD', 'ROD12')).toBeNull()
  })
  it('does not match PLATE profile', () => {
    expect(m('ROD', 'PL12x200')).toBeNull()
  })
})
