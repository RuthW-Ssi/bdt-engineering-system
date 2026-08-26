import { Module } from '@nestjs/common'
import { BimController } from './bim.controller'
import { BimService } from './bim.service'
import { BimBackupService } from './bim-backup.service'
import { ApsModule } from '../aps/aps.module'

@Module({
  imports: [ApsModule],
  controllers: [BimController],
  providers: [BimService, BimBackupService],
})
export class BimModule {}
