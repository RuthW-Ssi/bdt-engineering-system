// 🟡 SKELETON — Sprint 6 — 🟨 Hybrid (ISA-95 PersonnelSpec)
// Activate by: (1) move into ../../modules/personnel-skills, (2) add to AppModule, (3) replace stubs
import { Module } from '@nestjs/common'
import { PersonnelSkillsController } from './personnel-skills.controller'
import { PersonnelSkillsService } from './personnel-skills.service'

@Module({
  controllers: [PersonnelSkillsController],
  providers: [PersonnelSkillsService],
  exports: [PersonnelSkillsService],
})
export class PersonnelSkillsModule {}
