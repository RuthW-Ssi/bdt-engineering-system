import { Module } from '@nestjs/common'
import { ProductDerivationController } from './product-derivation.controller'
import { ProductDerivationService } from './product-derivation.service'

@Module({
  controllers: [ProductDerivationController],
  providers: [ProductDerivationService],
  exports: [ProductDerivationService],
})
export class ProductDerivationModule {}
