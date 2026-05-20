import {
  Controller, Get, Post, Patch, Body, Param, Query, UseGuards,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger'
import { ProductsService } from './products.service'
import { CreateStandardProductDto } from './dto/create-standard-product.dto'
import { CreateCustomProductDto } from './dto/create-custom-product.dto'
import { UpdateProductDto } from './dto/update-product.dto'
import { UpdateSpecDto } from './dto/update-spec.dto'
import { QueryProductDto } from './dto/query-product.dto'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { JwtPayload } from '../auth/auth.service'

@ApiTags('products')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly svc: ProductsService) {}

  @Post()
  @ApiOperation({ summary: 'Create product (standard or custom — discriminator: product_type)' })
  @ApiBody({
    schema: {
      oneOf: [
        { $ref: '#/components/schemas/CreateStandardProductDto' },
        { $ref: '#/components/schemas/CreateCustomProductDto' },
      ],
    },
  })
  create(
    @Body() dto: CreateStandardProductDto | CreateCustomProductDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.create(dto, user.sub)
  }

  @Get()
  @ApiOperation({ summary: 'List products with filters' })
  findAll(@Query() query: QueryProductDto) {
    return this.svc.findAll(query)
  }

  @Get(':product_code')
  @ApiOperation({ summary: 'Get product by product_code' })
  findOne(@Param('product_code') code: string) {
    return this.svc.findOne(code)
  }

  @Patch(':product_code')
  @ApiOperation({ summary: 'Update product' })
  update(
    @Param('product_code') code: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.update(code, dto, user.sub)
  }

  @Post(':product_code/action_submit_design')
  @ApiOperation({ summary: 'Submit for design: draft → in_design' })
  actionSubmitDesign(@Param('product_code') code: string, @CurrentUser() user: JwtPayload) {
    return this.svc.doAction(code, 'action_submit_design', user.sub)
  }

  @Post(':product_code/action_submit_review')
  @ApiOperation({ summary: 'Submit for review: in_design → in_review' })
  actionSubmitReview(@Param('product_code') code: string, @CurrentUser() user: JwtPayload) {
    return this.svc.doAction(code, 'action_submit_review', user.sub)
  }

  @Post(':product_code/action_approve')
  @ApiOperation({ summary: 'Approve: in_review → approved' })
  actionApprove(@Param('product_code') code: string, @CurrentUser() user: JwtPayload) {
    return this.svc.doAction(code, 'action_approve', user.sub)
  }

  @Post(':product_code/action_release')
  @ApiOperation({ summary: 'Release: approved → released' })
  actionRelease(@Param('product_code') code: string, @CurrentUser() user: JwtPayload) {
    return this.svc.doAction(code, 'action_release', user.sub)
  }

  @Post(':product_code/action_obsolete')
  @ApiOperation({ summary: 'Obsolete: released → obsolete' })
  actionObsolete(@Param('product_code') code: string, @CurrentUser() user: JwtPayload) {
    return this.svc.doAction(code, 'action_obsolete', user.sub)
  }

  @Get(':product_code/spec')
  @ApiOperation({ summary: 'Get mBOM spec presets (paint + welding) for a standard product' })
  getSpec(@Param('product_code') code: string) {
    return this.svc.getSpec(code)
  }

  @Patch(':product_code/spec')
  @ApiOperation({ summary: 'Set or clear mBOM spec presets. Pass null to clear a spec.' })
  updateSpec(
    @Param('product_code') code: string,
    @Body() dto: UpdateSpecDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.updateSpec(code, dto, user.sub)
  }

  @Get(':product_code/messages')
  @ApiOperation({ summary: 'Get audit log for product' })
  getMessages(@Param('product_code') code: string) {
    return this.svc.getMessages(code)
  }
}
