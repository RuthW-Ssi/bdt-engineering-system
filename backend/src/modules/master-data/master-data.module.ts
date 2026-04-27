import { Module } from '@nestjs/common'
import { MasterDataService } from './master-data.service'
import { UomsController } from './uoms.controller'
import { ProductCategoriesController } from './product-categories.controller'

@Module({
  controllers: [UomsController, ProductCategoriesController],
  providers: [MasterDataService],
  exports: [MasterDataService],
})
export class MasterDataModule {}
