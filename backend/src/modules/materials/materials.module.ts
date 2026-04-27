import { Module } from '@nestjs/common'
import { MaterialsService } from './materials.service'
import { MaterialsController } from './materials.controller'
import { PartCodeGenerator } from './part-code.generator'
import { DuplicateDetectorService } from './validators/duplicate-detector.service'
import { MailModule } from '../mail/mail.module'
import { MasterDataModule } from '../master-data/master-data.module'
import { IdentityModule } from '../identity/identity.module'

@Module({
  imports: [MailModule, MasterDataModule, IdentityModule],
  controllers: [MaterialsController],
  providers: [MaterialsService, PartCodeGenerator, DuplicateDetectorService],
  exports: [MaterialsService],
})
export class MaterialsModule {}
