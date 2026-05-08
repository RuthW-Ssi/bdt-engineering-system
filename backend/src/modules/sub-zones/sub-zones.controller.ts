import {
  Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, UseGuards,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { SubZonesService } from './sub-zones.service'
import { CreateSubZoneDto } from './dto/create-sub-zone.dto'
import { UpdateSubZoneDto } from './dto/update-sub-zone.dto'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { JwtPayload } from '../auth/auth.service'

@ApiTags('sub-zones')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class SubZonesController {
  constructor(private readonly svc: SubZonesService) {}

  @Get('zones/:zoneId/sub-zones')
  @ApiOperation({ summary: 'List sub-zones for a zone' })
  findAll(@Param('zoneId', ParseIntPipe) zoneId: number) {
    return this.svc.findAllForZone(zoneId)
  }

  @Post('zones/:zoneId/sub-zones')
  @ApiOperation({ summary: 'Create sub-zone under a zone' })
  create(
    @Param('zoneId', ParseIntPipe) zoneId: number,
    @Body() dto: CreateSubZoneDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.create(zoneId, dto, user.sub)
  }

  @Patch('sub-zones/:id')
  @ApiOperation({ summary: 'Update sub-zone' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSubZoneDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.update(id, dto, user.sub)
  }

  @Delete('sub-zones/:id')
  @ApiOperation({ summary: 'Archive sub-zone (soft delete)' })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.svc.remove(id, user.sub)
  }
}
