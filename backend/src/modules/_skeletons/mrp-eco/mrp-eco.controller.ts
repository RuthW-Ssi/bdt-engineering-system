// 🟡 SKELETON — Sprint 5 — 🟦 Standard Odoo (mrp.eco)
// Engineering Change Order — gates BOM/Routing/Drawing changes after release
import { Controller, Get, Post, Body, Param } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { MrpEcoService } from './mrp-eco.service'

@ApiTags('SKELETON · mrp-eco (Sprint 5)')
@Controller({ path: 'mrp-eco', version: '1' })
export class MrpEcoController {
  constructor(private readonly svc: MrpEcoService) {}

  @Get()
  @ApiOperation({ summary: 'TODO Sprint 5 — list MrpEco' })
  list() {
    throw new Error('SKELETON: not implemented — see SKELETON.md')
  }

  @Get(':id')
  @ApiOperation({ summary: 'TODO Sprint 5 — get MrpEco' })
  get(@Param('id') _id: string) {
    throw new Error('SKELETON: not implemented')
  }

  @Post()
  @ApiOperation({ summary: 'TODO Sprint 5 — create MrpEco' })
  create(@Body() _dto: any) {
    throw new Error('SKELETON: not implemented')
  }
}
