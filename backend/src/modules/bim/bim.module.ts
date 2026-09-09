import { Module } from '@nestjs/common'
import { BimController } from './bim.controller'
import { BimService } from './bim.service'
import { BimBackupService } from './bim-backup.service'
import { ApsModule } from '../aps/aps.module'
import { ProjectsModule } from '../projects/projects.module'

@Module({
  imports: [ApsModule, ProjectsModule],
  controllers: [BimController],
  providers: [BimService, BimBackupService],
})
export class BimModule {}
