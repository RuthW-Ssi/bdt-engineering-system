import { Module } from '@nestjs/common'
import { WorkOrdersController } from './work-orders.controller'
import { ScheduleController } from './schedule.controller'
import { WorkOrdersService } from './work-orders.service'
import { ScheduleService } from './schedule.service'
import { WoCodeGenerator } from './wo-code.generator'
import { WorkOrderAutoCreateService } from './wo-auto-create.service'

/**
 * Sprint 14 · F-WO Work Order execution layer.
 *
 * Dependency direction is one-way: ManufacturingOrdersModule imports THIS module
 * (for the auto-create hook, T-WO.03), so this module must NOT import the MO
 * module — that would create a cycle. WorkOrdersService therefore keeps its own
 * minimal dispatch helpers instead of reusing MoAllocationService.
 */
@Module({
  controllers: [WorkOrdersController, ScheduleController],
  providers: [WorkOrdersService, ScheduleService, WoCodeGenerator, WorkOrderAutoCreateService],
  exports: [WorkOrdersService, WorkOrderAutoCreateService],
})
export class WorkOrdersModule {}
