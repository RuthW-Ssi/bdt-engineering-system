import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import * as crypto from 'crypto'
import { PrismaService } from '../../prisma/prisma.service'
import { CuttingPlanApiClient, CuttingPlanApiFields } from './cutting-plan-api.client'
import {
  mapNestingRows, mapOrderPartRows, mapPlateUsageRows, mapRemnantRows,
  dedupRemnants, buildNestingIdMap, resolveNestingId,
} from './cutting-plan-row-mapper'
import { countDistinctPlates } from './cutting-plan-nc-file-check'
import { QueryCuttingPlanDto } from './dto/query-cutting-plan.dto'
import { BulkAssignOrderPartProjectCodeDto } from './dto/bulk-assign-order-part-project-code.dto'

export interface CuttingPlanUploadFields {
  // Optional convenience pick at upload time — a real project.project_code,
  // chosen from the project dropdown (not project_id/name). When given, it's
  // pre-filled onto every cutting_plan_order_part row this upload creates
  // (still per-part, still editable/correctable later via bulk-assign) and
  // reused as the value sent to the external API instead of a placeholder.
  project_code?: string
  tag: string
  description?: string
  version: string
  revision: string
}

export interface CuttingPlanFileInput {
  buffer: Buffer
  originalname: string
}

export interface CuttingPlanPreviewWarning {
  filename: string
  plateCountDetected: number
}

export interface CuttingPlanPreviewResult {
  summary: {
    plateCount: number
    partCount: number
    plateUsageCount: number
    remnantCount: number
  }
  warnings: CuttingPlanPreviewWarning[]
  // Set when the API response can't be mapped to our schema (e.g. an
  // unexpected column count) — upload() would fail if the user confirmed,
  // so the frontend must block "Confirm & Save" when this is set.
  mappingError: string | null
}

const REQUIRED_FIELDS: (keyof CuttingPlanUploadFields)[] = ['tag', 'version', 'revision']

const UPLOAD_INCLUDE = {
  create_user: { select: { id: true, name: true, login: true } },
} satisfies Prisma.cutting_plan_uploadInclude

@Injectable()
export class CuttingPlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly apiClient: CuttingPlanApiClient,
  ) {}

  private validate(files: CuttingPlanFileInput[], fields: CuttingPlanUploadFields) {
    if (!files.length) throw new BadRequestException('At least one file is required')
    for (const key of REQUIRED_FIELDS) {
      if (!fields[key] || !String(fields[key]).trim()) {
        throw new BadRequestException(`${key} is required`)
      }
    }
  }

  private buildWarnings(files: CuttingPlanFileInput[]): CuttingPlanPreviewWarning[] {
    const warnings: CuttingPlanPreviewWarning[] = []
    for (const f of files) {
      const count = countDistinctPlates(f.buffer.toString('utf-8'))
      if (count > 1) warnings.push({ filename: f.originalname, plateCountDetected: count })
    }
    return warnings
  }

  private buildApiFields(fields: CuttingPlanUploadFields): CuttingPlanApiFields {
    return {
      file_id: crypto.randomUUID(),
      // the external API still requires a non-empty value regardless — if
      // the user picked a project at upload time, send that (nicer than a
      // placeholder, though the response's project_code column is never
      // read back either way — see cutting-plan-row-mapper.ts)
      project_code: fields.project_code?.trim() || '-',
      tag: fields.tag,
      // same story — the external API requires all fields non-empty; our own
      // schema treats description as optional, so fall back to a placeholder
      // here without forcing the value we persist to be non-null
      description: fields.description?.trim() || '-',
      version: fields.version,
      revision: fields.revision,
    }
  }

  async preview(files: CuttingPlanFileInput[], fields: CuttingPlanUploadFields): Promise<CuttingPlanPreviewResult> {
    this.validate(files, fields)
    const response = await this.apiClient.submit(files, this.buildApiFields(fields))

    // Try the same row-mapping upload() will do, without persisting — a
    // shape mismatch (e.g. the external API emitting extra columns for a
    // non-first plate inside a bundled multi-plate file, a variant of the
    // known multi-plate bug) must surface here, not as a surprise failure
    // after the user has already clicked "Confirm & Save".
    let mappingError: string | null = null
    try {
      mapNestingRows(response.data.nesting)
      mapOrderPartRows(response.data.order_part)
      mapPlateUsageRows(response.data.plate_usage)
      mapRemnantRows(response.data.remnants ?? [])
    } catch (err) {
      mappingError = err instanceof Error ? err.message : 'Unable to parse the API response'
    }

    return {
      summary: {
        plateCount: response.data.nesting.length,
        partCount: response.data.order_part.length,
        plateUsageCount: response.data.plate_usage.length,
        remnantCount: response.data.remnants?.length ?? 0,
      },
      warnings: this.buildWarnings(files),
      mappingError,
    }
  }

  async upload(files: CuttingPlanFileInput[], fields: CuttingPlanUploadFields, userId: number) {
    this.validate(files, fields)
    const apiFields = this.buildApiFields(fields)
    const response = await this.apiClient.submit(files, apiFields)

    const nestingInputs = mapNestingRows(response.data.nesting)
    const orderPartInputs = mapOrderPartRows(response.data.order_part)
    const plateUsageInputs = mapPlateUsageRows(response.data.plate_usage)
    const remnantInputs = dedupRemnants(mapRemnantRows(response.data.remnants ?? []))

    const uploadId = await this.prisma.$transaction(async tx => {
      const upload = await tx.cutting_plan_upload.create({
        data: {
          file_id: apiFields.file_id,
          tag: fields.tag,
          description: fields.description?.trim() || null,
          version: fields.version,
          revision: fields.revision,
          raw_response: response as unknown as Prisma.InputJsonValue,
          create_uid: userId,
        },
      })

      const nestingRows = nestingInputs.length
        ? await tx.cutting_plan_nesting.createManyAndReturn({
            data: nestingInputs.map(n => ({ ...n, upload_id: upload.id })),
          })
        : []
      const nestingIdMap = buildNestingIdMap(nestingRows)

      if (orderPartInputs.length) {
        const pickedProjectCode = fields.project_code?.trim() || null
        await tx.cutting_plan_order_part.createMany({
          data: orderPartInputs.map(o => ({
            ...o,
            upload_id: upload.id,
            nesting_id: resolveNestingId(o.cuttingplan_number, nestingIdMap),
            project_code: pickedProjectCode,
          })),
        })
      }
      if (plateUsageInputs.length) {
        await tx.cutting_plan_plate_usage.createMany({
          data: plateUsageInputs.map(p => ({
            ...p,
            upload_id: upload.id,
            nesting_id: resolveNestingId(p.cuttingplan_number, nestingIdMap),
          })),
        })
      }
      if (remnantInputs.length) {
        await tx.cutting_plan_remnant.createMany({
          data: remnantInputs.map(r => ({
            ...r,
            upload_id: upload.id,
            nesting_id: resolveNestingId(r.cuttingplan_number, nestingIdMap),
          })),
        })
      }

      return upload.id
    })

    return this.findOne(uploadId)
  }

  async list(query: QueryCuttingPlanDto) {
    const where: Prisma.cutting_plan_uploadWhereInput = {}
    if (query.search) {
      where.OR = [
        { tag: { contains: query.search, mode: 'insensitive' } },
        { order_parts: { some: { project_code: { contains: query.search, mode: 'insensitive' } } } },
      ]
    }
    return this.prisma.cutting_plan_upload.findMany({
      where,
      orderBy: { create_date: 'desc' },
      include: {
        ...UPLOAD_INCLUDE,
        _count: { select: { nestings: true, order_parts: true, plate_usages: true, remnants: true } },
      },
    })
  }

  async findOne(id: number) {
    const upload = await this.prisma.cutting_plan_upload.findUnique({
      where: { id },
      include: {
        ...UPLOAD_INCLUDE,
        nestings: true,
        order_parts: true,
        plate_usages: true,
        remnants: true,
      },
    })
    if (!upload) throw new NotFoundException(`Cutting plan upload ${id} not found`)
    return upload
  }

  async remove(id: number) {
    const upload = await this.prisma.cutting_plan_upload.findUnique({ where: { id } })
    if (!upload) throw new NotFoundException(`Cutting plan upload ${id} not found`)
    // child rows (nesting/order_part/plate_usage/remnant) cascade on upload_id — see schema.prisma
    await this.prisma.cutting_plan_upload.delete({ where: { id } })
    return { deleted: true }
  }

  // Bulk-edit: select N order_part rows in the UI, apply one project_code to
  // all of them at once. Not scoped to a single upload_id on purpose — a
  // curated project_code is a per-part fact, not tied to which batch the
  // part happened to arrive in.
  async bulkAssignOrderPartProjectCode(dto: BulkAssignOrderPartProjectCodeDto) {
    const result = await this.prisma.cutting_plan_order_part.updateMany({
      where: { id: { in: dto.order_part_ids } },
      data: { project_code: dto.project_code.trim() },
    })
    return { updated: result.count }
  }
}
