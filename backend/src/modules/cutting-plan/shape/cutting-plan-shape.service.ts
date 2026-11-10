import { BadRequestException, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import * as crypto from 'crypto'
import { PrismaService } from '../../../prisma/prisma.service'
import { FileStorageService } from '../../file-storage/file-storage.service'
import { checkStagedKeys, CuttingPlanFileInput, CuttingPlanService, CuttingPlanUploadFields, inBatches, StagedFile, storageFolder } from '../cutting-plan.service'
import * as cutlogic from './cutlogic-parser'

// Cutting Plan Shape (2026-11-10, wiki features/cutting-plan-shape.md): CutLogic 1D cutting-layout PDFs, one per size.
// Only CP-*.pdf is read; PS-*.pdf (plan stocks) and Part Lists are left out. Check before save, as plate: any
// problem in any file refuses the whole upload.

export const MAX_SHAPE_FILES = 60
export const MAX_SHAPE_PDF_BYTES = 5 * 1024 * 1024 // real CP PDFs are ≤ 0.5 MB

export interface ShapeFileProblem { file: string; problem: string }
export interface ShapePreviewResult {
  sizes: { file: string; profile: string; grade: string | null; stocks: number; parts: number; yieldPct: number }[]
  problems: ShapeFileProblem[]
  warnings: string[]
  notUsed: string[]
  alreadyInSystem: { profile: string; uploadId: number; sameReport: boolean }[]
}

const isCp = (n: string) => /^CP-.*\.pdf$/i.test(n)
const isNotUsed = (n: string) => /^PS-.*\.pdf$/i.test(n) || /\.xlsx?$/i.test(n)
const gradeFromFileName = (n: string) => /-\s*([A-Z]*\d+[A-Z]*)\s*\.pdf$/i.exec(n)?.[1]?.toUpperCase() ?? null
const gradeFromTitle = (title: string) => /^Plan #\d+ - .+?\s([A-Z]+\d{3}[A-Z]?) - /i.exec(title)?.[1]?.toUpperCase() ?? null

interface ReadSize { file: string; plan: cutlogic.ShapePlan; fingerprint: string }

@Injectable()
export class CuttingPlanShapeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fileStorage: FileStorageService,
    private readonly plate: CuttingPlanService,
  ) {}

  // Reads every CP file and lists every problem; nothing is stored.
  private async readAll(files: CuttingPlanFileInput[]) {
    const problems: ShapeFileProblem[] = []
    const warnings: string[] = []
    const sizes: ReadSize[] = []
    for (const f of files) {
      let plan: cutlogic.ShapePlan, lines: string[]
      try {
        if (f.buffer.subarray(0, 5).toString('latin1') !== '%PDF-') throw new cutlogic.ShapeReportError(['Not a PDF'])
        lines = await cutlogic.pdfLines(f.buffer)
        plan = cutlogic.parseCutLogic(lines)
      } catch (err) {
        if (!(err instanceof cutlogic.ShapeReportError)) throw err
        problems.push(...err.problems.map(problem => ({ file: f.originalname, problem })))
        continue
      }
      problems.push(...cutlogic.planProblems(plan).map(problem => ({ file: f.originalname, problem })))
      // Note 2 and marks are free text; refuse what the columns (VarChar 30 / 120) cannot hold, here, not as a failed save
      if ((plan.grade?.length ?? 0) > 30) problems.push({ file: f.originalname, problem: 'Grade (Note 2) is longer than 30 characters' })
      for (const m of new Set(plan.layouts.flatMap(l => l.parts.map(p => p.mark)).filter(m => m.length > 120))) {
        problems.push({ file: f.originalname, problem: `Mark ${m.slice(0, 20)}… is longer than 120 characters` })
      }
      const named = cutlogic.profileFromFileName(f.originalname)
      if (named && named !== plan.profile) problems.push({ file: f.originalname, problem: `The file name says ${named}, the report is ${plan.profile}` })
      const twin = sizes.find(s => s.plan.profile === plan.profile)
      if (twin) problems.push({ file: f.originalname, problem: `Same size (${plan.profile}) as ${twin.file}` })
      // Real reports disagree on grade (title "SS500", Note 2 and file name "HSS500"): a warning, never a refusal
      for (const [where, g] of [['file name', gradeFromFileName(f.originalname)], ['title', gradeFromTitle(plan.title)]] as const) {
        if (g && plan.grade && g !== plan.grade.toUpperCase()) warnings.push(`${f.originalname}: the ${where} says grade ${g}, the report says ${plan.grade}`)
      }
      sizes.push({ file: f.originalname, plan, fingerprint: cutlogic.shapeFingerprint(lines) })
    }
    return { problems, warnings, sizes }
  }

  // Sizes already saved for the same project + zone + sub-zone; "sameReport" = same fingerprint as one of them
  private async inSystem(fields: CuttingPlanUploadFields, sizes: ReadSize[]) {
    if (!sizes.length) return []
    const held = await this.prisma.cutting_plan_shape_size.findMany({
      where: {
        profile: { in: sizes.map(s => s.plan.profile) },
        upload: { plan_type: 'SHAPE', project_id: fields.project_id, zone_id: fields.zone_id ?? null, sub_zone_id: fields.sub_zone_id ?? null },
      },
      select: { profile: true, fingerprint: true, upload_id: true },
    })
    return sizes.flatMap(s => {
      const h = held.filter(x => x.profile === s.plan.profile)
      if (!h.length) return []
      return [{ profile: s.plan.profile, uploadId: Math.max(...h.map(x => x.upload_id)), sameReport: h.some(x => x.fingerprint === s.fingerprint) }]
    })
  }

  async preview(files: CuttingPlanFileInput[], fields: CuttingPlanUploadFields, allFileNames: string[]): Promise<ShapePreviewResult> {
    await this.plate.validatePicks(fields)
    const names = allFileNames.length ? allFileNames : files.map(f => f.originalname)
    const notUsed = names.filter(isNotUsed)
    const other = names.filter(n => !isCp(n) && !isNotUsed(n))
    const cps = files.filter(f => isCp(f.originalname))
    if (!cps.length && !other.length) throw new BadRequestException('At least one CutLogic CP-*.pdf is required')
    if (cps.length > MAX_SHAPE_FILES) throw new BadRequestException(`${cps.length} CP files in one upload; the limit is ${MAX_SHAPE_FILES}.`)
    const { problems, warnings, sizes } = await this.readAll(cps)
    problems.push(...other.map(file => ({ file, problem: 'Not a CutLogic CP-*.pdf (PS-*.pdf and Part Lists are left out)' })))
    return {
      sizes: sizes.map(s => ({ file: s.file, profile: s.plan.profile, grade: s.plan.grade, stocks: s.plan.stocks, parts: s.plan.parts, yieldPct: s.plan.yieldPct })),
      problems, warnings, notUsed,
      alreadyInSystem: await this.inSystem(fields, sizes),
    }
  }

  async upload(staged: StagedFile[], fields: CuttingPlanUploadFields, userId: number) {
    const { projectCode, zoneCode, subZoneCode } = await this.plate.validatePicks(fields)
    if (!staged.length) throw new BadRequestException('At least one CutLogic CP-*.pdf is required')
    if (staged.length > MAX_SHAPE_FILES) throw new BadRequestException(`${staged.length} CP files in one upload; the limit is ${MAX_SHAPE_FILES}.`)
    const wrong = staged.filter(f => !isCp(f.file_name)).map(f => f.file_name)
    if (wrong.length) throw new BadRequestException(`Only CutLogic CP-*.pdf files are saved: ${wrong.join(', ')}`)
    checkStagedKeys(staged, projectCode)
    // From here the staged files are ours: any refusal or failure removes them (as plate)
    try {
      return await this.save(staged, fields, userId, projectCode, zoneCode, subZoneCode)
    } catch (err) {
      await this.plate.deleteObjects(staged.map(f => f.upload_key))
      throw err
    }
  }

  private async save(staged: StagedFile[], fields: CuttingPlanUploadFields, userId: number, projectCode: string, zoneCode: string | null, subZoneCode: string | null) {
    const sizes = new Map<string, number>()
    await inBatches(staged, 8, async f => {
      const meta = await this.fileStorage.getMetadata(f.upload_key)
      if (!meta) throw new BadRequestException(`Uploaded file ${f.file_name} was not found. Please upload again.`)
      if (meta.size > MAX_SHAPE_PDF_BYTES) throw new BadRequestException(`${f.file_name} is larger than 5 MB`)
      sizes.set(f.file_name, meta.size)
    })
    const inputs: CuttingPlanFileInput[] = []
    await inBatches(staged, 8, async f => { inputs.push({ originalname: f.file_name, buffer: await this.fileStorage.getObject(f.upload_key) }) })
    inputs.sort((a, b) => staged.findIndex(s => s.file_name === a.originalname) - staged.findIndex(s => s.file_name === b.originalname))

    const read = await this.readAll(inputs)
    if (read.problems.length) {
      throw new BadRequestException(`Cannot save: fix these files and upload again. ${read.problems.map(p => `${p.file} · ${p.problem}`).join('; ')}`)
    }
    const copies = new Set((await this.inSystem(fields, read.sizes)).filter(c => c.sameReport).map(c => c.profile))
    const keep = read.sizes.filter(s => !copies.has(s.plan.profile))
    if (!keep.length) throw new BadRequestException(`Every size is already in the system with the same report (${[...copies].join(', ')}). Nothing was saved.`)

    const uploadId = await this.prisma.$transaction(async tx => {
      const upload = await tx.cutting_plan_upload.create({
        data: {
          plan_type: 'SHAPE', file_id: crypto.randomUUID(), raw_response: {} as Prisma.InputJsonValue,
          project_id: fields.project_id!, zone_id: fields.zone_id ?? null, sub_zone_id: fields.sub_zone_id ?? null,
          lot: fields.lot?.trim() || null, description: fields.description?.trim() || null,
          version: fields.version, revision: fields.revision, create_uid: userId,
        },
      })
      for (const s of keep) {
        const p = s.plan
        await tx.cutting_plan_shape_size.create({
          data: {
            upload_id: upload.id, profile: p.profile, grade: p.grade, plan_no: p.planNo, kerf_mm: p.kerfMm,
            yield_pct: p.yieldPct, stocks: p.stocks, parts: p.parts, parts_length_mm: p.partsLengthMm, layouts_count: p.layoutsCount, fingerprint: s.fingerprint,
            layouts: {
              create: p.layouts.map(l => ({
                seq: l.seq, stock_no: l.stockNo, stock_length_mm: l.stockLengthMm, rest_mm: l.restMm, repeat: l.repeat,
                parts: { createMany: { data: l.parts.map((x, i) => ({ seq: i + 1, part_no: x.partNo, mark: x.mark, length_mm: x.lengthMm, count: x.count })) } },
              })),
            },
          },
        })
      }
      const folder = storageFolder('shape', projectCode, zoneCode, subZoneCode, upload.id)
      await tx.cutting_plan_file.createMany({
        data: keep.map(s => ({
          upload_id: upload.id, plate_name: s.plan.profile, kind: 'PDF', file_name: s.file,
          file_key: folder + s.file.replace(/[/\\]/g, '_'), size_bytes: sizes.get(s.file) ?? 0,
        })),
      })
      return upload.id
    })
    await this.plate.moveStagedFiles(uploadId, new Map(staged.map(f => [f.file_name, f])))
    return this.plate.findOne(uploadId)
  }
}
