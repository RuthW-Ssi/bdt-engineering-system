import { Module } from '@nestjs/common'
import { MailModule } from '../mail/mail.module'
import { ManufacturingOrderController } from './manufacturing-orders.controller'
import { ManufacturingOrderService } from './manufacturing-orders.service'
import { MoCodeGenerator } from './mo-code.generator'
import { MoAllocationService } from './mo-allocation.service'

@Module({
  imports: [MailModule],
  controllers: [ManufacturingOrderController],
  providers: [ManufacturingOrderService, MoCodeGenerator, MoAllocationService],
  exports: [ManufacturingOrderService, MoAllocationService],
})
export class ManufacturingOrdersModule {}
