import { Module } from '@nestjs/common'
import { DrawingsService } from './services/drawings.service'
import { DrawingsController } from './drawings.controller'
import { MailModule } from '../mail/mail.module'
import { IdentityModule } from '../identity/identity.module'

@Module({
  imports: [MailModule, IdentityModule],
  controllers: [DrawingsController],
  providers: [DrawingsService],
  exports: [DrawingsService],
})
export class DrawingsModule {}
