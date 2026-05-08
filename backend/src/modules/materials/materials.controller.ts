import {
  Controller, Get, Post, Patch, Body, Param, Query, UseGuards,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger'
import { MaterialsService } from './materials.service'
import { CreateMaterialDto } from './dto/create-material.dto'
import { UpdateMaterialDto } from './dto/update-material.dto'
import { QueryMaterialDto } from './dto/query-material.dto'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { JwtPayload } from '../auth/auth.service'

@ApiTags('materials')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('materials')
export class MaterialsController {
  constructor(private readonly svc: MaterialsService) {}

  @Post()
  @ApiOperation({ summary: 'Register new material (state=draft)' })
  create(@Body() dto: CreateMaterialDto, @CurrentUser() user: JwtPayload) {
    return this.svc.create(dto, user.sub)
  }

  @Get()
  @ApiOperation({ summary: 'List materials with filters & pagination' })
  findAll(@Query() query: QueryMaterialDto) {
    return this.svc.findAll(query)
  }

  @Get(':default_code')
  @ApiOperation({ summary: 'Get single material by default_code' })
  @ApiParam({ name: 'default_code', example: 'HR00000001' })
  findOne(@Param('default_code') code: string) {
    return this.svc.findOne(code)
  }

  @Patch(':default_code')
  @ApiOperation({ summary: 'Update material (Odoo write pattern)' })
  update(
    @Param('default_code') code: string,
    @Body() dto: UpdateMaterialDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.update(code, dto, user.sub)
  }

  @Post(':default_code/action_submit')
  @ApiOperation({ summary: 'Submit for approval: draft → to_approve' })
  actionSubmit(@Param('default_code') code: string, @CurrentUser() user: JwtPayload) {
    return this.svc.doAction(code, 'action_submit', user.sub)
  }

  @Post(':default_code/action_confirm')
  @ApiOperation({ summary: 'Confirm (Reviewer): to_approve → confirmed' })
  actionConfirm(@Param('default_code') code: string, @CurrentUser() user: JwtPayload) {
    return this.svc.doAction(code, 'action_confirm', user.sub)
  }

  @Post(':default_code/action_cancel')
  @ApiOperation({ summary: 'Cancel material' })
  actionCancel(@Param('default_code') code: string, @CurrentUser() user: JwtPayload) {
    return this.svc.doAction(code, 'action_cancel', user.sub)
  }

  @Post(':default_code/action_assign_runno')
  @ApiOperation({ summary: 'Warehouse: assign permanent 10-digit run number' })
  actionAssignRunno(@Param('default_code') code: string, @CurrentUser() user: JwtPayload) {
    return this.svc.assignRunNumber(code, user.sub)
  }

  @Get(':default_code/messages')
  @ApiOperation({ summary: 'Get audit log thread (mail_message)' })
  getMessages(@Param('default_code') code: string) {
    return this.svc.getMessages(code)
  }
}
