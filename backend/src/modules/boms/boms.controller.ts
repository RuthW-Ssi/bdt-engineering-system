import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, ParseIntPipe, UseGuards,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { BomsService } from './services/boms.service'
import { CreateBomDto } from './dto/create-bom.dto'
import { UpdateBomDto } from './dto/update-bom.dto'
import { AddBomLineDto } from './dto/add-bom-line.dto'
import { QueryBomDto } from './dto/query-bom.dto'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { JwtPayload } from '../auth/auth.service'

@ApiTags('boms')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class BomsController {
  constructor(private readonly svc: BomsService) {}

  @Post('products/:product_code/boms')
  @ApiOperation({ summary: 'Create a BOM for a product' })
  create(
    @Param('product_code') productCode: string,
    @Body() dto: CreateBomDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.create({ ...dto, product_code: productCode }, user.sub)
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
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBomDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.update(id, dto, user.sub)
  }

  @Delete('boms/:id')
  @ApiOperation({ summary: 'Soft-delete BOM (draft → obsolete)' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.remove(id, user.sub)
  }

  @Post('boms/:id/lines')
  @ApiOperation({ summary: 'Add a line to a BOM' })
  addLine(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddBomLineDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.addLine(id, dto, user.sub)
  }

  @Patch('boms/:id/lines/:line_id')
  @ApiOperation({ summary: 'Update a BOM line' })
  updateLine(
    @Param('id', ParseIntPipe) id: number,
    @Param('line_id', ParseIntPipe) lineId: number,
    @Body() dto: Partial<AddBomLineDto>,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.updateLine(id, lineId, dto, user.sub)
  }

  @Delete('boms/:id/lines/:line_id')
  @ApiOperation({ summary: 'Delete a BOM line' })
  removeLine(
    @Param('id', ParseIntPipe) id: number,
    @Param('line_id', ParseIntPipe) lineId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.removeLine(id, lineId, user.sub)
  }

  @Post('boms/:id/action_activate')
  @ApiOperation({ summary: 'Activate BOM: draft → active' })
  activate(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.activate(id, user.sub)
  }

  @Post('boms/:id/action_obsolete')
  @ApiOperation({ summary: 'Obsolete BOM: active/draft → obsolete' })
  obsolete(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.obsolete(id, user.sub)
  }
}
