import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseGuards, ParseIntPipe, HttpCode, HttpStatus,
} from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { JwtPayload } from '../auth/auth.service'
import { ActivitiesService } from './activities.service'
import { CreateActivityDto } from './dto/create-activity.dto'
import { UpdateActivityDto } from './dto/update-activity.dto'
import { QueryActivityDto } from './dto/query-activity.dto'

@ApiTags('activities')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('activities')
export class ActivitiesController {
  constructor(private readonly svc: ActivitiesService) {}

  @Get('routing-formula-params')
  @ApiOperation({ summary: 'List routing_formula_param entries for duration formula picker' })
  listRoutingFormulaParams() {
    return this.svc.listRoutingFormulaParams()
  }

  @Get()
  @ApiOperation({ summary: 'List activities with optional filters' })
  findAll(@Query() query: QueryActivityDto) {
    return this.svc.findAll(query)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get activity by id' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id)
  }

  @Post()
  @ApiOperation({ summary: 'Create activity (auto-assigns ACT-XXXXX code)' })
  create(@Body() dto: CreateActivityDto, @CurrentUser() user: JwtPayload) {
    return this.svc.create(dto, user.sub)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update activity (consumes[] replaces, not appends)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateActivityDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.update(id, dto, user.sub)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Hard-delete activity (cascades to activity_consume)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id)
  }
}
