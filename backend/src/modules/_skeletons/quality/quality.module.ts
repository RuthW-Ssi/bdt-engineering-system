// 🟡 SKELETON — Sprint 6 — 🟦 Standard Odoo (quality.point + quality.check)
// Activate by: (1) move into ../../modules/quality, (2) add to AppModule, (3) replace stubs
import { Module } from '@nestjs/common'
import { QualityController } from './quality.controller'
import { QualityService } from './quality.service'

@Module({
  controllers: [QualityController],
  providers: [QualityService],
  exports: [QualityService],
})
export class QualityModule {}
