import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { JwtPayload } from '../auth/auth.service'
import {
  OperationTemplateService,
  CreateOperationTemplateDto,
  UpdateOperationTemplateDto,
} from './services/operation-template.service'

@ApiTags('OperationTemplates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('operation-templates')
export class OperationTemplatesController {
  constructor(private readonly svc: OperationTemplateService) {}

  @Get()
  @ApiOperation({ summary: 'List operation templates (operation library)' })
  findAll(@Query('search') search?: string) {
    return this.svc.findAll(search)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single operation template with activities' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id)
  }

  @Post()
  @ApiOperation({ summary: 'Create operation template (saved as draft)' })
  create(@Body() dto: CreateOperationTemplateDto, @CurrentUser() user: JwtPayload) {
    return this.svc.create(dto, user.sub)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update operation template (header + activities replace)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOperationTemplateDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.update(id, dto, user.sub)
  }

  @Patch(':id/publish')
  @ApiOperation({ summary: 'Publish operation template (draft → active)' })
  publish(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.svc.publish(id, user.sub)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete operation template' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id)
  }
}
