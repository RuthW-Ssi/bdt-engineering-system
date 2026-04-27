import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

export interface TrackingField {
  field: string
  old_value: unknown
  new_value: unknown
}

export type AuditModel = 'material' | 'product' | 'project'

@Injectable()
export class MailMessageService {
  constructor(private readonly prisma: PrismaService) {}

  async log(opts: {
    model?: AuditModel
    res_id: number
    message_type: 'notification' | 'comment' | 'audit'
    subject?: string
    body?: string
    tracking?: TrackingField[]
    author_id?: number
  }) {
    return this.prisma.mail_message.create({
      data: {
        model: opts.model ?? 'material',
        res_id: opts.res_id,
        message_type: opts.message_type,
        subject: opts.subject,
        body: opts.body,
        tracking: opts.tracking ? (opts.tracking as any) : undefined,
        author_id: opts.author_id,
      },
    })
  }

  async thread(model: AuditModel, res_id: number) {
    return this.prisma.mail_message.findMany({
      where: { model, res_id },
      orderBy: { date: 'asc' },
    })
  }
}
