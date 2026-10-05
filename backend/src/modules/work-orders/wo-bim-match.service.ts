import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { stripContractPrefix } from '../bom-upload/xlsx-parser.service'

export type WoBimMatchStatus = 'ok' | 'mark_not_found' | 'model_not_ready' | 'no_model'

export interface WoBimModelOption {
  id: number
  version: string
  translation_status: string
  create_date: Date
}

export interface WoBimMatchResult {
  status: WoBimMatchStatus
  mark: string
  model_id: number | null
  model_version: string | null
  translation_status: string | null
  global_id: string | null
  // Every instance of the mark in the model (global_id is the first) — the
  // Visual tab's whole-model mode highlights all of them.
  global_ids: string[]
  // Every instance of every WO mark from the same project (the selected one
  // included) — the Visual tab's "highlight every mark on this WO" mode.
  wo_global_ids: string[]
  match_count: number
  // Every model of the mark's project, newest first — feeds the Visual tab's
  // version picker. Listed here rather than via `GET /bim-models` because that
  // endpoint needs `bim:view`, which a WO viewer may not hold.
  models: WoBimModelOption[]
}

// Sprint 28 · F-WO Visual Tab — resolves a WO to a single isolated BIM
// element for the WO Detail "Visual" tab. Deliberately a third independent
// copy of the mark-matching query already in `project-progress.service.ts`
// (`matchAssembliesToBim`) and `bom-diff-bim-match.service.ts`
// (`getMarkToGlobalIds`) rather than a forced shared refactor — matches
// this codebase's own established convention for this exact kind of logic.
// Default model = the newest `complete` one (2026-10-05 version picker; was
// the newest of any status). Only when NO model has finished does it fall
// back to the newest overall, so `model_not_ready` stays distinct from
// `no_model`.
@Injectable()
export class WoBimMatchService {
  constructor(private readonly prisma: PrismaService) {}

  // `bomAssemblyId` lets a caller request a specific mark's BIM match — a
  // WO can now span many marks — needed later by a frontend mark-selector
  // (not built here). Omitted, it defaults to the WO's first non-removed
  // mark, preserving today's single-mark behavior (2026-09-17 multi-mark
  // redesign stopgap).
  //
  // `modelId` pins a specific model version (Visual tab picker). It must
  // belong to the mark's own project — anything else 404s.
  async getBimMatch(woId: number, bomAssemblyId?: number, modelId?: number): Promise<WoBimMatchResult> {
    const wo = await this.prisma.work_order.findUnique({
      where: { id: woId },
      select: {
        marks: {
          where: { removed_at: null },
          orderBy: { id: 'asc' },
          select: {
            bom_assembly_id: true,
            bom_assembly: {
              select: { assembly_mark: true, dispatch: { select: { project_id: true } } },
            },
          },
        },
      },
    })
    if (!wo) throw new NotFoundException(`WO ${woId} not found`)

    const matchedMark = bomAssemblyId != null
      ? wo.marks.find(m => m.bom_assembly_id === bomAssemblyId)
      : wo.marks[0]
    if (!matchedMark) {
      throw new NotFoundException(
        bomAssemblyId != null ? `WO ${woId} has no mark for bom_assembly ${bomAssemblyId}` : `WO ${woId} has no marks`,
      )
    }

    const mark = matchedMark.bom_assembly.assembly_mark
    const projectId = matchedMark.bom_assembly.dispatch.project_id

    const projectModels = await this.prisma.bim_model.findMany({
      where: { project_id: projectId },
      orderBy: [{ major_version: 'desc' }, { minor_version: 'desc' }, { id: 'desc' }],
      select: { id: true, major_version: true, minor_version: true, translation_status: true, create_date: true },
    })
    const models: WoBimModelOption[] = projectModels.map(m => ({
      id: m.id,
      version: `${m.major_version}.${m.minor_version}`,
      translation_status: m.translation_status,
      create_date: m.create_date,
    }))

    let model: WoBimModelOption | undefined
    if (modelId != null) {
      model = models.find(m => m.id === modelId)
      if (!model) throw new NotFoundException(`BIM model ${modelId} not found in this work order's project`)
    } else {
      model = models.find(m => m.translation_status === 'complete') ?? models[0]
    }

    if (!model) {
      return { status: 'no_model', mark, model_id: null, model_version: null, translation_status: null, global_id: null, global_ids: [], wo_global_ids: [], match_count: 0, models }
    }

    const model_version = model.version

    if (model.translation_status !== 'complete') {
      return {
        status: 'model_not_ready',
        mark,
        model_id: model.id,
        model_version,
        translation_status: model.translation_status,
        global_id: null,
        global_ids: [],
        wo_global_ids: [],
        match_count: 0,
        models,
      }
    }

    // Index by both raw and prefix-stripped mark, same as
    // `matchAssembliesToBim` — BOM marks are stored prefix-stripped, BIM
    // marks come raw off IFC TAG.
    const bimElements = await this.prisma.bim_element.findMany({
      where: { model_id: model.id, ifc_type: 'IfcElementAssembly', mark: { not: null }, global_id: { not: null } },
      select: { mark: true, global_id: true },
    })

    // Same-project marks only: a WO can span projects, and another
    // project's mark matching an element here would be a name coincidence.
    const woMarks = new Set(
      wo.marks.filter(m => m.bom_assembly.dispatch.project_id === projectId).map(m => m.bom_assembly.assembly_mark),
    )
    const globalIds: string[] = []
    const woGlobalIds: string[] = []
    for (const el of bimElements) {
      const raw = el.mark as string
      const stripped = stripContractPrefix(raw)
      if (raw === mark || stripped === mark) globalIds.push(el.global_id as string)
      if (woMarks.has(raw) || woMarks.has(stripped)) woGlobalIds.push(el.global_id as string)
    }

    if (!globalIds.length) {
      return { status: 'mark_not_found', mark, model_id: model.id, model_version, translation_status: model.translation_status, global_id: null, global_ids: [], wo_global_ids: woGlobalIds, match_count: 0, models }
    }

    // Multiple physical instances can share one mark (same fabrication spec
    // = identical geometry in this domain) — any single match is visually
    // correct, so isolate just the first one rather than all of them.
    return {
      status: 'ok',
      mark,
      model_id: model.id,
      model_version,
      translation_status: model.translation_status,
      global_id: globalIds[0],
      global_ids: globalIds,
      wo_global_ids: woGlobalIds,
      match_count: globalIds.length,
      models,
    }
  }
}
