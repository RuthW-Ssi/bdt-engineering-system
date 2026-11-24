import { Module } from '@nestjs/common'
import { TraceabilityController } from './traceability.controller'
import { TraceabilityService } from './traceability.service'

// Traceability: heat lot ↔ plate ↔ nesting sheet ↔ parts.
// Reads the cutting-plan tables (plate nesting reports already stored) and the BOM; writes only its own three tables.
@Module({
  controllers: [TraceabilityController],
  providers: [TraceabilityService],
  exports: [TraceabilityService],
})
export class TraceabilityModule {}
