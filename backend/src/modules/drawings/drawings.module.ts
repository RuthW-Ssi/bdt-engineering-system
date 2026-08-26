import { Module } from '@nestjs/common'
import { DrawingsService } from './drawings.service'
import { DrawingsController } from './drawings.controller'
import { DrawingApsService } from './drawing-aps.service'
import { FileStorageModule } from '../file-storage/file-storage.module'
import { ApsModule } from '../aps/aps.module'

@Module({
  imports: [FileStorageModule, ApsModule],
  controllers: [DrawingsController],
  providers: [DrawingsService, DrawingApsService],
})
export class DrawingsModule {}
