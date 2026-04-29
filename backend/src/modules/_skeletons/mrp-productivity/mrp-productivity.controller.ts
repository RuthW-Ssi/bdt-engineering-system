// 🟡 SKELETON — Sprint 5 — 🟦 Standard Odoo (mrp.workcenter.productivity)
// Downtime/uptime block log — source for actual OEE Availability%
import { Controller, Get, Post, Body, Param } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { MrpProductivityService } from './mrp-productivity.service'

@ApiTags('SKELETON · mrp-productivity (Sprint 5)')
@Controller({ path: 'mrp-productivity', version: '1' })
export class MrpProductivityController {
  constructor(private readonly svc: MrpProductivityService) {}

  @Get()
  @ApiOperation({ summary: 'TODO Sprint 5 — list MrpProductivity' })
  list() {
    throw new Error('SKELETON: not implemented — see SKELETON.md')
  }

  @Get(':id')
  @ApiOperation({ summary: 'TODO Sprint 5 — get MrpProductivity' })
  get(@Param('id') _id: string) {
    throw new Error('SKELETON: not implemented')
  }

  @Post()
  @ApiOperation({ summary: 'TODO Sprint 5 — create MrpProductivity' })
  create(@Body() _dto: any) {
    throw new Error('SKELETON: not implemented')
  }
}
