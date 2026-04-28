import { PartialType, OmitType } from '@nestjs/swagger'
import { CreateBomDto } from './create-bom.dto'

export class UpdateBomDto extends PartialType(OmitType(CreateBomDto, ['product_code'] as const)) {}
