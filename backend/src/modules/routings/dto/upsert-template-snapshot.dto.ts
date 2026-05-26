import { IsArray, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'

export class SnapshotEdgeDto {
  @IsString() source: string
  @IsString() target: string
  @IsOptional() @IsString() sourceHandle?: string
  @IsOptional() @IsString() targetHandle?: string
  @IsOptional() @IsString() label?: string
  @IsOptional() @IsNumber() midOffsetX?: number
  @IsOptional() @IsNumber() midOffsetY?: number
}

export class SnapshotOperationDto {
  @IsOptional() @IsInt() id?: number          // absent = new op
  @IsString() client_ref: string              // frontend node ID — echoed back for edge translation
  @IsString() @MaxLength(30) op_code: string
  @IsString() @MaxLength(60) name: string
  @IsInt() @Min(1) sequence: number
  @IsInt() workcenter_id: number
  @IsOptional() @IsInt() op_type_id?: number | null
  @IsOptional() @IsString() @MaxLength(20) method?: string | null
  @IsString() @MaxLength(10) time_mode: string
  @IsOptional() @IsNumber() @Min(0) time_cycle_manual?: number | null
  @IsOptional() @IsString() @MaxLength(400) formula_expr?: string | null
  @IsOptional() @IsNumber() canvas_x?: number
  @IsOptional() @IsNumber() canvas_y?: number
  @IsOptional() @IsArray() @IsInt({ each: true }) activity_template_ids?: number[]
}

export class UpsertTemplateSnapshotDto {
  @IsString() @MaxLength(60) name: string
  @IsOptional() @IsString() @MaxLength(20) applies_to_product_type?: string | null
  @IsOptional() @IsString() @MaxLength(500) bg_image_url?: string | null
  @IsOptional() @IsNumber() bg_rotation?: number
  @IsOptional() @IsNumber() bg_scale?: number
  @IsArray() @ValidateNested({ each: true }) @Type(() => SnapshotEdgeDto) canvas_edges: SnapshotEdgeDto[]
  @IsArray() @ValidateNested({ each: true }) @Type(() => SnapshotOperationDto) operations: SnapshotOperationDto[]
}
