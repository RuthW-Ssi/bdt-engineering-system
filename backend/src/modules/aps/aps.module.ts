import { Module } from '@nestjs/common'
import { ApsClientService } from './aps-client.service'

// Shared by BimModule and DrawingsModule — each owns a separate OSS bucket
// (APS_BIM_BUCKET_KEY / APS_DRAWING_BUCKET_KEY) through the same client.
@Module({
  providers: [ApsClientService],
  exports: [ApsClientService],
})
export class ApsModule {}
