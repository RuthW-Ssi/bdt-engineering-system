// 🟡 SKELETON — Sprint 6 — 🟦 Standard Odoo (maintenance.equipment + maintenance.request)
// Activate by: (1) move into ../../modules/maintenance, (2) add to AppModule, (3) replace stubs
import { Module } from '@nestjs/common'
import { MaintenanceController } from './maintenance.controller'
import { MaintenanceService } from './maintenance.service'

@Module({
  controllers: [MaintenanceController],
  providers: [MaintenanceService],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}
