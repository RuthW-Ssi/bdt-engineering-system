import { Controller, Get } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { MasterDataService } from './master-data.service'

@ApiTags('master-data')
@Controller('uoms')
export class UomsController {
  constructor(private readonly svc: MasterDataService) {}

  @Get()
  @ApiOperation({ summary: 'List all active UoMs' })
  findAll() {
    return this.svc.getUoms()
  }
}
