import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { ZoneSummaryService } from './services/zone-summary.service'

@ApiTags('zone-summary')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dispatches/:id')
export class ZoneSummaryController {
  constructor(private readonly svc: ZoneSummaryService) {}

  @Get('zone-summary')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.svc.compute(id)
  }
}
