// 🟡 SKELETON — Sprint 5 — 🟨 Hybrid (ISA-95 ProcessSegmentDependency)
// Activate by: (1) move into ../../modules/routing-dependency, (2) add to AppModule, (3) replace stubs
import { Module } from '@nestjs/common'
import { RoutingDependencyController } from './routing-dependency.controller'
import { RoutingDependencyService } from './routing-dependency.service'

@Module({
  controllers: [RoutingDependencyController],
  providers: [RoutingDependencyService],
  exports: [RoutingDependencyService],
})
export class RoutingDependencyModule {}
