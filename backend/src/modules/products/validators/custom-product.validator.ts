import { UnprocessableEntityException } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'

export interface CustomProductFields {
  project_id: number
  erection_zone_id?: number | null
  mark_prefix: string
  mark_number: string
  engineer_hours_est?: number | null
}

export async function validateCustomProduct(
  prisma: PrismaService,
  fields: CustomProductFields,
  excludeProductId?: number,
) {
  const errors: string[] = []

  // project_id FK check
  const project = await prisma.project.findUnique({ where: { id: fields.project_id } })
  if (!project) {
    errors.push(`project_id ${fields.project_id} not found`)
  }

  // mark_prefix FK check
  const prefix = await prisma.mark_prefix_master.findUnique({ where: { code: fields.mark_prefix } })
  if (!prefix) {
    errors.push(`mark_prefix '${fields.mark_prefix}' not found in master`)
  }

  // erection_zone_id FK check (if provided)
  if (fields.erection_zone_id) {
    const zone = await prisma.project_zone.findFirst({
      where: { id: fields.erection_zone_id, project_id: fields.project_id },
    })
    if (!zone) {
      errors.push(`erection_zone_id ${fields.erection_zone_id} not found in project ${fields.project_id}`)
    }
  }

  // engineer_hours_est >= 0
  if (fields.engineer_hours_est !== undefined && fields.engineer_hours_est !== null && fields.engineer_hours_est < 0) {
    errors.push('engineer_hours_est must be >= 0')
  }

  if (errors.length) {
    throw new UnprocessableEntityException(errors)
  }

  // Mark uniqueness check within (project, zone, prefix, number)
  const existing = await prisma.products.findFirst({
    where: {
      product_type: 'custom',
      project_id: fields.project_id,
      erection_zone_id: fields.erection_zone_id ?? null,
      mark_prefix: fields.mark_prefix,
      mark_number: fields.mark_number,
      ...(excludeProductId ? { id: { not: excludeProductId } } : {}),
    },
  })
  if (existing) {
    throw new UnprocessableEntityException(
      `Duplicate mark: ${fields.mark_prefix}-${fields.mark_number} already exists in this project/zone (product ${existing.product_code})`,
    )
  }
}
