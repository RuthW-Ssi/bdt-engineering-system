import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { CreateOperatorDto } from './create-operator.dto'
import { UpdateOperatorDto } from './update-operator.dto'

// 2026-09-29 — the Add/Edit Operator form offers TH / MM / LA, but the DTOs
// only allowed TH / MM, so choosing "LA — Laos" failed with a generic error.
const errorsOn = async (cls: any, body: object) =>
  (await validate(plainToInstance(cls, body))).map(e => e.property)

describe('operator nationality', () => {
  it.each(['TH', 'MM', 'LA'])('accepts %s on create and update', async nat => {
    expect(await errorsOn(CreateOperatorDto, { code: 'OP-X', name: 'X', nationality: nat })).not.toContain('nationality')
    expect(await errorsOn(UpdateOperatorDto, { nationality: nat })).not.toContain('nationality')
  })

  it('still rejects an unknown code', async () => {
    expect(await errorsOn(CreateOperatorDto, { code: 'OP-X', name: 'X', nationality: 'XX' })).toContain('nationality')
    expect(await errorsOn(UpdateOperatorDto, { nationality: 'XX' })).toContain('nationality')
  })
})
