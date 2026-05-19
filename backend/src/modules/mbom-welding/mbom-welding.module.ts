import { Module } from '@nestjs/common'
import { MbomWeldingController } from './mbom-welding.controller'
import { WeldingConfigService } from './welding-config.service'
import { WeldingCalculatorService } from './welding-calculator.service'

@Module({
  controllers: [MbomWeldingController],
  providers: [WeldingConfigService, WeldingCalculatorService],
})
export class MbomWeldingModule {}
