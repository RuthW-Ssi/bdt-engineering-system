import { BadRequestException } from '@nestjs/common'
import { BomExplosionService } from './bom-explosion.service'

function makeMockPrisma(bomMap: Record<number, any>, subBomMap: Record<number, any> = {}) {
  return {
    product_bom: {
      findUnique: jest.fn(({ where }: { where: { id: number } }) =>
        Promise.resolve(bomMap[where.id] ?? null),
      ),
      findFirst: jest.fn(({ where }: { where: { product_id: number } }) =>
        Promise.resolve(subBomMap[where.product_id] ?? null),
      ),
    },
  } as any
}

function makeBom(id: number, lines: any[]) {
  return { id, lines }
}

function makeMaterialLine(id: number, matId: number, code: string, name: string, qty: number, scrap = 0, weight?: number) {
  return {
    id,
    material_id: matId,
    sub_product_id: null,
    product_qty: qty,
    product_uom_id: 1,
    scrap_pct: scrap,
    weight_per_unit_kg: weight ?? null,
    sequence: id,
    material: { id: matId, default_code: code, name },
    sub_product: null,
  }
}

function makeSubProductLine(id: number, subId: number, code: string, name: string, qty: number, scrap = 0) {
  return {
    id,
    material_id: null,
    sub_product_id: subId,
    product_qty: qty,
    product_uom_id: 1,
    scrap_pct: scrap,
    weight_per_unit_kg: null,
    sequence: id,
    material: null,
    sub_product: { id: subId, product_code: code, name },
  }
}

describe('BomExplosionService', () => {
  it('single-level BOM — 3 raw material lines', async () => {
    const bom = makeBom(1, [
      makeMaterialLine(1, 10, 'PL6X850', 'Web Plate', 1, 3, 228.18),
      makeMaterialLine(2, 11, 'PL8X175', 'Top Flange', 1, 3, 92.62),
      makeMaterialLine(3, 11, 'PL8X175', 'Bot Flange', 1, 3, 92.62),
    ])
    const svc = new BomExplosionService(makeMockPrisma({ 1: bom }))
    const result = await svc.explode(1)

    expect(result).toHaveLength(3)
    expect(result[0].ref_code).toBe('PL6X850')
    expect(result[0].level).toBe(0)
    expect(result[0].ref_type).toBe('material')
  })

  it('scrap percentage rolls into effective_qty', async () => {
    const bom = makeBom(1, [
      makeMaterialLine(1, 10, 'PL6X850', 'Plate', 10, 5),
    ])
    const svc = new BomExplosionService(makeMockPrisma({ 1: bom }))
    const result = await svc.explode(1)

    // effectiveQty = 1 (parentQty) * 10 (lineQty) * (1 + 5/100) = 10.5
    expect(result[0].effective_qty).toBeCloseTo(10.5)
    expect(result[0].scrap_pct).toBe(5)
  })

  it('weight computed: effective_qty × weight_per_unit_kg', async () => {
    const bom = makeBom(1, [
      makeMaterialLine(1, 10, 'PL8X175', 'Flange', 1, 3, 92.62),
    ])
    const svc = new BomExplosionService(makeMockPrisma({ 1: bom }))
    const result = await svc.explode(1)

    const effQty = 1 * 1 * (1 + 3 / 100)
    expect(result[0].total_weight_kg).toBeCloseTo(effQty * 92.62)
  })

  it('sub-product without active BOM is treated as leaf node', async () => {
    const bom = makeBom(1, [
      makeSubProductLine(1, 99, 'CUS-00099', 'Sub Assembly', 2),
    ])
    // subBomMap is empty → no active BOM for sub_product_id=99
    const svc = new BomExplosionService(makeMockPrisma({ 1: bom }, {}))
    const result = await svc.explode(1)

    expect(result).toHaveLength(1)
    expect(result[0].ref_type).toBe('sub_product')
    expect(result[0].ref_code).toBe('CUS-00099')
  })

  it('2-level BOM recurses into sub-product active BOM', async () => {
    const subBom = makeBom(2, [
      makeMaterialLine(10, 20, 'HR150X150', 'H-Beam', 2, 0),
    ])
    const parentBom = makeBom(1, [
      makeSubProductLine(1, 99, 'CUS-00099', 'Sub Assembly', 3),
    ])
    const svc = new BomExplosionService(
      makeMockPrisma({ 1: parentBom, 2: subBom }, { 99: subBom }),
    )
    const result = await svc.explode(1)

    // Sub-product line qty=3, sub-bom line qty=2 → effective = 3*2=6
    expect(result).toHaveLength(1)
    expect(result[0].ref_code).toBe('HR150X150')
    expect(result[0].level).toBe(1)
    expect(result[0].effective_qty).toBeCloseTo(6)
  })

  it('circular reference throws BadRequestException', async () => {
    const bom = makeBom(1, [
      makeSubProductLine(1, 99, 'CUS-00099', 'Circular', 1),
    ])
    // sub-product 99 maps back to bom id=1 → circular
    const svc = new BomExplosionService(makeMockPrisma({ 1: bom }, { 99: bom }))

    await expect(svc.explode(1)).rejects.toThrow(BadRequestException)
  })

  it('aggregate collapses duplicate materials', () => {
    const lines = [
      { ref_type: 'material' as const, ref_id: 10, ref_code: 'PL8X175', ref_name: 'Flange', level: 0, bom_id: 1, line_id: 1, product_qty: 1, scrap_pct: 0, effective_qty: 2, total_weight_kg: 100 },
      { ref_type: 'material' as const, ref_id: 10, ref_code: 'PL8X175', ref_name: 'Flange', level: 1, bom_id: 2, line_id: 2, product_qty: 1, scrap_pct: 0, effective_qty: 3, total_weight_kg: 150 },
    ]
    const svc = new BomExplosionService({} as any)
    const agg = svc.aggregate(lines)

    expect(agg).toHaveLength(1)
    expect(agg[0].total_effective_qty).toBeCloseTo(5)
    expect(agg[0].total_weight_kg).toBeCloseTo(250)
  })
})
