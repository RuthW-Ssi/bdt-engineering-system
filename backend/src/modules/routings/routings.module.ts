import { Module } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module'
import { MailModule } from '../mail/mail.module'
import { RoutingsController } from './routings.controller'
import { WorkcentersController } from './workcenters.controller'
import { RoutingService } from './services/routing.service'
import { WorkcenterService } from './services/workcenter.service'
import { ActivityTemplatesService } from './services/activity-templates.service'
import { FormulaService } from './services/formula.service'
import { CycleTimeService } from './services/cycle-time.service'
import { StdCostService } from './services/std-cost.service'
import { TemplateBindingService } from './services/template-binding.service'
import { OverrideService } from './services/override.service'
import { CustomRoutingService } from './services/custom-routing.service'
import { TemplateSimulatorService } from './services/template-simulator.service'
import { BulkOverrideService } from './services/bulk-override.service'
import { RoutingPromotionService } from './services/routing-promotion.service'
import { OpTypeService } from './services/op-type.service'
import { OperationTemplatesController } from './operation-templates.controller'
import { OperationTemplateService } from './services/operation-template.service'
import { EquipmentResourcesController } from './equipment-resources.controller'
import { EquipmentResourceService } from './services/equipment-resource.service'

@Module({
  imports: [PrismaModule, MailModule],
  controllers: [RoutingsController, WorkcentersController, OperationTemplatesController, EquipmentResourcesController],
  providers: [
    RoutingService,
    WorkcenterService,
    OpTypeService,
    ActivityTemplatesService,
    FormulaService,
    CycleTimeService,
    StdCostService,
    TemplateBindingService,
    OverrideService,
    CustomRoutingService,
    TemplateSimulatorService,
    BulkOverrideService,
    RoutingPromotionService,
    OperationTemplateService,
    EquipmentResourceService,
  ],
  exports: [RoutingService, FormulaService, CycleTimeService, StdCostService, OverrideService],
})
export class RoutingsModule {}
