import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { JwtPayload } from '../auth/auth.service'
import { WeldingConfigService } from './welding-config.service'
import { WeldingCalculatorService } from './welding-calculator.service'
import { SaveWeldingConfigDto } from './dto/save-welding-config.dto'
import type { WeldingConfigResponseDto, WeldingMbomSummaryDto } from './dto/welding-mbom-response.dto'

@ApiTags('mbom-welding')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dispatches/:id')
export class MbomWeldingController {
  constructor(
    private readonly configSvc: WeldingConfigService,
    private readonly calcSvc: WeldingCalculatorService,
  ) {}

  @Post('welding-config')
  async saveWeldingConfig(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SaveWeldingConfigDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<WeldingMbomSummaryDto> {
    await this.configSvc.save(id, dto.configs, user.sub)
    await this.calcSvc.compute(id)
    return this.calcSvc.getMbom(id)
  }

  @Get('welding-config')
  getWeldingConfig(@Param('id', ParseIntPipe) id: number): Promise<WeldingConfigResponseDto> {
    return this.configSvc.getConfig(id)
  }

  @Get('welding-mbom')
  getWeldingMbom(@Param('id', ParseIntPipe) id: number): Promise<WeldingMbomSummaryDto> {
    return this.calcSvc.getMbom(id)
  }
}
