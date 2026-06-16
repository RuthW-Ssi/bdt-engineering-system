import { Module } from '@nestjs/common'
import { MarkPrefixService } from './mark-prefix.service'
import { MarkPrefixController } from './mark-prefix.controller'
import { ManufacturingOrdersModule } from '../manufacturing-orders/manufacturing-orders.module'

@Module({
  imports: [ManufacturingOrdersModule],
  controllers: [MarkPrefixController],
  providers: [MarkPrefixService],
  exports: [MarkPrefixService],
})
export class MarkPrefixModule {}
