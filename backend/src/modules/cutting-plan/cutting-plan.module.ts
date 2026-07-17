import { Module } from '@nestjs/common'
import { CuttingPlanController } from './cutting-plan.controller'
import { CuttingPlanService } from './cutting-plan.service'
import { CuttingPlanApiClient } from './cutting-plan-api.client'

@Module({
  controllers: [CuttingPlanController],
  providers: [CuttingPlanService, CuttingPlanApiClient],
})
export class CuttingPlanModule {}
