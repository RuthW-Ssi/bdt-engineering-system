// 🟡 SKELETON — Sprint 7 — 🟥 Custom (BDT MES event stream)
// Activate by: (1) move into ../../modules/mes-events, (2) add to AppModule, (3) replace stubs
import { Module } from '@nestjs/common'
import { MesEventsController } from './mes-events.controller'
import { MesEventsService } from './mes-events.service'

@Module({
  controllers: [MesEventsController],
  providers: [MesEventsService],
  exports: [MesEventsService],
})
export class MesEventsModule {}
