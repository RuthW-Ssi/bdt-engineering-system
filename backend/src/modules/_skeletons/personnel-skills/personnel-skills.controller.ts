// 🟡 SKELETON — Sprint 6 — 🟨 Hybrid (ISA-95 PersonnelSpec)
// Skill matrix + welder certification (AWS D1.1, TIS 2543) + activity skill requirements
import { Controller, Get, Post, Body, Param } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { PersonnelSkillsService } from './personnel-skills.service'

@ApiTags('SKELETON · personnel-skills (Sprint 6)')
@Controller({ path: 'personnel-skills', version: '1' })
export class PersonnelSkillsController {
  constructor(private readonly svc: PersonnelSkillsService) {}

  @Get()
  @ApiOperation({ summary: 'TODO Sprint 6 — list PersonnelSkills' })
  list() {
    throw new Error('SKELETON: not implemented — see SKELETON.md')
  }

  @Get(':id')
  @ApiOperation({ summary: 'TODO Sprint 6 — get PersonnelSkills' })
  get(@Param('id') _id: string) {
    throw new Error('SKELETON: not implemented')
  }

  @Post()
  @ApiOperation({ summary: 'TODO Sprint 6 — create PersonnelSkills' })
  create(@Body() _dto: any) {
    throw new Error('SKELETON: not implemented')
  }
}
