import { Module } from '@nestjs/common'
import { BimController } from './bim.controller'
import { BimService } from './bim.service'
import { ApsClientService } from './aps-client.service'

@Module({
  controllers: [BimController],
  providers: [BimService, ApsClientService],
})
export class BimModule {}
