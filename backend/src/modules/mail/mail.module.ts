import { Module } from '@nestjs/common'
import { MailMessageService } from './mail-message.service'

@Module({ providers: [MailMessageService], exports: [MailMessageService] })
export class MailModule {}
