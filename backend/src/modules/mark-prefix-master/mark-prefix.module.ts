import { Module } from '@nestjs/common'
import { MarkPrefixService } from './mark-prefix.service'
import { MarkPrefixController } from './mark-prefix.controller'

@Module({
  controllers: [MarkPrefixController],
  providers: [MarkPrefixService],
  exports: [MarkPrefixService],
})
export class MarkPrefixModule {}
