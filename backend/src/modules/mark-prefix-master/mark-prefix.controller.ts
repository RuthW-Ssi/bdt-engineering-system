import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { MarkPrefixService } from './mark-prefix.service'

@ApiTags('mark-prefixes')
@Controller('mark-prefixes')
export class MarkPrefixController {
  constructor(private readonly svc: MarkPrefixService) {}

  @Get('with-pending-count')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'T-MO.03 · mark prefixes + pending BOM count (MO form Section 1)' })
  withPendingCount() {
    return this.svc.withPendingCount()
  }

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
