import {
  Controller, Get, Post, Patch, Body, Param, ParseIntPipe, UseGuards,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { ProjectZonesService } from './project-zones.service'
import { CreateZoneDto } from './dto/create-zone.dto'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { PermissionGuard } from '../../common/guards/permission.guard'
import { RequiresPermission } from '../../common/decorators/permission.decorator'

@ApiTags('project-zones')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('projects/:projectId/zones')
export class ProjectZonesController {
  constructor(private readonly svc: ProjectZonesService) {}

  @Get()
  @RequiresPermission('project-zones', 'view')
  @ApiOperation({ summary: 'List zones for a project' })
  findAll(@Param('projectId', ParseIntPipe) projectId: number) {
    return this.svc.findAll(projectId)
  }

  @Post()
  @RequiresPermission('project-zones', 'create')
  @ApiOperation({ summary: 'Create zone in project' })
  create(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: CreateZoneDto,
  ) {
    return this.svc.create(projectId, dto)
  }

  @Patch(':zoneId')
  @RequiresPermission('project-zones', 'update')
  @ApiOperation({ summary: 'Update zone' })
  update(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('zoneId', ParseIntPipe) zoneId: number,
    @Body() dto: Partial<CreateZoneDto>,
  ) {
    return this.svc.update(projectId, zoneId, dto)
  }
}
