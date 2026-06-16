import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { BomAssembliesService } from './services/bom-assemblies.service'

@ApiTags('BOM Assemblies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('bom-assemblies')
export class BomAssembliesController {
  constructor(private readonly svc: BomAssembliesService) {}

  @Get()
  @ApiOperation({
    summary: 'T-MO.04 · assemblies by mark prefix + remaining qty + allocation breakdown',
  })
  @ApiQuery({ name: 'mark_prefix_id', required: false, description: 'mark prefix CODE (P10)' })
  @ApiQuery({ name: 'pending_mo', required: false, description: 'hide fully-allocated (default true · P16)' })
  @ApiQuery({ name: 'group_by', required: false, description: 'csv of project,zone,subzone' })
  byMarkPrefix(
    @Query('mark_prefix_id') mark_prefix_id?: string,
    @Query('pending_mo') pending_mo?: string,
    @Query('group_by') group_by?: string,
  ) {
    return this.svc.byMarkPrefix({
      mark_prefix_id: mark_prefix_id || undefined,
      pending_mo: pending_mo === undefined ? true : pending_mo === 'true',
      group_by,
    })
  }
}
