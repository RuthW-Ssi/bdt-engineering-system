import {
  Controller, Get, Post, Patch, Body, Param, Query, ParseIntPipe, UseGuards,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger'
import { DrawingsService } from './services/drawings.service'
import { CreateDrawingDto } from './dto/create-drawing.dto'
import { UpdateDrawingDto } from './dto/update-drawing.dto'
import { AddRevisionDto } from './dto/add-revision.dto'
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
  @ApiOperation({ summary: 'Create a shop drawing' })
  create(
    @Body() dto: CreateDrawingDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.create(dto, user.sub)
  }

  @Get()
  @ApiOperation({ summary: 'List shop drawings with filters' })
  findAll(@Query() query: QueryDrawingDto) {
    return this.svc.findAll(query)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get drawing detail with revisions' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update drawing (draft state only)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDrawingDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.update(id, dto, user.sub)
  }

  @Post(':id/revisions')
  @ApiOperation({ summary: 'Add a revision to a drawing' })
  addRevision(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddRevisionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.addRevision(id, dto, user.sub)
  }

  @Get(':id/revisions')
  @ApiOperation({ summary: 'Get all revisions for a drawing (newest first)' })
  getRevisions(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getRevisions(id)
  }

  @Post(':id/action_submit_review')
  @ApiOperation({ summary: 'Submit for review: draft → in_review' })
  actionSubmitReview(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.performAction(id, 'action_submit_review', user.sub)
  }

  @Post(':id/action_approve')
  @ApiOperation({ summary: 'Approve: in_review → approved' })
  @ApiBody({ schema: { properties: { approved_uid: { type: 'integer' } } } })
  actionApprove(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { approved_uid?: number },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.performAction(id, 'action_approve', user.sub, body.approved_uid)
  }

  @Post(':id/action_reject')
  @ApiOperation({ summary: 'Reject: in_review → draft' })
  actionReject(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.performAction(id, 'action_reject', user.sub)
  }

  @Post(':id/action_release')
  @ApiOperation({ summary: 'Release: approved → released' })
  actionRelease(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.performAction(id, 'action_release', user.sub)
  }

  @Post(':id/action_supersede')
  @ApiOperation({ summary: 'Supersede: released → superseded' })
  actionSupersede(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.performAction(id, 'action_supersede', user.sub)
  }

  @Post(':id/action_obsolete')
  @ApiOperation({ summary: 'Obsolete: draft/released → obsolete' })
  actionObsolete(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.performAction(id, 'action_obsolete', user.sub)
  }
}
