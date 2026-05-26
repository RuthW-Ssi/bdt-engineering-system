import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common'
import { ApiOperation, ApiBearerAuth, ApiTags, ApiQuery } from '@nestjs/swagger'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { EquipmentResourceService } from './services/equipment-resource.service'
import { CreateEquipmentResourceDto } from './dto/create-equipment-resource.dto'

@ApiTags('Equipment Resources')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('equipment-resources')
export class EquipmentResourcesController {
  constructor(private readonly svc: EquipmentResourceService) {}

  @Get()
  @ApiOperation({ summary: 'List all equipment resources (machine / handling / labor)' })
  @ApiQuery({ name: 'type', required: false, enum: ['machine', 'handling', 'labor', 'tool', 'consumable'] })
  findAll(@Query('type') type?: string) {
    return this.svc.findAll(type)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single equipment resource' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id)
  }

  @Post()
  @ApiOperation({ summary: 'Create equipment resource' })
  create(@Body() dto: CreateEquipmentResourceDto) {
    return this.svc.create(dto)
  }
}
