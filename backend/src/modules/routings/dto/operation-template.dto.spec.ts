import 'reflect-metadata'   // @Type() needs it; the Nest app loads it via @nestjs/core
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { CreateOperationTemplateDto, UpdateOperationTemplateDto } from './operation-template.dto'

// Same options as the global ValidationPipe in main.ts (whitelist + transform).
async function errorsOf(cls: new () => object, body: object): Promise<string[]> {
  const errs = await validate(plainToInstance(cls, body), { whitelist: true })
  const flat = (e: (typeof errs)[number], path = ''): string[] => {
    const here = path ? `${path}.${e.property}` : e.property
    return [...Object.keys(e.constraints ?? {}).map((c) => `${here}:${c}`), ...(e.children ?? []).flatMap((c) => flat(c, here))]
  }
  return errs.flatMap((e) => flat(e))
}

const activity = (over: object = {}) => ({ name: 'Weld', measure: 'ACT-001', ...over })
const validCreate = (over: object = {}) => ({ op_code: 'OP-001', name: 'Weld beam', time_mode: 'by_activities', activities: [activity()], ...over })

describe('CreateOperationTemplateDto', () => {
  it('accepts what OperationBuilder sends', async () => {
    expect(await errorsOf(CreateOperationTemplateDto, validCreate())).toEqual([])
  })

  it.each(['formula', 'manual', 'by_activities'])('accepts time_mode %s', async (time_mode) => {
    expect(await errorsOf(CreateOperationTemplateDto, validCreate({ time_mode }))).toEqual([])
  })

  it('rejects a time_mode outside the known set (e.g. the retired "fixed")', async () => {
    expect(await errorsOf(CreateOperationTemplateDto, validCreate({ time_mode: 'fixed' }))).toEqual(['time_mode:isIn'])
  })

  it.each([
    ['op_code', { op_code: '' }, 'op_code:matches'],
    ['name', { name: '' }, 'name:matches'],
    ['activity name', { activities: [activity({ name: '' })] }, 'activities.0.name:matches'],
    ['activity measure', { activities: [activity({ measure: '' })] }, 'activities.0.measure:matches'],
  ])('rejects an empty %s', async (_label, over, expected) => {
    expect(await errorsOf(CreateOperationTemplateDto, validCreate(over))).toContain(expected)
  })

  it('rejects whitespace-only names (the service would trim them to "")', async () => {
    expect(await errorsOf(CreateOperationTemplateDto, validCreate({ name: '   ' }))).toEqual(['name:matches'])
    expect(await errorsOf(CreateOperationTemplateDto, validCreate({ activities: [activity({ measure: ' ' })] }))).toEqual([
      'activities.0.measure:matches',
    ])
  })

  it('caps activities at 50 per request', async () => {
    const ok = Array.from({ length: 50 }, () => activity())
    expect(await errorsOf(CreateOperationTemplateDto, validCreate({ activities: ok }))).toEqual([])
    expect(await errorsOf(CreateOperationTemplateDto, validCreate({ activities: [...ok, activity()] }))).toEqual(['activities:arrayMaxSize'])
  })

  it.each(['tool_ids', 'consumables', 'skills'])('caps %s at 50 per activity', async (key) => {
    const item = key === 'tool_ids' ? { id: 1, qty: 1 } : key === 'consumables' ? { resource_id: 1 } : { skill: 'weld', qty: 1 }
    const acts = [activity({ [key]: Array.from({ length: 51 }, () => item) })]
    expect(await errorsOf(CreateOperationTemplateDto, validCreate({ activities: acts }))).toEqual([`activities.0.${key}:arrayMaxSize`])
  })
})

describe('UpdateOperationTemplateDto', () => {
  it('accepts a partial update and an omitted time_mode', async () => {
    expect(await errorsOf(UpdateOperationTemplateDto, { name: 'Renamed' })).toEqual([])
  })

  it('rejects null for columns that cannot be cleared (was a 500 from Prisma / the service)', async () => {
    expect(await errorsOf(UpdateOperationTemplateDto, { time_mode: null })).toEqual(['time_mode:isIn'])
    expect(await errorsOf(UpdateOperationTemplateDto, { activities: null })).toEqual(
      expect.arrayContaining(['activities:isArray']),
    )
  })

  it('rejects a whitespace-only name on update', async () => {
    expect(await errorsOf(UpdateOperationTemplateDto, { name: '  ' })).toEqual(['name:matches'])
  })

  it('rejects an empty name and an unknown time_mode', async () => {
    expect(await errorsOf(UpdateOperationTemplateDto, { name: '', time_mode: 'fixed' })).toEqual(
      expect.arrayContaining(['name:matches', 'time_mode:isIn']),
    )
  })
})
