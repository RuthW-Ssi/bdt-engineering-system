import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, Headers, ParseIntPipe,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiSecurity } from '@nestjs/swagger'
import { BomsService } from './services/boms.service'
import { CreateBomDto } from './dto/create-bom.dto'
import { UpdateBomDto } from './dto/update-bom.dto'
import { AddBomLineDto } from './dto/add-bom-line.dto'
import { QueryBomDto } from './dto/query-bom.dto'
import { IdentityService } from '../identity/identity.service'

@ApiTags('boms')
@ApiSecurity('x-user-id')
@Controller()
export class BomsController {
  constructor(
    private readonly svc: BomsService,
    private readonly identity: IdentityService,
  ) {}

  @Post('products/:product_code/boms')
  @ApiOperation({ summary: 'Create a BOM for a product' })
  async create(
    @Param('product_code') productCode: string,
    @Body() dto: CreateBomDto,
    @Headers('x-user-id') xUserId: string,
  ) {
    const uid = await this.identity.resolveUser(xUserId)
    return this.svc.create({ ...dto, product_code: productCode }, uid)
  }

  @Get('products/:product_code/boms')
  @ApiOperation({ summary: 'List all BOMs for a product' })
  findAllForProduct(
    @Param('product_code') productCode: string,
    @Query() query: QueryBomDto,
  ) {
    return this.svc.findAllForProduct(productCode, query)
  }

  @Get('boms/:id')
  @ApiOperation({ summary: 'Get BOM detail with lines' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id)
  }

  @Get('boms/:id/explode')
  @ApiOperation({ summary: 'Explode BOM recursively' })
  explode(
    @Param('id', ParseIntPipe) id: number,
    @Query('qty') qty?: string,
  ) {
    return this.svc.explode(id, qty ? parseFloat(qty) : 1)
  }

  @Get('boms/:id/aggregate')
  @ApiOperation({ summary: 'Aggregate exploded BOM by material/sub-product' })
  aggregate(
    @Param('id', ParseIntPipe) id: number,
    @Query('qty') qty?: string,
  ) {
    return this.svc.aggregate(id, qty ? parseFloat(qty) : 1)
  }

  @Patch('boms/:id')
  @ApiOperation({ summary: 'Update BOM meta (draft state only)' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBomDto,
    @Headers('x-user-id') xUserId: string,
  ) {
    const uid = await this.identity.resolveUser(xUserId)
    return this.svc.update(id, dto, uid)
  }

  @Delete('boms/:id')
  @ApiOperation({ summary: 'Soft-delete BOM (draft → obsolete)' })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-user-id') xUserId: string,
  ) {
    const uid = await this.identity.resolveUser(xUserId)
    return this.svc.remove(id, uid)
  }

  @Post('boms/:id/lines')
  @ApiOperation({ summary: 'Add a line to a BOM' })
  async addLine(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddBomLineDto,
    @Headers('x-user-id') xUserId: string,
  ) {
    const uid = await this.identity.resolveUser(xUserId)
    return this.svc.addLine(id, dto, uid)
  }

  @Patch('boms/:id/lines/:line_id')
  @ApiOperation({ summary: 'Update a BOM line' })
  async updateLine(
    @Param('id', ParseIntPipe) id: number,
    @Param('line_id', ParseIntPipe) lineId: number,
    @Body() dto: Partial<AddBomLineDto>,
    @Headers('x-user-id') xUserId: string,
  ) {
    const uid = await this.identity.resolveUser(xUserId)
    return this.svc.updateLine(id, lineId, dto, uid)
  }

  @Delete('boms/:id/lines/:line_id')
  @ApiOperation({ summary: 'Delete a BOM line' })
  async removeLine(
    @Param('id', ParseIntPipe) id: number,
    @Param('line_id', ParseIntPipe) lineId: number,
    @Headers('x-user-id') xUserId: string,
  ) {
    const uid = await this.identity.resolveUser(xUserId)
    return this.svc.removeLine(id, lineId, uid)
  }

  @Post('boms/:id/action_activate')
  @ApiOperation({ summary: 'Activate BOM: draft → active' })
  async activate(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-user-id') xUserId: string,
  ) {
    const uid = await this.identity.resolveUser(xUserId)
    return this.svc.activate(id, uid)
  }

  @Post('boms/:id/action_obsolete')
  @ApiOperation({ summary: 'Obsolete BOM: active/draft → obsolete' })
  async obsolete(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-user-id') xUserId: string,
  ) {
    const uid = await this.identity.resolveUser(xUserId)
    return this.svc.obsolete(id, uid)
  }
}
