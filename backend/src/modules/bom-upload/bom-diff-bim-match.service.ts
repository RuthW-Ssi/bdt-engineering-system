import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { BomDiffService } from './bom-diff.service'
import { stripContractPrefix } from './xlsx-parser.service'

export interface DiffBimModelMatch {
  model_id: number
  version: string // "major.minor"
  matches: Record<string, string[]> // assembly_mark -> global_ids[], filtered to marks referenced by this diff
}

export interface DispatchDiffBimModelsResult {
  old: DiffBimModelMatch | null // 2nd-most-recent complete model, or null if <2 exist
  new: DiffBimModelMatch | null // most-recent complete model, or null if 0 exist
}

// Deliberate duplicate of project-progress.service.ts's private
// matchAssembliesToBim()/findLatestCompleteModel() — NOT extracted into a
// shared service. Reasoning (full detail in
// wiki/features/bom-diff-3d-model-compare.md): BomUploadModule and
// ProjectsModule have zero dependency on each other today, and
// project-progress.service.spec.ts constructs ProjectProgressService
// directly (`new ProjectProgressService(prisma)`, no TestingModule) at 9
// call sites — extracting a shared dependency out of it touches all 9 in
// an already-shipped, currently-green spec, for a feature that doesn't own
// that code. If a third consumer ever needs this matching logic, or the
// matching rule (exact + stripped-prefix) changes, promote BOTH call sites
// to a shared BimModule service in the same change — don't let them drift
// independently.
@Injectable()
export class BomDiffBimMatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly diffSvc: BomDiffService,
  ) {}

  async getDiffBimModels(
    dispatchId: number,
    overrides?: { oldModelId?: number; newModelId?: number },
  ): Promise<DispatchDiffBimModelsResult | null> {
    const diff = await this.diffSvc.computeDiff(dispatchId)
    if (!diff) return null

    const dispatch = await this.prisma.bom_dispatch.findUnique({
      where: { id: dispatchId },
      select: { project_id: true },
    })
    if (!dispatch) throw new NotFoundException(`Dispatch ${dispatchId} not found`)

    const marks = new Set<string>()
    for (const row of diff.assembly_diff) {
      if (row.prev) marks.add(row.prev.assembly_mark)
      if (row.curr) marks.add(row.curr.assembly_mark)
    }

    const models = await this.getLatestTwoCompleteModels(dispatch.project_id)
    const [defaultNew, defaultOld] = models // orderBy desc — index 0 is newest

    // Version-picker overrides: each side can independently point at any
    // complete model of the project; an unspecified side keeps its default.
    const oldModel = overrides?.oldModelId != null
      ? await this.findCompleteModelOrThrow(dispatch.project_id, overrides.oldModelId)
      : defaultOld
    const newModel = overrides?.newModelId != null
      ? await this.findCompleteModelOrThrow(dispatch.project_id, overrides.newModelId)
      : defaultNew

    return {
      old: oldModel ? await this.buildEntry(oldModel, marks) : null,
      new: newModel ? await this.buildEntry(newModel, marks) : null,
    }
  }

  private async findCompleteModelOrThrow(projectId: number, modelId: number) {
    const model = await this.prisma.bim_model.findFirst({
      where: { id: modelId, project_id: projectId, translation_status: 'complete' },
      select: { id: true, major_version: true, minor_version: true },
    })
    if (!model) throw new NotFoundException(`BIM model ${modelId} not found (or not complete) in this project`)
    return model
  }

  private async getLatestTwoCompleteModels(projectId: number) {
    return this.prisma.bim_model.findMany({
      where: { project_id: projectId, translation_status: 'complete' },
      orderBy: [{ major_version: 'desc' }, { minor_version: 'desc' }],
      take: 2,
      select: { id: true, major_version: true, minor_version: true },
    })
  }

  private async buildEntry(
    model: { id: number; major_version: number; minor_version: number },
    marks: Set<string>,
  ): Promise<DiffBimModelMatch> {
    const byMark = await this.getMarkToGlobalIds(model.id)
    const matches: Record<string, string[]> = {}
    for (const mark of marks) {
      const globalIds = byMark.get(mark)
      if (globalIds?.length) matches[mark] = globalIds
    }
    return {
      model_id: model.id,
      version: `${model.major_version}.${model.minor_version}`,
      matches,
    }
  }

  // Same matching rule as project-progress.service.ts's private
  // matchAssembliesToBim() — exact mark first, then Tekla contract-prefix
  // stripped (BOM marks are stored stripped, BIM marks come raw off IFC
  // TAG). Returns the FULL model's mark map (not scoped to any assembly
  // list, unlike Progress's version) since this feature only has assembly
  // marks from the diff, never assembly_id — getDiffBimModels() filters
  // this down to the diff's own marks afterward.
  private async getMarkToGlobalIds(modelId: number): Promise<Map<string, string[]>> {
    const bimElements = await this.prisma.bim_element.findMany({
      where: { model_id: modelId, ifc_type: 'IfcElementAssembly', mark: { not: null }, global_id: { not: null } },
      select: { mark: true, global_id: true },
    })

    const byMark = new Map<string, string[]>()
    for (const el of bimElements) {
      const raw = el.mark as string
      const keys = new Set([raw, stripContractPrefix(raw)])
      for (const key of keys) {
        const list = byMark.get(key)
        if (list) list.push(el.global_id as string)
        else byMark.set(key, [el.global_id as string])
      }
    }
    return byMark
  }
}
