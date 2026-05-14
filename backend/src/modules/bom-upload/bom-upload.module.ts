import { Module } from '@nestjs/common'
import { BomUploadController } from './bom-upload.controller'
import { BomUploadService } from './bom-upload.service'
import { BomDiffService } from './bom-diff.service'
import { BomMatchingService } from './bom-matching.service'
import { XlsxParserService } from './xlsx-parser.service'
import { FileStorageModule } from '../file-storage/file-storage.module'

@Module({
  imports: [FileStorageModule],
  controllers: [BomUploadController],
  providers: [BomUploadService, BomDiffService, BomMatchingService, XlsxParserService],
})
export class BomUploadModule {}
