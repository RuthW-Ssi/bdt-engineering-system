import { Module } from '@nestjs/common'
import { BimController } from './bim.controller'
import { BimService } from './bim.service'
import { ApsClientService } from './aps-client.service'
import { BimBackupService } from './bim-backup.service'

@Module({
  controllers: [BimController],
  providers: [BimService, ApsClientService, BimBackupService],
})
export class BimModule {}
