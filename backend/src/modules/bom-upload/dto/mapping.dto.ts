export interface MappedAssemblyDto {
  id: number
  assembly_mark: string
  product_id: number | null
  match_status: string | null
  product_code: string | null
  product_name: string | null
}

export interface MappedPartDto {
  id: number
  part_mark: string
  product_id: number | null
  match_status: string | null
  product_code: string | null
  product_name: string | null
}

export interface MappingSummaryDto {
  total_assemblies: number
  total_parts: number
  MATCHED_STANDARD: number
  MATCHED_CUSTOM: number
  UNMATCHED: number
}

export interface DispatchMappingDto {
  dispatch_id: number
  assemblies: MappedAssemblyDto[]
  parts: MappedPartDto[]
  summary: MappingSummaryDto
}
