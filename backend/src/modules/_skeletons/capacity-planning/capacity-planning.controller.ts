// 🟡 SKELETON — Sprint 7 — 🟨 Hybrid (Siemens Opcenter APS)
// Forward-looking capacity buckets per WC × week/month: available vs committed vs reserved
import { Controller, Get, Post, Body, Param } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { CapacityPlanningService } from './capacity-planning.service'

@ApiTags('SKELETON · capacity-planning (Sprint 7)')
@Controller({ path: 'capacity-planning', version: '1' })
export class CapacityPlanningController {
  constructor(private readonly svc: CapacityPlanningService) {}

  @Get()
  @ApiOperation({ summary: 'TODO Sprint 7 — list CapacityPlanning' })
  list() {
    throw new Error('SKELETON: not implemented — see SKELETON.md')
  }

  @Get(':id')
  @ApiOperation({ summary: 'TODO Sprint 7 — get CapacityPlanning' })
  get(@Param('id') _id: string) {
    throw new Error('SKELETON: not implemented')
  }

  @Post()
  @ApiOperation({ summary: 'TODO Sprint 7 — create CapacityPlanning' })
  create(@Body() _dto: any) {
    throw new Error('SKELETON: not implemented')
  }
}
