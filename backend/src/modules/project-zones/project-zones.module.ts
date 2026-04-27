import { Module } from '@nestjs/common'
import { ProjectZonesService } from './project-zones.service'
import { ProjectZonesController } from './project-zones.controller'

@Module({
  controllers: [ProjectZonesController],
  providers: [ProjectZonesService],
  exports: [ProjectZonesService],
})
export class ProjectZonesModule {}
