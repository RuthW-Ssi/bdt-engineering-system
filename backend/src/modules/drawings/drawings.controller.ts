import { Controller, Get, Post, Delete, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { DrawingsService } from './drawings.service'
import { CreateDrawingDto } from './dto/create-drawing.dto'
import { QueryDrawingDto } from './dto/query-drawing.dto'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { JwtPayload } from '../auth/auth.service'

@ApiTags('drawings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('drawings')
export class DrawingsController {
  constructor(private readonly svc: DrawingsService) {}

  @Post()
  @ApiOperation({ summary: 'Record an uploaded drawing file against a product' })
  create(@Body() dto: CreateDrawingDto, @CurrentUser() user: JwtPayload) {
    return this.svc.create(dto, user.sub)
  }

  @Get()
  @ApiOperation({ summary: 'List drawings for a product' })
  findByProduct(@Query() query: QueryDrawingDto) {
    return this.svc.findByProduct(Number(query.product_id))
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a drawing (removes the DB row and the underlying file)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id)
  }
}
