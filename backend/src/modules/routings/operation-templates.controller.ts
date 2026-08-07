import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { PermissionGuard } from '../../common/guards/permission.guard'
import { RequiresPermission } from '../../common/decorators/permission.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { JwtPayload } from '../auth/auth.service'
import {
  OperationTemplateService,
  CreateOperationTemplateDto,
  UpdateOperationTemplateDto,
} from './services/operation-template.service'

@ApiTags('OperationTemplates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('operation-templates')
export class OperationTemplatesController {
  constructor(private readonly svc: OperationTemplateService) {}

  @Get()
  @RequiresPermission('routings', 'view')
  @ApiOperation({ summary: 'List operation templates (operation library)' })
  findAll(
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.findAll(search, page ? Number(page) : 1, limit ? Number(limit) : 20)
  }

  @Get(':id')
  @RequiresPermission('routings', 'view')
  @ApiOperation({ summary: 'Get single operation template; add ?include=stale_check for stale flags' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query('include') include?: string,
  ) {
    return this.svc.findOne(id, include === 'stale_check')
  }

  @Post(':id/activities/from-library/:activityId')
  @RequiresPermission('routings', 'update')
  @ApiOperation({ summary: 'Snapshot an Activity Library entry into this operation template' })
  addFromLibrary(
    @Param('id', ParseIntPipe) id: number,
    @Param('activityId', ParseIntPipe) activityId: number,
  ) {
    return this.svc.addFromLibrary(id, activityId)
  }

  @Post(':id/activities/:actId/update-from-library')
  @RequiresPermission('routings', 'update')
  @ApiOperation({ summary: 'Re-snapshot activity from its source library entry (full overwrite)' })
  updateFromLibrary(
    @Param('id', ParseIntPipe) id: number,
    @Param('actId', ParseIntPipe) actId: number,
  ) {
    return this.svc.updateFromLibrary(id, actId)
  }

  @Post()
  @RequiresPermission('routings', 'create')
  @ApiOperation({ summary: 'Create operation template (saved as draft)' })
  create(@Body() dto: CreateOperationTemplateDto, @CurrentUser() user: JwtPayload) {
    return this.svc.create(dto, user.sub)
  }

  @Patch(':id')
  @RequiresPermission('routings', 'update')
  @ApiOperation({ summary: 'Update operation template (header + activities replace)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOperationTemplateDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.update(id, dto, user.sub)
  }

  @Patch(':id/publish')
  @RequiresPermission('routings', 'update')
  @ApiOperation({ summary: 'Publish operation template (draft → active)' })
  publish(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.svc.publish(id, user.sub)
  }

  @Delete(':id')
  @RequiresPermission('routings', 'delete')
  @ApiOperation({ summary: 'Delete operation template' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id)
  }
}
