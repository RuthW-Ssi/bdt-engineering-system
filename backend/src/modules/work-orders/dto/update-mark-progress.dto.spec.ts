import 'reflect-metadata' // @Type() needs it; the Nest app loads it via @nestjs/core
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { UpdateMarkProgressDto } from './update-mark-progress.dto'

// Same options as the global ValidationPipe in main.ts (whitelist + transform).
async function errorsOf(body: object): Promise<string[]> {
  const errs = await validate(plainToInstance(UpdateMarkProgressDto, body), { whitelist: true })
  const flat = (e: (typeof errs)[number], path = ''): string[] => {
    const here = path ? `${path}.${e.property}` : e.property
    return [...Object.keys(e.constraints ?? {}).map((c) => `${here}:${c}`), ...(e.children ?? []).flatMap((c) => flat(c, here))]
  }
  return errs.flatMap((e) => flat(e))
}

const SIX = { qty_not_started: 2, qty_in_progress: 0, qty_done: 8, qty_qc_passed: 6, qty_rework: 1, qty_renew: 0 }
const EXPECTED = { qty_not_started: 10, qty_in_progress: null, qty_done: null, qty_qc_passed: null, qty_rework: null, qty_renew: null }

describe('UpdateMarkProgressDto', () => {
  it('accepts the six totals plus `expected` (nulls allowed inside it)', async () => {
    expect(await errorsOf({ ...SIX, expected: EXPECTED })).toEqual([])
  })

  // Fix wave 2026-10-05: a missing `expected` must be a 400, not fall through
  // to the service's stale check and come back as a misleading 409.
  it('rejects a missing `expected`', async () => {
    expect(await errorsOf(SIX)).toContain('expected:isDefined')
  })

  it('rejects a non-object `expected`', async () => {
    expect(await errorsOf({ ...SIX, expected: 5 })).toContain('expected:isObject')
  })

  it('rejects a negative total', async () => {
    expect(await errorsOf({ ...SIX, qty_done: -1, expected: EXPECTED })).toContain('qty_done:min')
  })
})
