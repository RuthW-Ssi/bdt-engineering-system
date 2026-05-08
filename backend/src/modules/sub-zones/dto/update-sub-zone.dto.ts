import { PartialType } from '@nestjs/swagger'
import { CreateSubZoneDto } from './create-sub-zone.dto'

export class UpdateSubZoneDto extends PartialType(CreateSubZoneDto) {}
