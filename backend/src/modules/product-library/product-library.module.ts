import { Module } from '@nestjs/common'
import { ProductLibraryController } from './product-library.controller'
import { ProductLibraryService } from './services/product-library.service'
import { ProductLibraryCodeGenerator } from './product-library-code.generator'
import { MailModule } from '../mail/mail.module'

@Module({
  imports: [MailModule],
  controllers: [ProductLibraryController],
  providers: [ProductLibraryService, ProductLibraryCodeGenerator],
  exports: [ProductLibraryService],
})
export class ProductLibraryModule {}
