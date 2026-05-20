import { Module } from '@nestjs/common'
import { MbomPaintController } from './mbom-paint.controller'
import { PaintConfigService } from './paint-config.service'
import { PaintCalculatorService } from './paint-calculator.service'

@Module({
  controllers: [MbomPaintController],
  providers: [PaintConfigService, PaintCalculatorService],
})
export class MbomPaintModule {}
