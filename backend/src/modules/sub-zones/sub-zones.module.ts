import { Module } from '@nestjs/common'
import { SubZonesService } from './sub-zones.service'
import { SubZonesController } from './sub-zones.controller'

@Module({
  controllers: [SubZonesController],
  providers: [SubZonesService],
  exports: [SubZonesService],
})
export class SubZonesModule {}
