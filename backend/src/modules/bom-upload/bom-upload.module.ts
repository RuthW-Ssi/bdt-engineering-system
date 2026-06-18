import { Module } from '@nestjs/common'
import { BomUploadController } from './bom-upload.controller'
import { BomUploadService } from './bom-upload.service'
import { BomDiffService } from './bom-diff.service'
import { BomMatchingService } from './bom-matching.service'
import { XlsxParserService } from './xlsx-parser.service'
import { PaintConfigService } from './paint-config.service'
import { FileStorageModule } from '../file-storage/file-storage.module'
import { ProductDerivationModule } from '../product-derivation/product-derivation.module'
import { ProductsModule } from '../products/products.module'

@Module({
  imports: [FileStorageModule, ProductDerivationModule, ProductsModule],
  controllers: [BomUploadController],
  providers: [BomUploadService, BomDiffService, BomMatchingService, XlsxParserService, PaintConfigService],
})
export class BomUploadModule {}
