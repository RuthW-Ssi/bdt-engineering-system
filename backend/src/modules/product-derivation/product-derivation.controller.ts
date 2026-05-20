import { Controller, Get, Post, Patch, Param, Body, ParseIntPipe, UseGuards, HttpCode, HttpStatus } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { JwtPayload } from '../auth/auth.service'
import { ProductDerivationService } from './product-derivation.service'
import type { VariantAttributes } from '../../libs/products/profile-parser'

@ApiTags('product-derivation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class ProductDerivationController {
  constructor(private readonly svc: ProductDerivationService) {}

  @Post('dispatches/:id/derive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Trigger (or re-trigger) product derivation for a dispatch' })
  deriveForDispatch(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.deriveForDispatch(id, user.sub)
  }

  @Get('dispatches/:id/review-queue')
  @ApiOperation({ summary: 'Get assemblies needing engineer review for a dispatch' })
  getReviewQueue(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getReviewQueue(id)
  }

  @Post('assemblies/:id/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Confirm a derived assembly product match' })
  confirmAssembly(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.confirmAssembly(id, user.sub)
  }

  @Patch('products/:id/variant-attributes')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Override variant attributes for a derived product' })
  overrideVariantAttrs(
    @Param('id', ParseIntPipe) id: number,
    @Body() attrs: VariantAttributes,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.overrideVariantAttrs(id, attrs, user.sub)
  }
}
