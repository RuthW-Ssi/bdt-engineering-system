import { Module } from '@nestjs/common'
import { BomsService } from './services/boms.service'
import { BomExplosionService } from './services/bom-explosion.service'
import { BomsController } from './boms.controller'
import { MailModule } from '../mail/mail.module'
import { IdentityModule } from '../identity/identity.module'

@Module({
  imports: [MailModule, IdentityModule],
  controllers: [BomsController],
  providers: [BomsService, BomExplosionService],
  exports: [BomsService],
})
export class BomsModule {}
