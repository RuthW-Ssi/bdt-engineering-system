import { Module } from '@nestjs/common'
import { BomsService } from './services/boms.service'
import { BomExplosionService } from './services/bom-explosion.service'
import { BomAssembliesService } from './services/bom-assemblies.service'
import { BomsController } from './boms.controller'
import { BomAssembliesController } from './bom-assemblies.controller'
import { MailModule } from '../mail/mail.module'
import { ManufacturingOrdersModule } from '../manufacturing-orders/manufacturing-orders.module'
import { BomUploadModule } from '../bom-upload/bom-upload.module'

@Module({
  imports: [MailModule, ManufacturingOrdersModule, BomUploadModule],
  controllers: [BomsController, BomAssembliesController],
  providers: [BomsService, BomExplosionService, BomAssembliesService],
  exports: [BomsService],
})
export class BomsModule {}
