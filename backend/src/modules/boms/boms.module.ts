import { Module } from '@nestjs/common'
import { BomAssembliesService } from './services/bom-assemblies.service'
import { BomAssembliesController } from './bom-assemblies.controller'
import { ManufacturingOrdersModule } from '../manufacturing-orders/manufacturing-orders.module'
import { BomUploadModule } from '../bom-upload/bom-upload.module'

@Module({
  imports: [ManufacturingOrdersModule, BomUploadModule],
  controllers: [BomAssembliesController],
  providers: [BomAssembliesService],
})
export class BomsModule {}
