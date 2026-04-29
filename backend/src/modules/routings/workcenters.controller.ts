import { Body, Controller, Get, Headers, Param, ParseIntPipe, Patch } from '@nestjs/common'
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger'
import { IdentityService } from '../identity/identity.service'
import { WorkcenterService } from './services/workcenter.service'
import { UpdateWorkcenterDto } from './dto/update-workcenter.dto'

@ApiTags('Workcenters')
@ApiSecurity('x-user-id')
@Controller('workcenters')
export class WorkcentersController {
  constructor(
    private readonly wcService: WorkcenterService,
    private readonly identity: IdentityService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all work centers' })
  findAll() {
    return this.wcService.findAll()
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get work center by id' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.wcService.findOne(id)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update OEE / labor mix / cost rates (audit logged)' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWorkcenterDto,
    @Headers('x-user-id') xUserId: string,
  ) {
    const uid = await this.identity.resolveUser(xUserId)
    return this.wcService.update(id, dto, uid)
  }

  @Get(':id/capacity')
  @ApiOperation({ summary: 'Get OEE and capacity snapshot' })
  async capacity(@Param('id', ParseIntPipe) id: number) {
    const wc = await this.wcService.findOne(id)
    return this.wcService.getCapacity(wc)
  }
}
