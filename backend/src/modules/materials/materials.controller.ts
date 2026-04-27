import {
  Controller, Get, Post, Patch, Body, Param, Query, Headers,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiSecurity, ApiParam } from '@nestjs/swagger'
import { MaterialsService } from './materials.service'
import { CreateMaterialDto } from './dto/create-material.dto'
import { UpdateMaterialDto } from './dto/update-material.dto'
import { QueryMaterialDto } from './dto/query-material.dto'
import { IdentityService } from '../identity/identity.service'

@ApiTags('materials')
@ApiSecurity('x-user-id')
@Controller('materials')
export class MaterialsController {
  constructor(
    private readonly svc: MaterialsService,
    private readonly identity: IdentityService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Register new material (state=draft)' })
  async create(
    @Body() dto: CreateMaterialDto,
    @Headers('x-user-id') xUserId: string,
  ) {
    const userId = await this.identity.resolveUser(xUserId)
    return this.svc.create(dto, userId)
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
  async update(
    @Param('default_code') code: string,
    @Body() dto: UpdateMaterialDto,
    @Headers('x-user-id') xUserId: string,
  ) {
    const userId = await this.identity.resolveUser(xUserId)
    return this.svc.update(code, dto, userId)
  }

  @Post(':default_code/action_submit')
  @ApiOperation({ summary: 'Submit for approval: draft → to_approve' })
  async actionSubmit(
    @Param('default_code') code: string,
    @Headers('x-user-id') xUserId: string,
  ) {
    const userId = await this.identity.resolveUser(xUserId)
    return this.svc.doAction(code, 'action_submit', userId)
  }

  @Post(':default_code/action_confirm')
  @ApiOperation({ summary: 'Confirm (Reviewer): to_approve → confirmed' })
  async actionConfirm(
    @Param('default_code') code: string,
    @Headers('x-user-id') xUserId: string,
  ) {
    const userId = await this.identity.resolveUser(xUserId)
    return this.svc.doAction(code, 'action_confirm', userId)
  }

  @Post(':default_code/action_cancel')
  @ApiOperation({ summary: 'Cancel material' })
  async actionCancel(
    @Param('default_code') code: string,
    @Headers('x-user-id') xUserId: string,
  ) {
    const userId = await this.identity.resolveUser(xUserId)
    return this.svc.doAction(code, 'action_cancel', userId)
  }

  @Post(':default_code/action_assign_runno')
  @ApiOperation({ summary: 'Warehouse: assign permanent 10-digit run number' })
  async actionAssignRunno(
    @Param('default_code') code: string,
    @Headers('x-user-id') xUserId: string,
  ) {
    const userId = await this.identity.resolveUser(xUserId)
    return this.svc.assignRunNumber(code, userId)
  }

  @Get(':default_code/messages')
  @ApiOperation({ summary: 'Get audit log thread (mail_message)' })
  getMessages(@Param('default_code') code: string) {
    return this.svc.getMessages(code)
  }
}
