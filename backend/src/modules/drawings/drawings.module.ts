import { Module } from '@nestjs/common'
import { DrawingsService } from './drawings.service'
import { DrawingsController } from './drawings.controller'
import { FileStorageModule } from '../file-storage/file-storage.module'

@Module({
  imports: [FileStorageModule],
  controllers: [DrawingsController],
  providers: [DrawingsService],
})
export class DrawingsModule {}
