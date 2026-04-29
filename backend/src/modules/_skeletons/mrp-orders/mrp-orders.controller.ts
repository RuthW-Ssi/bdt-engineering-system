// 🟡 SKELETON — Sprint 5 — 🟦 Standard Odoo (mrp.production + mrp.workorder + stock.production.lot)
// Manufacturing Order + Work Order + Serial Number — replaces MO and SN sheets in process routing.xlsx
import { Controller, Get, Post, Body, Param } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { MrpOrdersService } from './mrp-orders.service'

@ApiTags('SKELETON · mrp-orders (Sprint 5)')
@Controller({ path: 'mrp-orders', version: '1' })
export class MrpOrdersController {
  constructor(private readonly svc: MrpOrdersService) {}

  @Get()
  @ApiOperation({ summary: 'TODO Sprint 5 — list MrpOrders' })
  list() {
    throw new Error('SKELETON: not implemented — see SKELETON.md')
  }

  @Get(':id')
  @ApiOperation({ summary: 'TODO Sprint 5 — get MrpOrders' })
  get(@Param('id') _id: string) {
    throw new Error('SKELETON: not implemented')
  }

  @Post()
  @ApiOperation({ summary: 'TODO Sprint 5 — create MrpOrders' })
  create(@Body() _dto: any) {
    throw new Error('SKELETON: not implemented')
  }
}
