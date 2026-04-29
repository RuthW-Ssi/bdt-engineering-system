import { Module } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module'
import { MailModule } from '../mail/mail.module'
import { IdentityModule } from '../identity/identity.module'
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

@Module({
  imports: [PrismaModule, MailModule, IdentityModule],
  controllers: [RoutingsController, WorkcentersController],
  providers: [
    RoutingService,
    WorkcenterService,
    ActivityTemplatesService,
    FormulaService,
    CycleTimeService,
    StdCostService,
    TemplateBindingService,
    OverrideService,
    CustomRoutingService,
  ],
  exports: [RoutingService, FormulaService, CycleTimeService, StdCostService, OverrideService],
})
export class RoutingsModule {}
