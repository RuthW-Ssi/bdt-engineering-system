import { Module } from '@nestjs/common'
import { CuttingPlanController } from './cutting-plan.controller'
import { CuttingPlanService } from './cutting-plan.service'
import { CuttingPlanApiClient } from './cutting-plan-api.client'
import { FileStorageModule } from '../file-storage/file-storage.module'

@Module({
  imports: [FileStorageModule], // plate files live in storage (2026-11-06)
  controllers: [CuttingPlanController],
  providers: [CuttingPlanService, CuttingPlanApiClient],
})
export class CuttingPlanModule {}
