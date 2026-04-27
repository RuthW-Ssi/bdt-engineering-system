import { UnprocessableEntityException } from '@nestjs/common'
import { validateStandardProduct } from './standard-product.validator'

describe('validateStandardProduct', () => {
  it('passes with valid non-commercial product', () => {
    expect(() => validateStandardProduct({
      sale_ok: false,
      purchase_ok: false,
    })).not.toThrow()
  })

  it('passes with sale_ok + valid item_code', () => {
    expect(() => validateStandardProduct({
      sale_ok: true,
      purchase_ok: false,
      item_code: 'BDTC000123',
    })).not.toThrow()
  })

  it('fails when sale_ok but no item_code', () => {
    expect(() => validateStandardProduct({
      sale_ok: true,
      purchase_ok: false,
    })).toThrow(UnprocessableEntityException)
  })

  it('fails when purchase_ok but no item_code', () => {
    expect(() => validateStandardProduct({
      sale_ok: false,
      purchase_ok: true,
    })).toThrow(UnprocessableEntityException)
  })

  it('fails when item_code is not 10 chars', () => {
    expect(() => validateStandardProduct({
      sale_ok: true,
      purchase_ok: false,
      item_code: 'BDT123',
    })).toThrow(UnprocessableEntityException)
  })

  it('fails when item_code has lowercase', () => {
    expect(() => validateStandardProduct({
      sale_ok: true,
      purchase_ok: false,
      item_code: 'bdtc000123',
    })).toThrow(UnprocessableEntityException)
  })

  it('fails when cost is negative', () => {
    expect(() => validateStandardProduct({
      sale_ok: false,
      purchase_ok: false,
      cost_raw_material: -100,
    })).toThrow(UnprocessableEntityException)
  })

  it('passes with zero cost', () => {
    expect(() => validateStandardProduct({
      sale_ok: false,
      purchase_ok: false,
      cost_raw_material: 0,
      cost_transport: 0,
    })).not.toThrow()
  })
})
