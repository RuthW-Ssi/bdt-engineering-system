import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'

export interface ZoneConsumableRow {
  resource_code: string
  resource_name: string
  unit: string | null
  consumption_basis: string | null
  total_qty: number | null
  breakdown: {
    assembly_mark: string
    assembly_qty: number
    qty_per_piece: number | null
    total_qty: number | null
  }[]
}

export interface ZoneWorkcenterRow {
  workcenter_code: string
  workcenter_name: string
  total_minutes: number
  breakdown: {
    assembly_mark: string
    assembly_qty: number
    minutes_per_piece: number
    total_minutes: number
  }[]
}

export interface AssemblyZoneSummary {
  assembly_id: number
  assembly_mark: string
  assembly_qty: number
  weight_kg: number | null
  surface_area_m2: number | null
  template_code: string | null
  consumables: { resource_code: string; resource_name: string; unit: string | null; qty_per_piece: number | null; total_qty: number | null }[]
  workcenter_times: { workcenter_code: string; workcenter_name: string; minutes_per_piece: number; total_minutes: number }[]
}

export interface ZoneSummaryDto {
  dispatch_id: number
  applied_count: number
  total_matched: number
  consumables: ZoneConsumableRow[]
  workcenter_times: ZoneWorkcenterRow[]
  by_assembly: AssemblyZoneSummary[]
}

@Injectable()
export class ZoneSummaryService {
  constructor(private readonly prisma: PrismaService) {}

  // Sprint 11b: rebuild on Activity Library — Sprint 4 routing chain dropped
  async compute(dispatchId: number): Promise<ZoneSummaryDto> {
    return {
      dispatch_id: dispatchId,
      applied_count: 0,
      total_matched: 0,
      consumables: [],
      workcenter_times: [],
      by_assembly: [],
    }
  }
}
