import { BadRequestException } from '@nestjs/common'
import { FormulaService } from './formula.service'

describe('FormulaService', () => {
  let svc: FormulaService

  beforeEach(() => { svc = new FormulaService() })

  // ── Safe evaluation ─────────────────────────────────────────────

  it('evaluates simple arithmetic', () => {
    expect(svc.evaluate('2 + 3', {})).toBe(5)
  })

  it('evaluates expression with variables', () => {
    expect(svc.evaluate('sumWeight * 0.8', { sumWeight: 2500 })).toBeCloseTo(2000)
  })

  it('evaluates multi-variable formula', () => {
    expect(svc.evaluate('(Length * 2) + (Width * 2)', { Length: 6, Width: 2 })).toBe(16)
  })

  it('ceil() is allowed', () => {
    expect(svc.evaluate('ceil(sumWeight / 500)', { sumWeight: 1200 })).toBe(3)
  })

  it('floor() is allowed', () => {
    expect(svc.evaluate('floor(3.9)', {})).toBe(3)
  })

  it('min() and max() are allowed', () => {
    expect(svc.evaluate('min(a, b)', { a: 3, b: 7 })).toBe(3)
    expect(svc.evaluate('max(a, b)', { a: 3, b: 7 })).toBe(7)
  })

  it('abs() is allowed', () => {
    expect(svc.evaluate('abs(-5)', {})).toBe(5)
  })

  it('constant 1 returns 1', () => {
    expect(svc.evaluate('1', {})).toBe(1)
  })

  // ── Missing variable ────────────────────────────────────────────

  it('throws BadRequestException when variable is missing', () => {
    expect(() => svc.evaluate('sumWeight * 0.8', {})).toThrow(BadRequestException)
  })

  // ── Security: injection attempts ────────────────────────────────

  it('rejects process.env access', () => {
    expect(() => svc.evaluate('process.env.SECRET', {})).toThrow(BadRequestException)
  })

  it('rejects require()', () => {
    expect(() => svc.evaluate('require("fs")', {})).toThrow(BadRequestException)
  })

  it('rejects __proto__ access', () => {
    expect(() => svc.evaluate('__proto__.polluted', {})).toThrow(BadRequestException)
  })

  it('rejects bracket notation property access', () => {
    expect(() => svc.evaluate('a["key"]', { a: 1 })).toThrow(BadRequestException)
  })

  // ── variables() helper ─────────────────────────────────────────

  it('returns correct variable list', () => {
    const vars = svc.variables('sumWeight * 0.8 + Length')
    expect(vars).toContain('sumWeight')
    expect(vars).toContain('Length')
  })
})
