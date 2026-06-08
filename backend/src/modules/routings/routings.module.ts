import { Module } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module'
import { MailModule } from '../mail/mail.module'
import { RoutingsController } from './routings.controller'
import { WorkcentersController } from './workcenters.controller'
import { RoutingService } from './services/routing.service'
import { WorkcenterService } from './services/workcenter.service'
import { FormulaService } from './services/formula.service'
import { CycleTimeService } from './services/cycle-time.service'
import { StdCostService } from './services/std-cost.service'
import { TemplateBindingService } from './services/template-binding.service'
import { TemplateSimulatorService } from './services/template-simulator.service'
import { OpTypeService } from './services/op-type.service'
import { OperationTemplatesController } from './operation-templates.controller'
import { OperationTemplateService } from './services/operation-template.service'
import { EquipmentResourcesController } from './equipment-resources.controller'
import { EquipmentResourceService } from './services/equipment-resource.service'
import { ZoneSummaryController } from './zone-summary.controller'
import { ZoneSummaryService } from './services/zone-summary.service'

@Module({
  imports: [PrismaModule, MailModule],
  controllers: [RoutingsController, WorkcentersController, OperationTemplatesController, EquipmentResourcesController, ZoneSummaryController],
  providers: [
    RoutingService,
    WorkcenterService,
    OpTypeService,
    FormulaService,
    CycleTimeService,
    StdCostService,
    TemplateBindingService,
    TemplateSimulatorService,
    OperationTemplateService,
    EquipmentResourceService,
    ZoneSummaryService,
  ],
  exports: [RoutingService, FormulaService, CycleTimeService, StdCostService],
})
export class RoutingsModule {}
