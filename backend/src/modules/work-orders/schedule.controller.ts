import { Controller, Get, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { ScheduleService } from './schedule.service'

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
}
