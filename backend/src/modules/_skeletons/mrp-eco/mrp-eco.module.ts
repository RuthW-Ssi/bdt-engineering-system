// 🟡 SKELETON — Sprint 5 — 🟦 Standard Odoo (mrp.eco)
// Activate by: (1) move into ../../modules/mrp-eco, (2) add to AppModule, (3) replace stubs
import { Module } from '@nestjs/common'
import { MrpEcoController } from './mrp-eco.controller'
import { MrpEcoService } from './mrp-eco.service'

@Module({
  controllers: [MrpEcoController],
  providers: [MrpEcoService],
  exports: [MrpEcoService],
})
export class MrpEcoModule {}
