import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { PermissionGuard } from '../../common/guards/permission.guard'
import { RequiresPermission } from '../../common/decorators/permission.decorator'
import { ZoneSummaryService } from './services/zone-summary.service'

@ApiTags('zone-summary')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('dispatches/:id')
export class ZoneSummaryController {
  constructor(private readonly svc: ZoneSummaryService) {}

  @Get('zone-summary')
  @RequiresPermission('routings', 'view')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.svc.compute(id)
  }
}
