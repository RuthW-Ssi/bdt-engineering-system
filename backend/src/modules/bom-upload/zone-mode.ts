import { BadRequestException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import type { PrismaService } from '../../prisma/prisma.service'

// One upload type per zone for its whole life (2026-11-25, Tao): the type of
// its first Full shop or BOM-page pre-shop. MO pre-shop (revision 0) never counts.

export type UploadMode = 'combined' | 'separate'
type Db = Pick<PrismaService, 'bom_dispatch'> | Prisma.TransactionClient
type Scope = { projectId: number; zoneId: number; subZoneId: number | null }

export const ZONE_MODE_MISMATCH = (zone: UploadMode) =>
  `Zone นี้เป็นแบบ ${zone === 'combined' ? 'Combined' : 'Separate MAIN + ACC'} — เปลี่ยนแบบกลางทางไม่ได้`

/** Type of the zone's latest Full shop or BOM-page pre-shop (status ≠ error); null = no upload yet. */
export async function zoneUploadMode(db: Db, scope: Scope): Promise<UploadMode | null> {
  const d = await db.bom_dispatch.findFirst({
    where: {
      project_id: scope.projectId, zone_id: scope.zoneId, sub_zone_id: scope.subZoneId, status: { not: 'error' },
      OR: [{ source: 'BOM_UPLOAD' }, { source: 'PRE_SHOP', revision: { gte: 1 } }],
    },
    orderBy: { id: 'desc' },
    select: { upload_mode: true },
  })
  const m = d?.upload_mode
  return m === 'combined' || m === 'separate' ? m : null
}

/** Throws BadRequestException when `mode` differs from the zone's type. */
export async function assertZoneMode(db: Db, scope: Scope, mode: UploadMode): Promise<void> {
  const zone = await zoneUploadMode(db, scope)
  if (zone && zone !== mode) throw new BadRequestException(ZONE_MODE_MISMATCH(zone))
}
