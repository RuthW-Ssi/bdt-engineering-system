import { Module } from '@nestjs/common'
import { MailModule } from '../mail/mail.module'
import { WorkOrdersController } from './work-orders.controller'
import { ScheduleController } from './schedule.controller'
import { WorkOrdersService } from './work-orders.service'
import { ScheduleService } from './schedule.service'
import { SchedulerApiClient } from './scheduler-api.client'
import { WorkOrderAutoCreateService } from './wo-auto-create.service'
import { WoBimMatchService } from './wo-bim-match.service'

/**
 * Sprint 14 · F-WO Work Order execution layer.
 *
 * Dependency direction is one-way: ManufacturingOrdersModule imports THIS module
 * (for the auto-create hook, T-WO.03), so this module must NOT import the MO
 * module — that would create a cycle. WorkOrdersService therefore keeps its own
 * minimal dispatch helpers instead of reusing MoAllocationService.
 * MailModule (audit log for edit-actuals 2026-10-01, scheduler runs 2026-10-03) is a
 * leaf — no cycle. SchedulerApiClient calls the prod-scheduler Cloud Run service (ADR-0015).
 */
@Module({
  imports: [MailModule],
  controllers: [WorkOrdersController, ScheduleController],
  providers: [WorkOrdersService, ScheduleService, SchedulerApiClient, WorkOrderAutoCreateService, WoBimMatchService],
  exports: [WorkOrdersService, WorkOrderAutoCreateService],
})
export class WorkOrdersModule {}
