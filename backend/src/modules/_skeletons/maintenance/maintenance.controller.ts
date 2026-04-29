// 🟡 SKELETON — Sprint 6 — 🟦 Standard Odoo (maintenance.equipment + maintenance.request)
// Equipment register (220 items from machine_equipment sheet) + corrective/preventive/predictive maintenance
import { Controller, Get, Post, Body, Param } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { MaintenanceService } from './maintenance.service'

@ApiTags('SKELETON · maintenance (Sprint 6)')
@Controller({ path: 'maintenance', version: '1' })
export class MaintenanceController {
  constructor(private readonly svc: MaintenanceService) {}

  @Get()
  @ApiOperation({ summary: 'TODO Sprint 6 — list Maintenance' })
  list() {
    throw new Error('SKELETON: not implemented — see SKELETON.md')
  }

  @Get(':id')
  @ApiOperation({ summary: 'TODO Sprint 6 — get Maintenance' })
  get(@Param('id') _id: string) {
    throw new Error('SKELETON: not implemented')
  }

  @Post()
  @ApiOperation({ summary: 'TODO Sprint 6 — create Maintenance' })
  create(@Body() _dto: any) {
    throw new Error('SKELETON: not implemented')
  }
}
