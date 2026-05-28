import { Module } from '@nestjs/common'
import { ProductsService } from './products.service'
import { ProductsController } from './products.controller'
import { ProductCodeGenerator } from './product-code.generator'
import { MailModule } from '../mail/mail.module'
import { MasterDataModule } from '../master-data/master-data.module'
import { ProductLibraryModule } from '../product-library/product-library.module'

@Module({
  imports: [MailModule, MasterDataModule, ProductLibraryModule],
  controllers: [ProductsController],
  providers: [ProductsService, ProductCodeGenerator],
  exports: [ProductsService, ProductCodeGenerator],
})
export class ProductsModule {}
