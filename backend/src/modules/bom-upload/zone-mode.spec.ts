import { BadRequestException } from '@nestjs/common'
import { assertZoneMode, zoneUploadMode, ZONE_MODE_MISMATCH } from './zone-mode'

const scope = { projectId: 1, zoneId: 2, subZoneId: null }
const dbWith = (row: { upload_mode: string } | null) => ({ bom_dispatch: { findFirst: jest.fn().mockResolvedValue(row) } })

describe('zoneUploadMode', () => {
  it('null when the zone has no Full shop and no BOM-page pre-shop', async () => {
    expect(await zoneUploadMode(dbWith(null) as never, scope)).toBeNull()
  })

  it("takes a BOM-page pre-shop's mode", async () => {
    expect(await zoneUploadMode(dbWith({ upload_mode: 'separate' }) as never, scope)).toBe('separate')
  })

  it('ignores MO pre-shop and error dispatches', async () => {
    const db = dbWith(null)
    await zoneUploadMode(db as never, scope)
    const arg = db.bom_dispatch.findFirst.mock.calls[0][0]
    expect(arg.where).toMatchObject({
      project_id: 1, zone_id: 2, sub_zone_id: null, status: { not: 'error' },
      OR: [{ source: 'BOM_UPLOAD' }, { source: 'PRE_SHOP', revision: { gte: 1 } }],
    })
    expect(arg.orderBy).toEqual({ id: 'desc' })
  })
})

describe('assertZoneMode', () => {
  it("throws ZONE_MODE_MISMATCH('combined') for separate on a combined zone", async () => {
    const p = assertZoneMode(dbWith({ upload_mode: 'combined' }) as never, scope, 'separate')
    await expect(p).rejects.toThrow(BadRequestException)
    await expect(assertZoneMode(dbWith({ upload_mode: 'combined' }) as never, scope, 'separate')).rejects.toThrow(ZONE_MODE_MISMATCH('combined'))
  })

  it('passes when the zone has no type yet', async () => {
    await expect(assertZoneMode(dbWith(null) as never, scope, 'separate')).resolves.toBeUndefined()
  })

  it('passes when the type matches', async () => {
    await expect(assertZoneMode(dbWith({ upload_mode: 'separate' }) as never, scope, 'separate')).resolves.toBeUndefined()
  })
})
