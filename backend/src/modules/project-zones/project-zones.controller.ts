import {
  Controller, Get, Post, Patch, Body, Param, ParseIntPipe,
} from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { ProjectZonesService } from './project-zones.service'
import { CreateZoneDto } from './dto/create-zone.dto'
import { ReorderZonesDto } from './dto/reorder-zones.dto'

@ApiTags('project-zones')
@Controller('projects/:projectId/zones')
export class ProjectZonesController {
  constructor(private readonly svc: ProjectZonesService) {}

  @Get()
  @ApiOperation({ summary: 'List zones for a project' })
  findAll(@Param('projectId', ParseIntPipe) projectId: number) {
    return this.svc.findAll(projectId)
  }

  @Post()
  @ApiOperation({ summary: 'Create zone in project' })
  create(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: CreateZoneDto,
  ) {
    return this.svc.create(projectId, dto)
  }

  @Patch(':zoneId')
  @ApiOperation({ summary: 'Update zone' })
  update(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('zoneId', ParseIntPipe) zoneId: number,
    @Body() dto: Partial<CreateZoneDto>,
  ) {
    return this.svc.update(projectId, zoneId, dto)
  }

  @Patch('reorder')
  @ApiOperation({ summary: 'Reorder zones (erection sequence)' })
  reorder(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: ReorderZonesDto,
  ) {
    return this.svc.reorder(projectId, dto)
  }
}
