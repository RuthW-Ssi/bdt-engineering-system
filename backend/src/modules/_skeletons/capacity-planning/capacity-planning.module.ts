// 🟡 SKELETON — Sprint 7 — 🟨 Hybrid (Siemens Opcenter APS)
// Activate by: (1) move into ../../modules/capacity-planning, (2) add to AppModule, (3) replace stubs
import { Module } from '@nestjs/common'
import { CapacityPlanningController } from './capacity-planning.controller'
import { CapacityPlanningService } from './capacity-planning.service'

@Module({
  controllers: [CapacityPlanningController],
  providers: [CapacityPlanningService],
  exports: [CapacityPlanningService],
})
export class CapacityPlanningModule {}
