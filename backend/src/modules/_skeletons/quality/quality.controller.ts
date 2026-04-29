// 🟡 SKELETON — Sprint 6 — 🟦 Standard Odoo (quality.point + quality.check)
// Quality check definitions per routing op + actual results per work order — AISC Ch.N + AWS D1.1
import { Controller, Get, Post, Body, Param } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { QualityService } from './quality.service'

@ApiTags('SKELETON · quality (Sprint 6)')
@Controller({ path: 'quality', version: '1' })
export class QualityController {
  constructor(private readonly svc: QualityService) {}

  @Get()
  @ApiOperation({ summary: 'TODO Sprint 6 — list Quality' })
  list() {
    throw new Error('SKELETON: not implemented — see SKELETON.md')
  }

  @Get(':id')
  @ApiOperation({ summary: 'TODO Sprint 6 — get Quality' })
  get(@Param('id') _id: string) {
    throw new Error('SKELETON: not implemented')
  }

  @Post()
  @ApiOperation({ summary: 'TODO Sprint 6 — create Quality' })
  create(@Body() _dto: any) {
    throw new Error('SKELETON: not implemented')
  }
}
