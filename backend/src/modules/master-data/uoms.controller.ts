import { Controller, Get, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { MasterDataService } from './master-data.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'

@ApiTags('master-data')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('uoms')
export class UomsController {
  constructor(private readonly svc: MasterDataService) {}

  @Get()
  @ApiOperation({ summary: 'List all active UoMs' })
  findAll() {
    return this.svc.getUoms()
  }
}
