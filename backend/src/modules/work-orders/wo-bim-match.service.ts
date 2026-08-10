import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { stripContractPrefix } from '../bom-upload/xlsx-parser.service'

export type WoBimMatchStatus = 'ok' | 'mark_not_found' | 'model_not_ready' | 'no_model'

export interface WoBimMatchResult {
  status: WoBimMatchStatus
  mark: string
  model_id: number | null
  model_version: string | null
  translation_status: string | null
  global_id: string | null
  match_count: number
}

// Sprint 28 · F-WO Visual Tab — resolves a WO to a single isolated BIM
// element for the WO Detail "Visual" tab. Deliberately a third independent
// copy of the mark-matching query already in `project-progress.service.ts`
// (`matchAssembliesToBim`) and `bom-diff-bim-match.service.ts`
// (`getMarkToGlobalIds`) rather than a forced shared refactor — matches
// this codebase's own established convention for this exact kind of logic.
// Unlike `project-progress.service.ts`'s `findLatestCompleteModel`, this
// does NOT filter by `translation_status: 'complete'` up front, so
// `model_not_ready` can be reported distinctly from `no_model`.
@Injectable()
export class WoBimMatchService {
  constructor(private readonly prisma: PrismaService) {}

  async getBimMatch(woId: number): Promise<WoBimMatchResult> {
    const wo = await this.prisma.work_order.findUnique({
      where: { id: woId },
      select: {
        bom_assembly: {
          select: { assembly_mark: true, dispatch: { select: { project_id: true } } },
        },
      },
    })
    if (!wo) throw new NotFoundException(`WO ${woId} not found`)

    const mark = wo.bom_assembly.assembly_mark
    const projectId = wo.bom_assembly.dispatch.project_id

    const model = await this.prisma.bim_model.findFirst({
      where: { project_id: projectId },
      orderBy: [{ major_version: 'desc' }, { minor_version: 'desc' }],
      select: { id: true, major_version: true, minor_version: true, translation_status: true },
    })

    if (!model) {
      return { status: 'no_model', mark, model_id: null, model_version: null, translation_status: null, global_id: null, match_count: 0 }
    }

    const model_version = `${model.major_version}.${model.minor_version}`

    if (model.translation_status !== 'complete') {
      return {
        status: 'model_not_ready',
        mark,
        model_id: model.id,
        model_version,
        translation_status: model.translation_status,
        global_id: null,
        match_count: 0,
      }
    }

    // Index by both raw and prefix-stripped mark, same as
    // `matchAssembliesToBim` — BOM marks are stored prefix-stripped, BIM
    // marks come raw off IFC TAG.
    const bimElements = await this.prisma.bim_element.findMany({
      where: { model_id: model.id, ifc_type: 'IfcElementAssembly', mark: { not: null }, global_id: { not: null } },
      select: { mark: true, global_id: true },
    })

    const globalIds: string[] = []
    for (const el of bimElements) {
      const raw = el.mark as string
      if (raw === mark || stripContractPrefix(raw) === mark) globalIds.push(el.global_id as string)
    }

    if (!globalIds.length) {
      return { status: 'mark_not_found', mark, model_id: model.id, model_version, translation_status: model.translation_status, global_id: null, match_count: 0 }
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
      match_count: globalIds.length,
    }
  }
}
