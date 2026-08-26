import { Controller, Get, Post, Delete, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { DrawingsService } from './drawings.service'
import { DrawingApsService } from './drawing-aps.service'
import { CreateDrawingDto } from './dto/create-drawing.dto'
import { QueryDrawingDto } from './dto/query-drawing.dto'
import { QueryLatestDrawingVersionDto } from './dto/query-latest-drawing-version.dto'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { JwtPayload } from '../auth/auth.service'

@ApiTags('drawings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('drawings')
export class DrawingsController {
  constructor(
    private readonly svc: DrawingsService,
    private readonly drawingAps: DrawingApsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Record an uploaded drawing file against a zone (or sub-zone)' })
  create(@Body() dto: CreateDrawingDto, @CurrentUser() user: JwtPayload) {
    return this.svc.create(dto, user.sub)
  }

  @Get()
  @ApiOperation({ summary: 'List drawings for a zone (or sub-zone)' })
  findByZone(@Query() query: QueryDrawingDto) {
    return this.svc.findByZone(query.zone_id, query.sub_zone_id ?? null)
  }

  @Get('latest-version')
  @ApiOperation({ summary: 'Highest version already used for a zone (or sub-zone) — null if none yet' })
  getLatestVersion(@Query() query: QueryLatestDrawingVersionDto) {
    return this.svc.getLatestVersion(query.zone_id, query.sub_zone_id ?? null)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a drawing (removes the DB row and the underlying file)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id)
  }

  @Get(':id/aps-status')
  @ApiOperation({ summary: 'Check (and advance) DWG APS preview translation status — poll while processing' })
  getApsStatus(@Param('id', ParseIntPipe) id: number) {
    return this.drawingAps.checkStatus(id)
  }

  @Get(':id/aps-viewer-token')
  @ApiOperation({ summary: 'Get a urn + viewer-scoped APS token for an already-translated DWG preview' })
  getApsViewerToken(@Param('id', ParseIntPipe) id: number) {
    return this.drawingAps.getViewerToken(id)
  }
}
