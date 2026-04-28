import {
  Controller, Get, Post, Patch, Body, Param, Query, Headers, ParseIntPipe,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiSecurity, ApiBody } from '@nestjs/swagger'
import { DrawingsService } from './services/drawings.service'
import { CreateDrawingDto } from './dto/create-drawing.dto'
import { UpdateDrawingDto } from './dto/update-drawing.dto'
import { AddRevisionDto } from './dto/add-revision.dto'
import { QueryDrawingDto } from './dto/query-drawing.dto'
import { IdentityService } from '../identity/identity.service'

@ApiTags('drawings')
@ApiSecurity('x-user-id')
@Controller('drawings')
export class DrawingsController {
  constructor(
    private readonly svc: DrawingsService,
    private readonly identity: IdentityService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a shop drawing' })
  async create(
    @Body() dto: CreateDrawingDto,
    @Headers('x-user-id') xUserId: string,
  ) {
    const uid = await this.identity.resolveUser(xUserId)
    return this.svc.create(dto, uid)
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
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDrawingDto,
    @Headers('x-user-id') xUserId: string,
  ) {
    const uid = await this.identity.resolveUser(xUserId)
    return this.svc.update(id, dto, uid)
  }

  @Post(':id/revisions')
  @ApiOperation({ summary: 'Add a revision to a drawing' })
  async addRevision(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddRevisionDto,
    @Headers('x-user-id') xUserId: string,
  ) {
    const uid = await this.identity.resolveUser(xUserId)
    return this.svc.addRevision(id, dto, uid)
  }

  @Get(':id/revisions')
  @ApiOperation({ summary: 'Get all revisions for a drawing (newest first)' })
  getRevisions(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getRevisions(id)
  }

  @Post(':id/action_submit_review')
  @ApiOperation({ summary: 'Submit for review: draft → in_review' })
  async actionSubmitReview(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-user-id') xUserId: string,
  ) {
    const uid = await this.identity.resolveUser(xUserId)
    return this.svc.performAction(id, 'action_submit_review', uid)
  }

  @Post(':id/action_approve')
  @ApiOperation({ summary: 'Approve: in_review → approved' })
  @ApiBody({ schema: { properties: { approved_uid: { type: 'integer' } } } })
  async actionApprove(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { approved_uid?: number },
    @Headers('x-user-id') xUserId: string,
  ) {
    const uid = await this.identity.resolveUser(xUserId)
    return this.svc.performAction(id, 'action_approve', uid, body.approved_uid)
  }

  @Post(':id/action_reject')
  @ApiOperation({ summary: 'Reject: in_review → draft' })
  async actionReject(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-user-id') xUserId: string,
  ) {
    const uid = await this.identity.resolveUser(xUserId)
    return this.svc.performAction(id, 'action_reject', uid)
  }

  @Post(':id/action_release')
  @ApiOperation({ summary: 'Release: approved → released' })
  async actionRelease(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-user-id') xUserId: string,
  ) {
    const uid = await this.identity.resolveUser(xUserId)
    return this.svc.performAction(id, 'action_release', uid)
  }

  @Post(':id/action_supersede')
  @ApiOperation({ summary: 'Supersede: released → superseded' })
  async actionSupersede(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-user-id') xUserId: string,
  ) {
    const uid = await this.identity.resolveUser(xUserId)
    return this.svc.performAction(id, 'action_supersede', uid)
  }

  @Post(':id/action_obsolete')
  @ApiOperation({ summary: 'Obsolete: draft/released → obsolete' })
  async actionObsolete(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-user-id') xUserId: string,
  ) {
    const uid = await this.identity.resolveUser(xUserId)
    return this.svc.performAction(id, 'action_obsolete', uid)
  }
}
