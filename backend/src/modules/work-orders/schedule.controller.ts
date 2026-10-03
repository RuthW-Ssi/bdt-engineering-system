import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { PermissionGuard } from '../../common/guards/permission.guard'
import { RequiresPermission } from '../../common/decorators/permission.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { JwtPayload } from '../auth/auth.service'
import { ScheduleService } from './schedule.service'
import { RunScheduleDto } from './dto/run-schedule.dto'

// Production schedule (ADR-0015). The GET reads stay deliberately UNGATED
// (2026-08-07) — they ride along with view access to the parent WO/`orders`
// feature, same shape as BIM's viewer-token/bom-assemblies (see
// `permission-modules.ts`'s `orders` entry). The POST writes — triggering the
// `prod-scheduler` Cloud Run service and activating a version — are gated per
// method with `orders:update` (ADR-0015 D2).
@ApiTags('Schedule')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('schedule')
export class ScheduleController {
  constructor(private readonly svc: ScheduleService) {}

  @Get('versions')
  @ApiOperation({ summary: 'List all prod_schedule_version (newest first)' })
  listVersions() {
    return this.svc.listVersions()
  }

  @Get('versions/active')
  @ApiOperation({ summary: 'Active schedule version (404 if none)' })
  activeVersion() {
    return this.svc.activeVersion()
  }

  @Post('runs')
  @UseGuards(PermissionGuard)
  @RequiresPermission('orders', 'update')
  @ApiOperation({ summary: 'Run the prod-scheduler (persist) · 409 run_in_progress · 422 data_not_ready · 504 timeout' })
  run(@Body() dto: RunScheduleDto, @CurrentUser() user: JwtPayload) {
    return this.svc.run(dto, user)
  }

  @Post('versions/:id/activate')
  @UseGuards(PermissionGuard)
  @RequiresPermission('orders', 'update')
  @ApiOperation({ summary: 'Make this prod_schedule_version the single active one · 404 missing · 409 run_in_progress' })
  activate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.svc.activate(id, user)
  }
}
