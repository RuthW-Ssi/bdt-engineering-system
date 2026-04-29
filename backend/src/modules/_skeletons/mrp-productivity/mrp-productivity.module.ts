// 🟡 SKELETON — Sprint 5 — 🟦 Standard Odoo (mrp.workcenter.productivity)
// Activate by: (1) move into ../../modules/mrp-productivity, (2) add to AppModule, (3) replace stubs
import { Module } from '@nestjs/common'
import { MrpProductivityController } from './mrp-productivity.controller'
import { MrpProductivityService } from './mrp-productivity.service'

@Module({
  controllers: [MrpProductivityController],
  providers: [MrpProductivityService],
  exports: [MrpProductivityService],
})
export class MrpProductivityModule {}
