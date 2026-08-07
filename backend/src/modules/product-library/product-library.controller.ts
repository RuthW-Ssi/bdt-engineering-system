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
import { PermissionGuard } from '../../common/guards/permission.guard'
import { RequiresPermission } from '../../common/decorators/permission.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { JwtPayload } from '../auth/auth.service'

@ApiTags('product-library')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('product-library')
export class ProductLibraryController {
  constructor(private readonly svc: ProductLibraryService) {}

  @Get()
  @RequiresPermission('products', 'view')
  @ApiOperation({ summary: 'List library entries with search + pagination' })
  findAll(@Query() query: QueryLibraryDto) {
    return this.svc.findAll(query)
  }

  // Deliberately ungated (2026-08-05) — pure reference/lookup data (prefix
  // → label) read cross-module by RoutingList.tsx (`routings` permission,
  // not `products`) to annotate its table. Discovered as a live bug: a
  // `routings`-only user (full view+create) hit a 403 the instant the
  // Routing Template page loaded, from this call alone, before clicking
  // anything. Same shape as `equipment-resources`/`routing-templates`
  // being left ungated for Activity Library/MO — see
  // permission-modules.ts's `routings` section.
  @Get('mark-prefixes')
  @ApiOperation({ summary: 'List distinct mark prefixes from active product library entries' })
  getMarkPrefixes() {
    return this.svc.getMarkPrefixes()
  }

  @Get('check-prefix/:code')
  @RequiresPermission('products', 'view')
  @ApiOperation({ summary: 'Check if a mark prefix code is already taken' })
  checkPrefix(@Param('code') code: string) {
    return this.svc.checkPrefixAvailable(code)
  }

  @Get(':id')
  @RequiresPermission('products', 'view')
  @ApiOperation({ summary: 'Get library entry by id (includes std_count, cus_count)' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id)
  }

  @Post()
  @RequiresPermission('products', 'create')
  @ApiOperation({ summary: 'Create library entry — auto-assigns LIB-NNN code' })
  create(@Body() dto: CreateLibraryDto, @CurrentUser() user: JwtPayload) {
    return this.svc.create(dto, user.sub)
  }

  @Patch(':id')
  @RequiresPermission('products', 'update')
  @ApiOperation({ summary: 'Rename or archive/restore a library entry' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLibraryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.update(id, dto, user.sub)
  }

  @Delete(':id/permanent')
  @RequiresPermission('products', 'delete')
  @ApiOperation({ summary: 'Hard delete — only allowed when already archived + 0 products reference it' })
  hardDelete(@Param('id', ParseIntPipe) id: number) {
    return this.svc.hardDelete(id)
  }

  @Delete(':id')
  @RequiresPermission('products', 'delete')
  @ApiOperation({ summary: 'Soft-delete (archive) — rejects with 409 if products still reference' })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.svc.remove(id, user.sub)
  }
}
