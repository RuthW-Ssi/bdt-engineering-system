import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import { MoStatus } from '@prisma/client'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { JwtPayload } from '../auth/auth.service'
import { ManufacturingOrderService } from './manufacturing-orders.service'
import { CreateMoDto } from './dto/create-mo.dto'
import { UpdateMoDto } from './dto/update-mo.dto'
import { ChangeStatusDto } from './dto/change-status.dto'

@ApiTags('Manufacturing Orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('mo')
export class ManufacturingOrderController {
  constructor(private readonly svc: ManufacturingOrderService) {}

  @Get()
  @ApiOperation({ summary: 'List MOs · filter status|mark_prefix|project · search mo_code' })
  @ApiQuery({ name: 'status', required: false, enum: ['DRAFT', 'CONFIRMED', 'IN_PROGRESS', 'DONE', 'CANCELLED'] })
  @ApiQuery({ name: 'mark_prefix', required: false })
  @ApiQuery({ name: 'project_id', required: false })
  @ApiQuery({ name: 'search', required: false })
  findAll(
    @Query('status') status?: MoStatus,
    @Query('mark_prefix') mark_prefix?: string,
    @Query('project_id') project_id?: string,
    @Query('search') search?: string,
  ) {
    return this.svc.findAll({
      status: status || undefined,
      mark_prefix: mark_prefix || undefined,
      project_id: project_id ? Number(project_id) : undefined,
      search: search || undefined,
    })
  }

  @Get(':id')
  @ApiOperation({ summary: 'MO detail + derived projects/customers (P20)' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id)
  }

  @Get(':id/assemblies')
  @ApiOperation({ summary: 'Assembly lines + total/remaining + allocation breakdown' })
  getAssemblies(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getAssemblies(id)
  }

  @Get(':id/parts')
  @ApiOperation({ summary: 'Aggregated parts (bom_part) across all assemblies in the MO' })
  getParts(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getParts(id)
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'MO-level status history' })
  getHistory(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getHistory(id)
  }

  @Get(':id/consume-summary')
  @ApiOperation({ summary: 'Planned material totals for all WOs in this MO' })
  getConsumeSummary(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getConsumeSummary(id)
  }

  @Post()
  @ApiOperation({ summary: 'Create DRAFT MO · snapshot routing ops · validate qty (P13)' })
  create(@Body() dto: CreateMoDto, @CurrentUser() user: JwtPayload) {
    return this.svc.create(dto, user.sub, user.login)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit DRAFT MO (409 otherwise)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMoDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.update(id, dto, user.sub)
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Change status + reason → history' })
  changeStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.changeStatus(id, dto, user.sub, user.login)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Cancel MO (DRAFT/CONFIRMED only · returns qty · P15)' })
  cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.svc.cancel(id, user.sub, user.login)
  }

}
