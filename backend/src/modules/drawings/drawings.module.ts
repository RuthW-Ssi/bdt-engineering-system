import { Module } from '@nestjs/common'
import { DrawingsService } from './services/drawings.service'
import { DrawingsController } from './drawings.controller'
import { MailModule } from '../mail/mail.module'

@Module({
  imports: [MailModule],
  controllers: [DrawingsController],
  providers: [DrawingsService],
  exports: [DrawingsService],
})
export class DrawingsModule {}
