import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, ParseIntPipe, UseGuards,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { ProductLibraryService } from './services/product-library.service'
import { CreateLibraryDto } from './dto/create-library.dto'
import { UpdateLibraryDto } from './dto/update-library.dto'
import { QueryLibraryDto } from './dto/query-library.dto'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { JwtPayload } from '../auth/auth.service'

@ApiTags('product-library')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('product-library')
export class ProductLibraryController {
  constructor(private readonly svc: ProductLibraryService) {}

  @Get()
  @ApiOperation({ summary: 'List library entries with search + pagination' })
  findAll(@Query() query: QueryLibraryDto) {
    return this.svc.findAll(query)
  }

  @Get('mark-prefixes')
  @ApiOperation({ summary: 'List distinct mark prefixes from active product library entries' })
  getMarkPrefixes() {
    return this.svc.getMarkPrefixes()
  }

  @Get('check-prefix/:code')
  @ApiOperation({ summary: 'Check if a mark prefix code is already taken' })
  checkPrefix(@Param('code') code: string) {
    return this.svc.checkPrefixAvailable(code)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get library entry by id (includes std_count, cus_count)' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id)
  }

  @Post()
  @ApiOperation({ summary: 'Create library entry — auto-assigns LIB-NNN code' })
  create(@Body() dto: CreateLibraryDto, @CurrentUser() user: JwtPayload) {
    return this.svc.create(dto, user.sub)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename or archive/restore a library entry' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLibraryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.update(id, dto, user.sub)
  }

  @Delete(':id/permanent')
  @ApiOperation({ summary: 'Hard delete — only allowed when already archived + 0 products reference it' })
  hardDelete(@Param('id', ParseIntPipe) id: number) {
    return this.svc.hardDelete(id)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete (archive) — rejects with 409 if products still reference' })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.svc.remove(id, user.sub)
  }
}
