// 🟡 SKELETON — Sprint 7 — 🟥 Custom (BDT MES event stream)
// Append-only shop-floor event log — wo_start, qty_report, scrap, downtime — feeds real-time OEE
import { Controller, Get, Post, Body, Param } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { MesEventsService } from './mes-events.service'

@ApiTags('SKELETON · mes-events (Sprint 7)')
@Controller({ path: 'mes-events', version: '1' })
export class MesEventsController {
  constructor(private readonly svc: MesEventsService) {}

  @Get()
  @ApiOperation({ summary: 'TODO Sprint 7 — list MesEvents' })
  list() {
    throw new Error('SKELETON: not implemented — see SKELETON.md')
  }

  @Get(':id')
  @ApiOperation({ summary: 'TODO Sprint 7 — get MesEvents' })
  get(@Param('id') _id: string) {
    throw new Error('SKELETON: not implemented')
  }

  @Post()
  @ApiOperation({ summary: 'TODO Sprint 7 — create MesEvents' })
  create(@Body() _dto: any) {
    throw new Error('SKELETON: not implemented')
  }
}
