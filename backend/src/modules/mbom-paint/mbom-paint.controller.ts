import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { JwtPayload } from '../auth/auth.service'
import { PaintConfigService } from './paint-config.service'
import { PaintCalculatorService } from './paint-calculator.service'
import { SavePaintConfigDto } from './dto/save-paint-config.dto'
import { MbomSummaryDto, PaintConfigResponseDto } from './dto/mbom-response.dto'

@ApiTags('mbom-paint')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dispatches/:id')
export class MbomPaintController {
  constructor(
    private readonly configSvc: PaintConfigService,
    private readonly calcSvc: PaintCalculatorService,
  ) {}

  @Post('paint-config')
  async savePaintConfig(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SavePaintConfigDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<MbomSummaryDto> {
    await this.configSvc.save(id, dto.configs, user.sub)
    await this.calcSvc.compute(id)
    return this.calcSvc.getMbom(id)
  }

  @Get('paint-config')
  getPaintConfig(@Param('id', ParseIntPipe) id: number): Promise<PaintConfigResponseDto> {
    return this.configSvc.getConfig(id)
  }

  @Get('mbom')
  getMbom(@Param('id', ParseIntPipe) id: number): Promise<MbomSummaryDto> {
    return this.calcSvc.getMbom(id)
  }
}
