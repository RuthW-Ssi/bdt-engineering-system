import { Controller, Get } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { MasterDataService } from './master-data.service'

@ApiTags('master-data')
@Controller('product-categories')
export class ProductCategoriesController {
  constructor(private readonly svc: MasterDataService) {}

  @Get()
  @ApiOperation({ summary: 'List all active product categories' })
  findAll() {
    return this.svc.getCategories()
  }
}
