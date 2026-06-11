import { Module } from '@nestjs/common'
import { MachinesService } from './machines.service'
import { MachinesController } from './machines.controller'
import { RepairCodeGenerator } from './repair-code.generator'

@Module({
  controllers: [MachinesController],
  providers: [MachinesService, RepairCodeGenerator],
})
export class MachinesModule {}
