import { UnprocessableEntityException } from '@nestjs/common'

export interface StandardProductFields {
  sale_ok: boolean
  purchase_ok: boolean
  item_code?: string | null
  cost_raw_material?: number | null
  cost_transport?: number | null
  cost_production?: number | null
  cost_warehouse?: number | null
}

export function validateStandardProduct(fields: StandardProductFields) {
  const errors: string[] = []

  // Cost components must be >= 0 when provided
  const costs = [
    { name: 'cost_raw_material', val: fields.cost_raw_material },
    { name: 'cost_transport', val: fields.cost_transport },
    { name: 'cost_production', val: fields.cost_production },
    { name: 'cost_warehouse', val: fields.cost_warehouse },
  ]
  for (const c of costs) {
    if (c.val !== undefined && c.val !== null && c.val < 0) {
      errors.push(`${c.name} must be >= 0`)
    }
  }

  // item_code required when sale_ok or purchase_ok
  if ((fields.sale_ok || fields.purchase_ok) && !fields.item_code) {
    errors.push('item_code is required when sale_ok or purchase_ok is true')
  }

  // item_code must be exactly 10 uppercase alphanumeric chars
  if (fields.item_code) {
    if (!/^[A-Z0-9]{10}$/.test(fields.item_code)) {
      errors.push('item_code must be exactly 10 uppercase alphanumeric characters')
    }
  }

  if (errors.length) {
    throw new UnprocessableEntityException(errors)
  }
}
