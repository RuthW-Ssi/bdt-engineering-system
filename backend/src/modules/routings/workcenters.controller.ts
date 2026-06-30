import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiOperation, ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { WorkcenterService } from './services/workcenter.service'
import { CreateWorkcenterDto } from './dto/create-workcenter.dto'
import { UpdateWorkcenterDto } from './dto/update-workcenter.dto'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { JwtPayload } from '../auth/auth.service'

@ApiTags('Workcenters')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workcenters')
export class WorkcentersController {
  constructor(private readonly wcService: WorkcenterService) {}

  @Get()
  @ApiOperation({ summary: 'List all work centers' })
  findAll(@Query('active') active?: string) {
    const filter = active === undefined ? true : active === 'false' ? false : true
    return this.wcService.findAll(filter)
  }

  @Post()
  @ApiOperation({ summary: 'Create a new work center' })
  create(@Body() dto: CreateWorkcenterDto, @CurrentUser() user: JwtPayload) {
    return this.wcService.create(dto, user.sub)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get work center by id' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.wcService.findOne(id)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update OEE / labor mix / cost rates (audit logged)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWorkcenterDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.wcService.update(id, dto, user.sub)
  }

  @Get(':id/capacity')
  @ApiOperation({ summary: 'Get OEE and capacity snapshot' })
  async capacity(@Param('id', ParseIntPipe) id: number) {
    const wc = await this.wcService.findOne(id)
    return this.wcService.getCapacity(wc)
  }
}
