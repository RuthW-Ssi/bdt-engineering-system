import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { MailMessageService } from '../../mail/mail-message.service'

export interface UpsertOverrideDto {
  override_per_minute?: number | null
  override_std_measure?: number | null
  override_manpower?: number | null
  override_workcenter_id?: number | null
  reason?: string
  eco_id?: number
}

@Injectable()
export class OverrideService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailMessageService,
  ) {}

  async listOverrides(productId: number) {
    return this.prisma.product_routing_override.findMany({
      where: { product_id: productId },
      include: { activity_template: { select: { id: true, op_code: true, description: true } } },
      orderBy: { id: 'asc' },
    })
  }

  async upsertOverride(productId: number, activityTemplateId: number, dto: UpsertOverrideDto, userId: number) {
    // ⏳ Sprint 5 ECO gate stub — hasConfirmedMO always false for now
    console.warn('[ECO_STUB] hasConfirmedMO check skipped — Sprint 5')

    const actTpl = await this.prisma.routing_activity_template.findUnique({ where: { id: activityTemplateId } })
    if (!actTpl) throw new NotFoundException(`Activity template ${activityTemplateId} not found`)

    const override = await this.prisma.product_routing_override.upsert({
      where: { product_id_activity_template_id: { product_id: productId, activity_template_id: activityTemplateId } },
      create: {
        product_id: productId,
        activity_template_id: activityTemplateId,
        override_per_minute: dto.override_per_minute,
        override_std_measure: dto.override_std_measure,
        override_manpower: dto.override_manpower,
        override_workcenter_id: dto.override_workcenter_id,
        reason: dto.reason,
        eco_id: dto.eco_id,
        create_uid: userId,
        write_uid: userId,
      },
      update: {
        override_per_minute: dto.override_per_minute,
        override_std_measure: dto.override_std_measure,
        override_manpower: dto.override_manpower,
        override_workcenter_id: dto.override_workcenter_id,
        reason: dto.reason,
        eco_id: dto.eco_id,
        write_uid: userId,
        write_date: new Date(),
      },
    })

    await this.mail.log({
      model: 'product', res_id: productId, author_id: userId,
      message_type: 'audit', subject: `Routing override upserted: activity ${activityTemplateId}`,
    })

    return override
  }

  async removeOverride(productId: number, activityTemplateId: number, userId: number): Promise<void> {
    const existing = await this.prisma.product_routing_override.findUnique({
      where: { product_id_activity_template_id: { product_id: productId, activity_template_id: activityTemplateId } },
    })
    if (!existing) throw new NotFoundException(`Override for activity ${activityTemplateId} not found`)

    await this.prisma.product_routing_override.delete({
      where: { product_id_activity_template_id: { product_id: productId, activity_template_id: activityTemplateId } },
    })

    await this.mail.log({
      model: 'product', res_id: productId, author_id: userId,
      message_type: 'audit', subject: `Routing override removed: activity ${activityTemplateId}`,
    })
  }
}
