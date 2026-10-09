import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNumber,
  Max,
  Min,
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  MaxLength,
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

// One assembly of a pre-shop upload (Dispatch Note row or pre-shop drawing BOM),
// as reviewed/edited in the form. Parts are per set.
export class PreshopPartDto {
  @IsString() @Length(1, 60) part_mark: string
  @IsString() @Length(1, 60) profile: string
  @IsNumber() @Min(0) @Max(99999999) length_mm: number
  @IsString() @Length(0, 20) grade: string
  @IsNumber() @Min(0) @Max(999999) qty: number
  @IsNumber() @Min(0) @Max(999999999) unit_weight_kg: number
}

export class PreshopAssemblyDto {
  @IsString() @Length(1, 60) assembly_mark: string
  @IsOptional() @IsString() @MaxLength(200) name?: string | null
  @IsNumber() @Min(0) @Max(999999) qty: number
  @IsOptional() @IsNumber() @Min(0) @Max(999999999) weight_kg: number | null
  @IsOptional() @IsNumber() @Min(0) @Max(99999999) surface_area_m2: number | null
  @IsOptional() @IsNumber() @Min(0) @Max(99999999) length_mm: number | null
  @IsOptional() @IsNumber() @Min(0) @Max(99999999) width_mm?: number | null
  @IsOptional() @IsNumber() @Min(0) @Max(99999999) height_mm?: number | null
  @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => PreshopPartDto) parts: PreshopPartDto[]
}

export class CreateMoDto {
  // MO type replaces the mark-prefix choice (2026-10-07). Default FULL_SHOP.
  @IsOptional()
  @IsIn(['FULL_SHOP', 'PRE_SHOP'])
  shop_type?: 'FULL_SHOP' | 'PRE_SHOP'

  // No longer chosen in the form (MO type replaced it); still accepted.
  @IsOptional()
  @IsString()
  @Length(1, 10)
  primary_mark_prefix_code?: string

  // PRE_SHOP upload scope — the PRE_SHOP BOM dispatch is created here.
  @IsOptional() @IsInt() @IsPositive() project_id?: number
  @IsOptional() @IsInt() @IsPositive() zone_id?: number
  @IsOptional() @IsInt() @IsPositive() sub_zone_id?: number | null

  // PRE_SHOP only: assemblies from a Dispatch Note / pre-shop drawing upload.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => PreshopAssemblyDto)
  preshop_assemblies?: PreshopAssemblyDto[]

  // P12: exactly one routing template (operations snapshotted at create) —
  // required for every MO, pre-shop too (2026-10-08).
  @IsInt()
  @IsPositive()
  routing_template_id: number

  // Planned production window — replaces the old single due_date (2026-09-22).
  @IsOptional()
  @IsISO8601()
  plan_start?: string

  @IsOptional()
  @IsISO8601()
  plan_finish?: string

  // Assemblies picked from the BOM (FULL_SHOP; PRE_SHOP may add them too). At
  // least one line overall — checked in the service.
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MoAssemblyLineInputDto)
  assembly_lines: MoAssemblyLineInputDto[]

  // Save Draft (false/omitted) vs Save + Confirm (true) — P3 lifecycle
  @IsOptional()
  @IsBoolean()
  confirm?: boolean
}

/** POST /mo/:id/preshop — add assemblies to a PRE_SHOP MO from ONE source:
 *  a Dispatch Note, pre-shop drawing PDFs, or the BOM (2026-10-07). */
export class MergePreshopDto {
  // DN_PDF = a Dispatch Note and pre-shop drawings read together (2026-10-08)
  @IsIn(['DISPATCH_NOTE', 'PRESHOP_PDF', 'DN_PDF', 'BOM']) source: 'DISPATCH_NOTE' | 'PRESHOP_PDF' | 'DN_PDF' | 'BOM'
  @IsOptional() @IsString() @Length(0, 500) filename?: string
  // true = only compare with the MO (new / repeat / changed per mark), write nothing.
  @IsOptional() @IsBoolean() dry_run?: boolean
  // what the file reader warned about — logged with the upload (2026-10-08)
  // capped — it goes word for word into History (security review L5)
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @Length(0, 300, { each: true }) notes?: string[]
  @IsOptional() @IsArray() @ArrayMaxSize(2000) @ValidateNested({ each: true }) @Type(() => PreshopAssemblyDto) preshop_assemblies?: PreshopAssemblyDto[]
  @IsOptional() @IsArray() @ArrayMaxSize(2000) @ValidateNested({ each: true }) @Type(() => MoAssemblyLineInputDto) assembly_lines?: MoAssemblyLineInputDto[]
}

/** PUT /mo/:id/lines/:lineId/parts — a pre-shop assembly's full part list, per set (2026-10-08). */
export class UpdatePreshopPartsDto {
  @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => PreshopPartDto) parts: PreshopPartDto[]
}

/** POST /mo/:id/bom-link — the user's decisions after comparing a pre-shop MO with the real BOM (2026-10-08). */
export class LinkBomFinalDto {
  @IsNumber() @Min(0) @Max(999999) qty: number
  // every value the user picked (2026-10-09: name / W / H / area too)
  @IsOptional() @IsString() @MaxLength(200) name?: string | null
  // capped to the Decimal columns, so a huge number is a 400, not a 500 (security review L3)
  @IsOptional() @IsNumber() @Min(0) @Max(99999999) length_mm?: number | null
  @IsOptional() @IsNumber() @Min(0) @Max(99999999) width_mm?: number | null
  @IsOptional() @IsNumber() @Min(0) @Max(99999999) height_mm?: number | null
  @IsOptional() @IsNumber() @Min(0) @Max(999999999) weight_kg?: number | null
  @IsOptional() @IsNumber() @Min(0) @Max(99999999) surface_area_m2?: number | null
  @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => PreshopPartDto) parts: PreshopPartDto[]
}
export class LinkBomMarkDto {
  @IsString() @Length(1, 60) assembly_mark: string
  @IsIn(['apply', 'keep', 'remove']) action: 'apply' | 'keep' | 'remove'
  @IsOptional() @ValidateNested() @Type(() => LinkBomFinalDto) final?: LinkBomFinalDto
  // renamed in the real BOM (2026-10-09): the BOM assembly this mark is, and how its parts map
  @IsOptional() @IsInt() @IsPositive() pair_with?: number
  @IsOptional() @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => PartMapDto) part_map?: PartMapDto[]
}
export class PartMapDto {
  @IsString() @Length(1, 60) from: string
  @IsOptional() @IsString() @Length(1, 60) to: string | null
}
export class LinkBomAddDto {
  @IsInt() @IsPositive() bom_assembly_id: number
  @IsNumber() @Min(0) @Max(999999) qty: number
}
export class LinkBomDto {
  @IsInt() @IsPositive() dispatch_id: number // the BOM the user compared against — refused if a newer one arrived
  @IsOptional() @IsArray() @ArrayMaxSize(2000) @ValidateNested({ each: true }) @Type(() => LinkBomMarkDto) marks?: LinkBomMarkDto[]
  @IsOptional() @IsArray() @ArrayMaxSize(2000) @ValidateNested({ each: true }) @Type(() => LinkBomAddDto) add?: LinkBomAddDto[]
}
