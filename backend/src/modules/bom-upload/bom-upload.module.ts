import { Module } from '@nestjs/common'
import { BomUploadController } from './bom-upload.controller'
import { BomUploadService } from './bom-upload.service'
import { XlsxParserService } from './xlsx-parser.service'
import { FileStorageModule } from '../file-storage/file-storage.module'

@Module({
  imports: [FileStorageModule],
  controllers: [BomUploadController],
  providers: [BomUploadService, XlsxParserService],
})
export class BomUploadModule {}
