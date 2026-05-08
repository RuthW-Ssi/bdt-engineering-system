import { Module } from '@nestjs/common'
import { ProjectsService } from './projects.service'
import { ProjectsController } from './projects.controller'
import { MailModule } from '../mail/mail.module'

@Module({
  imports: [MailModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
