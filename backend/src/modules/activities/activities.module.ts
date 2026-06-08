import { Module } from '@nestjs/common'
import { ActivitiesService } from './activities.service'
import { ActivitiesController } from './activities.controller'
import { ActivityCodeGenerator } from './activity-code.generator'

@Module({
  controllers: [ActivitiesController],
  providers: [ActivitiesService, ActivityCodeGenerator],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
