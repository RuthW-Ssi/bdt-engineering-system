import { Controller, Get, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { ScheduleService } from './schedule.service'

// Deliberately UNGATED (2026-08-07) — not the real scheduling system, just a
// WO-detail rendering aid (destined to be replaced by data pulled from the
// actual external scheduling system later). Same shape as BIM's
// viewer-token/bom-assemblies: rides along with view access to the parent
// WO/`orders` feature rather than gating as its own permission question. See
// `permission-modules.ts`'s `orders` entry for the full story.
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
