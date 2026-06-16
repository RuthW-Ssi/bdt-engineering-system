import { Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator'

export class MoAssemblyLineInputDto {
  @IsInt()
  @IsPositive()
  bom_assembly_id: number

  // qty as number; service validates ≤ remaining (P13)
  @IsPositive()
  qty: number
}

export class CreateMoDto {
  // P12: exactly one mark prefix (code, not id — mark_prefix_master PK = code)
  @IsString()
  @Length(1, 10)
  primary_mark_prefix_code: string

  // P12: exactly one routing template (operations snapshotted at create)
  @IsInt()
  @IsPositive()
  routing_template_id: number

  @IsOptional()
  @IsISO8601()
  due_date?: string

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MoAssemblyLineInputDto)
  assembly_lines: MoAssemblyLineInputDto[]

  // Save Draft (false/omitted) vs Save + Confirm (true) — P3 lifecycle
  @IsOptional()
  @IsBoolean()
  confirm?: boolean
}
