import { PartialType, OmitType } from '@nestjs/swagger'
import { CreateDrawingDto } from './create-drawing.dto'

export class UpdateDrawingDto extends PartialType(OmitType(CreateDrawingDto, ['product_code', 'drawing_number', 'drawing_type'] as const)) {}
