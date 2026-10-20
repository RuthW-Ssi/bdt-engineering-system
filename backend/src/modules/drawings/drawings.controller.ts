import { Controller, Get, Post, Delete, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { DrawingsService } from './drawings.service'
import { CreateDrawingDto } from './dto/create-drawing.dto'
import { QueryDrawingDto } from './dto/query-drawing.dto'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { JwtPayload } from '../auth/auth.service'
import { CustomerAccessible } from '../../common/customer-scope/customer-accessible.decorator'

@ApiTags('drawings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('drawings')
export class DrawingsController {
  constructor(private readonly svc: DrawingsService) {}

  @Post()
  @ApiOperation({ summary: 'Record an uploaded drawing file against a zone (or sub-zone)' })
  create(@Body() dto: CreateDrawingDto, @CurrentUser() user: JwtPayload) {
    return this.svc.create(dto, user.sub)
  }

  @Get()
  @CustomerAccessible()
  @ApiOperation({ summary: 'List drawings for a zone (or sub-zone) — customers see only the current rev' })
  async findByZone(@Query() query: QueryDrawingDto, @CurrentUser() user: JwtPayload) {
    // `role` on the JWT is a free-text department/"admin" string, never
    // "customer" — the real signal is the DB's res_users.user_type, same as
    // CustomerScopeInterceptor.
    const currentOnly = await this.svc.isCustomerUser(user.sub)
    return this.svc.findByZone(query.zone_id, query.sub_zone_id ?? null, { currentOnly })
  }

  @Get('bom-marks')
  @ApiOperation({ summary: 'Distinct assembly marks from the ACTIVE BOM for a zone (or sub-zone)' })
  bomMarks(@Query() query: QueryDrawingDto) {
    return this.svc.bomMarks(query.zone_id, query.sub_zone_id ?? null)
  }

  @Get('latest-version')
  @ApiOperation({ summary: 'Highest .pdf upload-batch version already used for a zone (or sub-zone) — null if none yet' })
  getLatestVersion(@Query() query: QueryDrawingDto) {
    return this.svc.getLatestVersion(query.zone_id, query.sub_zone_id ?? null)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a drawing (removes the DB row and the underlying file)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id)
  }
}
