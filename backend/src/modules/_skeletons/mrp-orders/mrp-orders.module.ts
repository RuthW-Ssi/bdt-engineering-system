// 🟡 SKELETON — Sprint 5 — 🟦 Standard Odoo (mrp.production + mrp.workorder + stock.production.lot)
// Activate by: (1) move into ../../modules/mrp-orders, (2) add to AppModule, (3) replace stubs
import { Module } from '@nestjs/common'
import { MrpOrdersController } from './mrp-orders.controller'
import { MrpOrdersService } from './mrp-orders.service'

@Module({
  controllers: [MrpOrdersController],
  providers: [MrpOrdersService],
  exports: [MrpOrdersService],
})
export class MrpOrdersModule {}
