import {
  Controller, Get, Post, Patch, Body, Param, Query, Headers,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiSecurity, ApiBody } from '@nestjs/swagger'
import { ProductsService } from './products.service'
import { CreateStandardProductDto } from './dto/create-standard-product.dto'
import { CreateCustomProductDto } from './dto/create-custom-product.dto'
import { UpdateProductDto } from './dto/update-product.dto'
import { QueryProductDto } from './dto/query-product.dto'
import { IdentityService } from '../identity/identity.service'

@ApiTags('products')
@ApiSecurity('x-user-id')
@Controller('products')
export class ProductsController {
  constructor(
    private readonly svc: ProductsService,
    private readonly identity: IdentityService,
  ) {}

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
  async create(
    @Body() dto: CreateStandardProductDto | CreateCustomProductDto,
    @Headers('x-user-id') xUserId: string,
  ) {
    const userId = await this.identity.resolveUser(xUserId)
    return this.svc.create(dto, userId)
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
  async update(
    @Param('product_code') code: string,
    @Body() dto: UpdateProductDto,
    @Headers('x-user-id') xUserId: string,
  ) {
    const userId = await this.identity.resolveUser(xUserId)
    return this.svc.update(code, dto, userId)
  }

  // ── State actions ──────────────────────────────────────────
  @Post(':product_code/action_submit_design')
  @ApiOperation({ summary: 'Submit for design: draft → in_design' })
  async actionSubmitDesign(@Param('product_code') code: string, @Headers('x-user-id') xUserId: string) {
    const userId = await this.identity.resolveUser(xUserId)
    return this.svc.doAction(code, 'action_submit_design', userId)
  }

  @Post(':product_code/action_submit_review')
  @ApiOperation({ summary: 'Submit for review: in_design → in_review' })
  async actionSubmitReview(@Param('product_code') code: string, @Headers('x-user-id') xUserId: string) {
    const userId = await this.identity.resolveUser(xUserId)
    return this.svc.doAction(code, 'action_submit_review', userId)
  }

  @Post(':product_code/action_approve')
  @ApiOperation({ summary: 'Approve: in_review → approved' })
  async actionApprove(@Param('product_code') code: string, @Headers('x-user-id') xUserId: string) {
    const userId = await this.identity.resolveUser(xUserId)
    return this.svc.doAction(code, 'action_approve', userId)
  }

  @Post(':product_code/action_release')
  @ApiOperation({ summary: 'Release: approved → released' })
  async actionRelease(@Param('product_code') code: string, @Headers('x-user-id') xUserId: string) {
    const userId = await this.identity.resolveUser(xUserId)
    return this.svc.doAction(code, 'action_release', userId)
  }

  @Post(':product_code/action_obsolete')
  @ApiOperation({ summary: 'Obsolete: released → obsolete' })
  async actionObsolete(@Param('product_code') code: string, @Headers('x-user-id') xUserId: string) {
    const userId = await this.identity.resolveUser(xUserId)
    return this.svc.doAction(code, 'action_obsolete', userId)
  }

  @Get(':product_code/messages')
  @ApiOperation({ summary: 'Get audit log for product' })
  getMessages(@Param('product_code') code: string) {
    return this.svc.getMessages(code)
  }
}
