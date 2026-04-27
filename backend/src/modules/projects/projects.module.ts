import { Module } from '@nestjs/common'
import { ProjectsService } from './projects.service'
import { ProjectsController } from './projects.controller'
import { MailModule } from '../mail/mail.module'
import { IdentityModule } from '../identity/identity.module'

@Module({
  imports: [MailModule, IdentityModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
