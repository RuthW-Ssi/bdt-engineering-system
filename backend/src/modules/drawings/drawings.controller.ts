import { Controller, Get, Post, Delete, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { DrawingsService } from './drawings.service'
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
  constructor(private readonly svc: DrawingsService) {}

  @Post()
  @ApiOperation({ summary: 'Record an uploaded drawing file against a project' })
  create(@Body() dto: CreateDrawingDto, @CurrentUser() user: JwtPayload) {
    return this.svc.create(dto, user.sub)
  }

  @Get()
  @ApiOperation({ summary: 'List drawings for a project' })
  findByProject(@Query() query: QueryDrawingDto) {
    return this.svc.findByProject(Number(query.project_id))
  }

  @Get('latest-version')
  @ApiOperation({ summary: 'Highest version already used for a project — null if none yet' })
  getLatestVersion(@Query() query: QueryLatestDrawingVersionDto) {
    return this.svc.getLatestVersion(query.project_id)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a drawing (removes the DB row and the underlying file)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id)
  }
}
