import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { MarkPrefixService } from './mark-prefix.service'

@ApiTags('mark-prefixes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('mark-prefixes')
export class MarkPrefixController {
  constructor(private readonly svc: MarkPrefixService) {}

  @Get('with-pending-count')
  @ApiOperation({ summary: 'T-MO.03 · mark prefixes + pending BOM count (MO form Section 1)' })
  @ApiQuery({ name: 'project_id', required: false })
  @ApiQuery({ name: 'zone_id', required: false })
  withPendingCount(
    @Query('project_id') project_id?: string,
    @Query('zone_id') zone_id?: string,
  ) {
    return this.svc.withPendingCount({
      project_id: project_id ? Number(project_id) : undefined,
      zone_id: zone_id ? Number(zone_id) : undefined,
    })
  }

  @Get()
  @ApiOperation({ summary: 'List mark prefixes (for dropdown)' })
  @ApiQuery({ name: 'category', required: false, enum: ['main_structure', 'secondary_structure', 'accessory', 'building_component'] })
  findAll(
    @Query('category') category?: string,
    @Query('active') active?: string,
  ) {
    return this.svc.findAll({
      category,
      active: active !== undefined ? active === 'true' : undefined,
    })
  }
}
