import { Module } from '@nestjs/common'
import { ProjectsService } from './projects.service'
import { ProjectProgressService } from './project-progress.service'
import { ProgressChangeLogService } from './progress-change-log.service'
import { ProgressExportService } from './progress-export.service'
import { ProgressImportService } from './progress-import.service'
import { ProgressHistoryService } from './progress-history.service'
import { ProjectsController } from './projects.controller'
import { MailModule } from '../mail/mail.module'

@Module({
  imports: [MailModule],
  controllers: [ProjectsController],
  providers: [
    ProjectsService, ProjectProgressService, ProgressChangeLogService,
    ProgressExportService, ProgressImportService, ProgressHistoryService,
  ],
  exports: [ProjectsService],
})
export class ProjectsModule {}
