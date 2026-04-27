import { Controller, Get, Query } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger'
import { MarkPrefixService } from './mark-prefix.service'

@ApiTags('mark-prefixes')
@Controller('mark-prefixes')
export class MarkPrefixController {
  constructor(private readonly svc: MarkPrefixService) {}

  @Get()
  @ApiOperation({ summary: 'List mark prefixes (for dropdown)' })
  @ApiQuery({ name: 'category', required: false, enum: ['assembly', 'member', 'other', 'sub_component', 'plate_part'] })
  findAll(
    @Query('category') category?: string,
    @Query('active') active?: string,
  ) {
    return this.svc.findAll({
      category,
      active: active !== undefined ? active === 'true' : undefined,
    })
  }
}
