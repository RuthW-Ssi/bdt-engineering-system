import {
  Controller, Get, Post, Patch, Body, Param, Query, UseGuards,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { ProjectsService } from './projects.service'
import { CreateProjectDto } from './dto/create-project.dto'
import { UpdateProjectDto } from './dto/update-project.dto'
import { QueryProjectDto } from './dto/query-project.dto'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { JwtPayload } from '../auth/auth.service'

@ApiTags('projects')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly svc: ProjectsService) {}

  @Post()
  @ApiOperation({ summary: 'Create project' })
  create(@Body() dto: CreateProjectDto, @CurrentUser() user: JwtPayload) {
    return this.svc.create(dto, user.sub)
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
  update(
    @Param('project_code') code: string,
    @Body() dto: UpdateProjectDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.update(code, dto, user.sub)
  }

  @Post(':project_code/action_win')
  @ApiOperation({ summary: 'Win project: lead → won' })
  actionWin(@Param('project_code') code: string, @CurrentUser() user: JwtPayload) {
    return this.svc.doAction(code, 'action_win', user.sub)
  }

  @Post(':project_code/action_start_design')
  @ApiOperation({ summary: 'Start design: won → in_design' })
  actionStartDesign(@Param('project_code') code: string, @CurrentUser() user: JwtPayload) {
    return this.svc.doAction(code, 'action_start_design', user.sub)
  }

  @Post(':project_code/action_close')
  @ApiOperation({ summary: 'Close project' })
  actionClose(@Param('project_code') code: string, @CurrentUser() user: JwtPayload) {
    return this.svc.doAction(code, 'action_close', user.sub)
  }
}
