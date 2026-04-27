import {
  Controller, Get, Post, Patch, Body, Param, Query, Headers,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiSecurity } from '@nestjs/swagger'
import { ProjectsService } from './projects.service'
import { CreateProjectDto } from './dto/create-project.dto'
import { UpdateProjectDto } from './dto/update-project.dto'
import { QueryProjectDto } from './dto/query-project.dto'
import { IdentityService } from '../identity/identity.service'

@ApiTags('projects')
@ApiSecurity('x-user-id')
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly svc: ProjectsService,
    private readonly identity: IdentityService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create project' })
  async create(@Body() dto: CreateProjectDto, @Headers('x-user-id') xUserId: string) {
    const userId = await this.identity.resolveUser(xUserId)
    return this.svc.create(dto, userId)
  }

  @Get()
  @ApiOperation({ summary: 'List projects' })
  findAll(@Query() query: QueryProjectDto) {
    return this.svc.findAll(query)
  }

  @Get(':project_code')
  @ApiOperation({ summary: 'Get project by code' })
  findOne(@Param('project_code') code: string) {
    return this.svc.findOne(code)
  }

  @Patch(':project_code')
  @ApiOperation({ summary: 'Update project' })
  async update(
    @Param('project_code') code: string,
    @Body() dto: UpdateProjectDto,
    @Headers('x-user-id') xUserId: string,
  ) {
    const userId = await this.identity.resolveUser(xUserId)
    return this.svc.update(code, dto, userId)
  }

  @Post(':project_code/action_win')
  @ApiOperation({ summary: 'Win project: lead → won' })
  async actionWin(@Param('project_code') code: string, @Headers('x-user-id') xUserId: string) {
    const userId = await this.identity.resolveUser(xUserId)
    return this.svc.doAction(code, 'action_win', userId)
  }

  @Post(':project_code/action_start_design')
  @ApiOperation({ summary: 'Start design: won → in_design' })
  async actionStartDesign(@Param('project_code') code: string, @Headers('x-user-id') xUserId: string) {
    const userId = await this.identity.resolveUser(xUserId)
    return this.svc.doAction(code, 'action_start_design', userId)
  }

  @Post(':project_code/action_close')
  @ApiOperation({ summary: 'Close project' })
  async actionClose(@Param('project_code') code: string, @Headers('x-user-id') xUserId: string) {
    const userId = await this.identity.resolveUser(xUserId)
    return this.svc.doAction(code, 'action_close', userId)
  }
}
