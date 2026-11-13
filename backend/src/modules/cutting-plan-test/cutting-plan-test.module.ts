import { Module } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { CuttingPlanTestController } from './cutting-plan-test.controller'
import { CuttingPlanTestService } from './cutting-plan-test.service'
import { BomSourceService } from './bom-source'
import { EndCutService } from './end-cuts'

// CP-Shape-Test (2026-11-11): kept apart from the Plate / Shape cutting plan module on purpose; no DB.
@Module({ controllers: [CuttingPlanTestController], providers: [CuttingPlanTestService, BomSourceService, { provide: EndCutService, useFactory: (p: PrismaService) => new EndCutService(p), inject: [PrismaService] }] })
export class CuttingPlanTestModule {}
