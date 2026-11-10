import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import * as crypto from 'crypto'
import { PrismaService } from '../../prisma/prisma.service'
import { FileStorageService } from '../file-storage/file-storage.service'
import { groupPlateFiles, plateFileProblems, plateKey, PlateFileKind } from './cutting-plan-file-set'
import { parseMachineTimes, parsePlateDxf } from './cutting-plan-dxf'
import { CuttingPlanApiClient, CuttingPlanApiFields, CuttingPlanApiResponse, CuttingPlanReportErrors } from './cutting-plan-api.client'
import {
  mapNestingRows, mapOrderPartRows, mapPlateUsageRows, mapRemnantRows,
  dedupRemnants, buildNestingIdMap, resolveNestingId,
} from './cutting-plan-row-mapper'
import { reportCharge, reportFingerprint } from './cutting-plan-nc-file-check'
import { FileReportProblem, parserFileProblems, reportProblems } from './cutting-plan-report-check'
import { QueryCuttingPlanDto } from './dto/query-cutting-plan.dto'
import { BulkAssignOrderPartProjectCodeDto } from './dto/bulk-assign-order-part-project-code.dto'

export interface CuttingPlanUploadFields {
  // Picked on the upload form (2026-11-06): project + zone required, sub-zone
  // optional. The project's code pre-fills every order_part.project_code
  // (still per-part and editable later via bulk-assign).
  project_id?: number
  zone_id?: number
  sub_zone_id?: number | null
  lot?: string // free text, optional
  description?: string
  version: string
  revision: string
}

export interface CuttingPlanFileInput {
  buffer: Buffer
  originalname: string
}

export interface CuttingPlanPreviewResult {
  summary: {
    plateCount: number
    partCount: number
    plateUsageCount: number
    remnantCount: number
  }
  // 2026-11-09: problems inside the .txt reports (ours, then whatever the parser rejects), every one listed.
  // Non-empty → cannot save; the user fixes those reports and uploads again.
  reportProblems: FileReportProblem[]
  // Set when the API response can't be mapped to our schema (e.g. an
  // unexpected column count) — upload() would fail if the user confirmed,
  // so the frontend must block "Confirm & Save" when this is set.
  mappingError: string | null
  // D6 (2026-11-06): every plate needs .txt + .xls + .pdf + .dxf. Non-empty → cannot save.
  fileProblems: string[]
  // 2026-11-10: plates whose NC File is already in the system. Same report → skipped at save (a plate is
  // never saved twice); changed report → saved, this upload becomes the plate's newer version.
  alreadyInSystem: PlateInSystem[]
}

export interface PlateInSystem { plate: string; ncFile: string; uploadId: number; sameReport: boolean }

// A file the browser already PUT to cutting-plan/_incoming/<project>/<uuid>/<name> (D8).
export interface StagedFile { upload_key: string; file_name: string }

// A real nesting report always starts with the "NESTING" section. Drive history has a 0-byte
// .txt (0X203-Z1-16-17, 2026-11-06) that crashed the parser with a Python error → catch it here.
const notAReport = (f: CuttingPlanFileInput) => f.buffer.length === 0 || !f.buffer.toString('latin1', 0, 4096).includes('NESTING')
const badReportMessage = (names: string[]) => `Empty or not a nesting report (.txt): ${names.join(', ')}`

// cutting-plan/<plate|shape>/<project>/<zone|ALL>/[<sub-zone>/]<upload-id>/ — one folder per upload (D7); no zone = ALL
// One tenant must not claim another project's staged files (cf. drawings assertUploadKeyOwnership)
export function checkStagedKeys(staged: StagedFile[], projectCode: string) {
  const stagingPrefix = `${INCOMING_PREFIX}${projectCode}/`
  const keyShape = /^cutting-plan\/_incoming\/[^/\\]+\/[0-9a-f-]{36}\/[^/\\]+$/
  const seen = new Set<string>()
  for (const f of staged) {
    if (!keyShape.test(f.upload_key) || !f.upload_key.startsWith(stagingPrefix) || seen.has(f.upload_key)) {
      throw new BadRequestException(`${f.file_name} was not uploaded correctly. Please upload again.`)
    }
    seen.add(f.upload_key)
  }
}

export function storageFolder(kind: 'plate' | 'shape', projectCode: string, zoneCode: string | null, subZoneCode: string | null, uploadId: number) {
  return `cutting-plan/${kind}/${projectCode}/${zoneCode ?? 'ALL'}/${subZoneCode ? subZoneCode + '/' : ''}${uploadId}/`
}

const REQUIRED_FIELDS = ['project_id', 'version', 'revision'] as const
const LOT_MAX = 60
export const MAX_PLATES = 250 // = 1,000 files; the biggest real upload so far is 244 plates (Drive, 2026-11-06)
const MAX_FILE_BYTES = 30 * 1024 * 1024 // per file; the biggest real .pdf/.dxf seen is ~1.5 MB
// Every .txt is held in memory at preview and save, so a report gets its own cap: the biggest of the
// 5,620 on Drive is 58 KB (2026-11-10). 250 plates × 1 MB keeps one save under ~250 MB.
export const MAX_TXT_BYTES = 1024 * 1024
const tooManyPlates = (n: number) => `${n} plates in one upload; the limit is ${MAX_PLATES}. Split it into smaller uploads.`
const txtTooBig = (names: string[]) => `Not a nesting report, larger than 1 MB: ${names.join(', ')}`
const INCOMING_PREFIX = 'cutting-plan/_incoming/'
const INCOMING_MAX_AGE_MS = 24 * 60 * 60 * 1000
const CONTENT_TYPE: Record<PlateFileKind, string> = { txt: 'text/plain', xls: 'application/vnd.ms-excel', pdf: 'application/pdf', dxf: 'application/dxf' }

const UPLOAD_INCLUDE = {
  create_user: { select: { id: true, name: true, login: true } },
  project: { select: { id: true, project_code: true, name: true } },
  zone: { select: { id: true, code: true, label: true } },
  sub_zone: { select: { id: true, code: true, name: true } },
} satisfies Prisma.cutting_plan_uploadInclude

@Injectable()
export class CuttingPlanService {
  private readonly logger = new Logger(CuttingPlanService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly apiClient: CuttingPlanApiClient,
    private readonly fileStorage: FileStorageService,
  ) {}

  // Checks the form and the project → zone → sub-zone chain, before the parser
  // is called. Returns the codes for the parser field, the pre-fill and the storage folder.
  async validatePicks(fields: CuttingPlanUploadFields) {
    for (const key of REQUIRED_FIELDS) {
      const v = fields[key]
      if (v == null || !String(v).trim()) throw new BadRequestException(`${key} is required`)
    }
    if ((fields.lot?.trim().length ?? 0) > LOT_MAX) throw new BadRequestException(`lot must be at most ${LOT_MAX} characters`)

    const project = await this.prisma.project.findUnique({ where: { id: fields.project_id }, select: { id: true, project_code: true } })
    if (!project) throw new BadRequestException(`Project ${fields.project_id} not found`)
    // No zone = "All zones (whole project)" (2026-11-10)
    if (fields.zone_id == null) {
      if (fields.sub_zone_id != null) throw new BadRequestException('Sub-zone needs a zone. Pick a zone or clear the sub-zone.')
      return { projectCode: project.project_code, zoneCode: null, subZoneCode: null }
    }
    const zone = await this.prisma.project_zone.findUnique({ where: { id: fields.zone_id }, select: { id: true, project_id: true, code: true } })
    if (!zone || zone.project_id !== project.id) throw new BadRequestException(`Zone ${fields.zone_id} is not in the chosen project`)
    let subZoneCode: string | null = null
    if (fields.sub_zone_id != null) {
      const sub = await this.prisma.sub_zone.findUnique({ where: { id: fields.sub_zone_id }, select: { id: true, zone_id: true, active: true, code: true } })
      if (!sub || !sub.active || sub.zone_id !== zone.id) throw new BadRequestException(`Sub-zone ${fields.sub_zone_id} is not in the chosen zone`)
      subZoneCode = sub.code || `sz${sub.id}`
    }
    return { projectCode: project.project_code, zoneCode: zone.code as string | null, subZoneCode }
  }

  private reportProblemsOf(files: CuttingPlanFileInput[]): FileReportProblem[] {
    return files.flatMap(f => reportProblems(f.buffer.toString('utf-8')).map(p => ({ file: f.originalname, ...p })))
  }

  private buildApiFields(fields: CuttingPlanUploadFields, projectCode: string): CuttingPlanApiFields {
    return {
      file_id: crypto.randomUUID(),
      // The parser requires every field non-empty and echoes them back as
      // columns we never read (see cutting-plan-row-mapper.ts), so tag (dropped
      // 2026-11-06) and an empty description go as "-".
      project_code: projectCode,
      tag: '-',
      description: fields.description?.trim() || '-',
      version: fields.version,
      revision: fields.revision,
    }
  }

  // Preview posts only the .txt files (small) plus the names of all files picked,
  // so the four-files-per-plate check (D6) runs before anything goes to storage.
  async preview(files: CuttingPlanFileInput[], fields: CuttingPlanUploadFields, allFileNames: string[]): Promise<CuttingPlanPreviewResult> {
    if (!files.length) throw new BadRequestException('At least one .txt file is required')
    const { projectCode } = await this.validatePicks(fields)
    const bad = files.filter(notAReport).map(f => f.originalname)
    const grouping = groupPlateFiles(allFileNames.length ? allFileNames : files.map(f => f.originalname))
    if (grouping.plates.length > MAX_PLATES) throw new BadRequestException(tooManyPlates(grouping.plates.length))
    const problems = plateFileProblems(grouping)
    if (bad.length) problems.push(badReportMessage(bad))
    files = files.filter(f => !notAReport(f))
    const nothing = { summary: { plateCount: 0, partCount: 0, plateUsageCount: 0, remnantCount: 0 }, mappingError: null, fileProblems: problems, alreadyInSystem: [] }
    if (!files.length) return { ...nothing, reportProblems: [] }
    // Reports with a problem of their own are listed and kept away from the parser; the parser checks the
    // rest, so one preview lists every problem in the upload
    const reportIssues = this.reportProblemsOf(files)
    const clean = files.filter(f => !reportIssues.some(p => p.file === f.originalname))
    let response: CuttingPlanApiResponse | null = null
    if (clean.length) {
      try {
        response = await this.apiClient.submit(clean, this.buildApiFields(fields, projectCode))
      } catch (err) {
        if (!(err instanceof CuttingPlanReportErrors)) throw err
        reportIssues.push(...parserFileProblems(err.files))
      }
    }
    if (!response) return { ...nothing, reportProblems: reportIssues }

    // Try the same row-mapping upload() will do, without persisting — a
    // shape mismatch (e.g. the external API emitting extra columns for a
    // non-first plate inside a bundled multi-plate file, a variant of the
    // known multi-plate bug) must surface here, not as a surprise failure
    // after the user has already clicked "Confirm & Save".
    let mappingError: string | null = null
    let nestingInputs: { cuttingplan_number: string; nc_file: string | null }[] = []
    try {
      nestingInputs = this.plateNamer(clean, grouping)(mapNestingRows(response.data.nesting))
      mapOrderPartRows(response.data.order_part)
      mapPlateUsageRows(response.data.plate_usage)
      mapRemnantRows(response.data.remnants ?? [])
    } catch (err) {
      mappingError = err instanceof Error ? err.message : 'Unable to parse the API response'
    }
    // Outside the try: a storage or DB failure here is a real error, not a mapping one
    const alreadyInSystem = mappingError ? [] : await this.platesAlreadyInSystem(nestingInputs, clean, grouping)

    return {
      summary: {
        plateCount: response.data.nesting.length,
        partCount: response.data.order_part.length,
        plateUsageCount: response.data.plate_usage.length,
        remnantCount: response.data.remnants?.length ?? 0,
      },
      reportProblems: reportIssues,
      mappingError,
      fileProblems: problems,
      alreadyInSystem,
    }
  }

  // Rows carry the plate name from the report's Charge, which is not always the file name: long ones
  // wrap ("0X203-Z1-10-1 0" for 0X203-Z1-10-10) and some files are named differently (CP_2024_09_0413325:
  // Z332-10-1.txt says Charge Z322-10-1). Name every row after the file whose report carries its Charge,
  // so rows, files, the 3D view and filters all agree. Names that still match nothing fall back to the
  // name rule (equal ignoring case and spaces).
  private plateNamer(txtFiles: CuttingPlanFileInput[], grouping: ReturnType<typeof groupPlateFiles>) {
    const plateOfTxt = new Map(grouping.plates.map(p => [p.files.txt!, p.plate]))
    const fileOfCharge = new Map<string, string>()
    const chargeSeen = new Map<string, number>()
    for (const t of txtFiles) {
      const charge = reportCharge(t.buffer.toString('utf-8'))
      const plate = plateOfTxt.get(t.originalname)
      if (!charge || !plate) continue
      const key = plateKey(charge)
      chargeSeen.set(key, (chargeSeen.get(key) ?? 0) + 1)
      fileOfCharge.set(key, plate)
    }
    for (const [key, count] of chargeSeen) if (count > 1) fileOfCharge.delete(key) // two files, one Charge: ambiguous
    const fileNameOf = new Map(grouping.plates.map(p => [plateKey(p.plate), p.plate]))
    // A parser that tags rows with their report (source_file) settles it outright: two reports can share a
    // Charge (uploads #83/#126: a plate re-nested from another plate's remnant keeps that plate's Charge).
    const plateOfReport = new Map(grouping.plates.map(p => [p.files.txt!.replace(/\.txt$/i, ''), p.plate]))
    return <T extends { cuttingplan_number: string; source_file: string | null }>(rows: T[]) => rows.map(({ source_file, ...r }) => {
      const key = plateKey(r.cuttingplan_number)
      const plate = (source_file && plateOfReport.get(source_file)) || fileOfCharge.get(key) || fileNameOf.get(key)
      return { ...r, cuttingplan_number: plate ?? r.cuttingplan_number }
    })
  }

  // Which of these plates the system already holds, by NC File, and whether with the same report. The
  // newest holder is named; "same" when any holder's stored .txt has the same fingerprint as the new one.
  private async platesAlreadyInSystem(
    nestingInputs: { cuttingplan_number: string; nc_file: string | null }[],
    txtFiles: CuttingPlanFileInput[],
    grouping: ReturnType<typeof groupPlateFiles>,
  ): Promise<PlateInSystem[]> {
    const ncOfPlate = new Map(nestingInputs.filter(n => n.nc_file).map(n => [n.cuttingplan_number, n.nc_file!]))
    if (!ncOfPlate.size) return []
    const held = await this.prisma.cutting_plan_nesting.findMany({
      where: { nc_file: { in: [...ncOfPlate.values()] } },
      select: { nc_file: true, cuttingplan_number: true, upload_id: true },
    })
    if (!held.length) return []
    const stored = await this.prisma.cutting_plan_file.findMany({
      where: { OR: held.map(h => ({ upload_id: h.upload_id, plate_name: h.cuttingplan_number, kind: 'TXT' })) },
      select: { upload_id: true, plate_name: true, file_key: true },
    })
    const txtOfPlate = new Map(grouping.plates.map(p => [p.plate, p.files.txt!]))
    const bufOfTxt = new Map(txtFiles.map(f => [f.originalname, f.buffer]))
    const out: PlateInSystem[] = []
    for (const [plate, ncFile] of ncOfPlate) {
      const holders = held.filter(h => h.nc_file === ncFile)
      if (!holders.length) continue
      const mine = bufOfTxt.get(txtOfPlate.get(plate) ?? '')
      const fingerprint = mine ? reportFingerprint(mine.toString('utf-8')) : null
      let sameReport = false
      if (fingerprint) {
        const keys = stored.filter(s => holders.some(h => h.upload_id === s.upload_id && h.cuttingplan_number === s.plate_name)).map(s => s.file_key)
        await inBatches(keys, 8, async key => {
          if (sameReport) return
          const theirs = await this.fileStorage.getObject(key).catch(() => null)
          if (theirs && reportFingerprint(theirs.toString('utf-8')) === fingerprint) sameReport = true
        })
      }
      out.push({ plate, ncFile, uploadId: Math.max(...holders.map(h => h.upload_id)), sameReport })
    }
    return out
  }

  // One request for every staging URL (an upload can be ~1,000 files; one request per file hit
  // the API's 600/min limit, 2026-11-06). The browser then PUTs straight to storage.
  async stagingUrls(projectId: number, fileNames: string[]) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { project_code: true } })
    if (!project) throw new BadRequestException(`Project ${projectId} not found`)
    await this.sweepIncoming()
    const out: { file_name: string; upload_key: string; url: string; method: 'PUT' | 'POST'; content_type: string }[] = []
    await inBatches(fileNames.map(n => ({ n })), 16, async ({ n }) => {
      const upload_key = `${INCOMING_PREFIX}${project.project_code}/${crypto.randomUUID()}/${n.replace(/[/\\]/g, '_')}`
      const content_type = n.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream'
      const { url, method } = await this.fileStorage.getUploadUrl(upload_key, content_type)
      out.push({ file_name: n, upload_key, url, method, content_type })
    })
    return out
  }

  // Files a browser staged and never saved (tab closed, network gone) have no other way out: before handing
  // out new staging URLs, drop everything in _incoming older than a day. A staging in flight is minutes old.
  // Never fails the caller: a sweep that cannot run only costs storage.
  private async sweepIncoming() {
    const cutoff = Date.now() - INCOMING_MAX_AGE_MS
    try {
      const stale = (await this.fileStorage.list(INCOMING_PREFIX)).filter(o => o.updatedAt.getTime() < cutoff)
      if (!stale.length) return
      await this.deleteObjects(stale.map(o => o.key))
      this.logger.log(`Removed ${stale.length} staged file(s) older than a day from ${INCOMING_PREFIX}`)
    } catch (err) {
      this.logger.warn(`Could not sweep ${INCOMING_PREFIX}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // D8: the browser has already PUT every file to cutting-plan/_incoming/<project>/<uuid>/<name>.
  // Check them, parse the .txt files, save in one transaction, then move each file to
  // cutting-plan/plate/<project>/<zone>/[<sub-zone>/]<upload-id>/<name>. If a move fails the
  // upload is removed again, so a saved plan always has the files it was given.
  async upload(allStaged: StagedFile[], fields: CuttingPlanUploadFields, userId: number) {
    const { projectCode, zoneCode, subZoneCode } = await this.validatePicks(fields)
    if (!allStaged.length) throw new BadRequestException('At least one file is required')
    const grouping = groupPlateFiles(allStaged.map(f => f.file_name))
    if (grouping.plates.length > MAX_PLATES) throw new BadRequestException(tooManyPlates(grouping.plates.length))
    const problems = plateFileProblems(grouping)
    if (problems.length) throw new BadRequestException(problems.join('\n'))

    checkStagedKeys(allStaged, projectCode)
    // From here the staged files are ours: whatever refuses or fails the save removes them, since the browser
    // stages afresh for every Confirm (316 files sat in _incoming after refused saves, 2026-11-10).
    try {
      return await this.saveStaged(allStaged, fields, userId, { projectCode, zoneCode, subZoneCode }, grouping)
    } catch (err) {
      await this.deleteObjects(allStaged.map(f => f.upload_key))
      throw err
    }
  }

  private async saveStaged(
    allStaged: StagedFile[], fields: CuttingPlanUploadFields, userId: number,
    { projectCode, zoneCode, subZoneCode }: { projectCode: string; zoneCode: string | null; subZoneCode: string | null },
    grouping: ReturnType<typeof groupPlateFiles>,
  ) {
    const sizes = new Map<string, number>()
    await inBatches(allStaged, 16, async f => {
      const meta = await this.fileStorage.getMetadata(f.upload_key)
      if (!meta) throw new BadRequestException(`Uploaded file ${f.file_name} was not found. Please upload again.`)
      if (meta.size > MAX_FILE_BYTES) throw new BadRequestException(`${f.file_name} is larger than 30 MB`)
      sizes.set(f.file_name, meta.size)
    })
    // checked on the stored size, before any .txt is read into memory
    const bigTxt = allStaged.filter(f => /\.txt$/i.test(f.file_name) && sizes.get(f.file_name)! > MAX_TXT_BYTES).map(f => f.file_name)
    if (bigTxt.length) throw new BadRequestException(txtTooBig(bigTxt))
    // An empty .xls / .pdf / .dxf (CutLogic sometimes writes 0 bytes) is not kept: the plate is saved as
    // having no such file. An empty .txt is refused below by notAReport.
    const empty = allStaged.filter(f => sizes.get(f.file_name) === 0 && !/\.txt$/i.test(f.file_name))
    await inBatches(empty, 8, f => this.fileStorage.delete(f.upload_key))
    const staged = allStaged.filter(f => !empty.includes(f))
    if (empty.length) grouping = groupPlateFiles(staged.map(f => f.file_name))

    const byName = new Map(staged.map(f => [f.file_name, f]))
    const txtFiles: CuttingPlanFileInput[] = grouping.plates.map(p => ({ buffer: Buffer.alloc(0), originalname: p.files.txt! }))
    await inBatches(txtFiles, 16, async t => { t.buffer = await this.fileStorage.getObject(byName.get(t.originalname)!.upload_key) })
    const bad = txtFiles.filter(notAReport).map(t => t.originalname)
    if (bad.length) throw new BadRequestException(badReportMessage(bad))

    const listed = (ps: FileReportProblem[]) => `Cannot save: fix these reports and upload again. ${ps.map(p => `${p.file} · ${p.section} · ${p.problem}`).join('; ')}`
    const reportIssues = this.reportProblemsOf(txtFiles)
    if (reportIssues.length) throw new BadRequestException(listed(reportIssues))

    const apiFields = this.buildApiFields(fields, projectCode)
    const response = await this.apiClient.submit(txtFiles, apiFields).catch(err => {
      throw err instanceof CuttingPlanReportErrors ? new BadRequestException(listed(parserFileProblems(err.files))) : err
    })

    const named = this.plateNamer(txtFiles, grouping)
    const allNesting = named(mapNestingRows(response.data.nesting))
    // A plate the system already holds with the same report is not saved again (its files go with the
    // other staged copies below); a changed report is saved as the plate's newer version.
    const copies = new Set((await this.platesAlreadyInSystem(allNesting, txtFiles, grouping)).filter(p => p.sameReport).map(p => p.plate))
    const keep = <T extends { cuttingplan_number: string }>(rows: T[]) => rows.filter(r => !copies.has(r.cuttingplan_number))
    const nestingInputs = keep(allNesting)
    if (!nestingInputs.length) {
      throw new BadRequestException(`Every plate is already in the system with the same report (${[...copies].join(', ')}). Nothing was saved.`)
    }
    const orderPartInputs = keep(named(mapOrderPartRows(response.data.order_part)))
    const plateUsageInputs = keep(named(mapPlateUsageRows(response.data.plate_usage)))
    const remnantInputs = keep(dedupRemnants(named(mapRemnantRows(response.data.remnants ?? []))))
    const plates = grouping.plates.filter(p => !copies.has(p.plate))

    const uploadId = await this.prisma.$transaction(async tx => {
      const upload = await tx.cutting_plan_upload.create({
        data: {
          file_id: apiFields.file_id,
          project_id: fields.project_id!,
          zone_id: fields.zone_id ?? null,
          sub_zone_id: fields.sub_zone_id ?? null,
          lot: fields.lot?.trim() || null,
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
        await tx.cutting_plan_order_part.createMany({
          data: orderPartInputs.map(o => ({
            ...o,
            upload_id: upload.id,
            nesting_id: resolveNestingId(o.cuttingplan_number, nestingIdMap),
            project_code: projectCode,
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

      const folder = storageFolder('plate', projectCode, zoneCode, subZoneCode, upload.id)
      await tx.cutting_plan_file.createMany({
        data: plates.flatMap(p => (Object.entries(p.files) as [PlateFileKind, string][]).map(([kind, name]) => ({
          upload_id: upload.id, plate_name: p.plate, kind: kind.toUpperCase(), file_name: name,
          file_key: folder + name.replace(/[/\\]/g, '_'), size_bytes: sizes.get(name) ?? 0,
        }))),
      })
      return upload.id
    })

    await this.moveStagedFiles(uploadId, byName)
    return this.findOne(uploadId)
  }

  async list(query: QueryCuttingPlanDto) {
    // The Plate and Shape tabs list their own uploads; no plan_type = Plate, as before 2026-11-10
    const where: Prisma.cutting_plan_uploadWhereInput = { plan_type: query.plan_type ?? 'PLATE' }
    if (query.search) {
      const q = { contains: query.search, mode: 'insensitive' as const }
      where.OR = [
        { lot: q },
        { project: { project_code: q } },
        { project: { name: q } },
        { order_parts: { some: { project_code: q } } },
      ]
    }
    return this.prisma.cutting_plan_upload.findMany({
      where,
      orderBy: { create_date: 'desc' },
      include: {
        ...UPLOAD_INCLUDE,
        _count: { select: { nestings: true, order_parts: true, plate_usages: true, remnants: true, shape_sizes: true } },
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
        files: { orderBy: [{ plate_name: 'asc' }, { kind: 'asc' }] },
        shape_sizes: {
          orderBy: { profile: 'asc' },
          include: { layouts: { orderBy: { seq: 'asc' }, include: { parts: { orderBy: { seq: 'asc' } } } } },
        },
      },
    })
    if (!upload) throw new NotFoundException(`Cutting plan upload ${id} not found`)
    return upload
  }

  async remove(id: number) {
    const upload = await this.prisma.cutting_plan_upload.findUnique({ where: { id }, include: { files: { select: { file_key: true } } } })
    if (!upload) throw new NotFoundException(`Cutting plan upload ${id} not found`)
    // child rows (nesting/order_part/plate_usage/remnant/file) cascade on upload_id — see schema.prisma
    await this.prisma.cutting_plan_upload.delete({ where: { id } })
    await this.deleteObjects(upload.files.map(f => f.file_key))
    return { deleted: true }
  }

  // What the plate viewer draws (2D / 3D / cut simulation): geometry from the stored .dxf,
  // feeds from the .txt, sheet size from the parsed nesting row. Parsed on request (~50 ms).
  async plateView(uploadId: number, plate: string) {
    const files = await this.prisma.cutting_plan_file.findMany({ where: { upload_id: uploadId, plate_name: plate, kind: { in: ['DXF', 'TXT'] } } })
    const dxf = files.find(f => f.kind === 'DXF')
    if (!dxf) throw new NotFoundException(`Plate ${plate} has no .dxf file`)
    const txt = files.find(f => f.kind === 'TXT')
    const nesting = await this.prisma.cutting_plan_nesting.findFirst({ where: { upload_id: uploadId, cuttingplan_number: plate } })
    const geometry = parsePlateDxf((await this.fileStorage.getObject(dxf.file_key)).toString('latin1'))
    const pierces = geometry.path.filter(([t]) => t === 0).length
    const machine = txt ? parseMachineTimes((await this.fileStorage.getObject(txt.file_key)).toString('latin1'), pierces) : null
    // R12 DXFs write layer names in upper case (PARTA-P166 for A-p166). Spell each mark as the report's order
    // rows do, so the parts table and the click details find their row (X190XZ1-16-9 showed "—", 2026-11-09).
    const orderRows = nesting ? await this.prisma.cutting_plan_order_part.findMany({ where: { nesting_id: nesting.id }, select: { drawing_part_no_version_no: true } }) : []
    const reportMarks = orderRows.map(o => (o.drawing_part_no_version_no ?? '').trim()).filter(Boolean)
    const exact = new Set(reportMarks), byLower = new Map(reportMarks.map(m => [m.toLowerCase(), m]))
    const parts = geometry.parts.map(p => (exact.has(p.mark) ? p : { ...p, mark: byLower.get(p.mark.toLowerCase()) ?? p.mark }))
    const n = (v: unknown) => (v == null ? null : Number(v))
    return {
      plate,
      sheet: nesting && {
        nesting_id: nesting.id, length_mm: n(nesting.length_mm), width_mm: n(nesting.width_mm), thick_mm: n(nesting.thick_mm),
        quality: nesting.quality, weight_kg: n(nesting.weight_kg), nesting_percent: n(nesting.nesting_percent),
        charge: nesting.charge, nc_file: nesting.nc_file, plate_number: nesting.plate_number,
      },
      machine,
      parts,
      path: geometry.path,
    }
  }

  async getFile(fileId: number) {
    const file = await this.prisma.cutting_plan_file.findUnique({ where: { id: fileId } })
    if (!file) throw new NotFoundException(`Cutting plan file ${fileId} not found`)
    const kind = file.kind.toLowerCase() as PlateFileKind
    return { file, contentType: CONTENT_TYPE[kind] ?? 'application/octet-stream', buffer: await this.fileStorage.getObject(file.file_key) }
  }

  // Copy each staged file to its final key (server-side copy, 8 at a time — an upload can be
  // ~1,000 files), then drop the staged copies. Any failure: remove the upload (rows cascade)
  // and whatever finals were written.
  async moveStagedFiles(uploadId: number, byName: Map<string, StagedFile>) {
    const rows = await this.prisma.cutting_plan_file.findMany({ where: { upload_id: uploadId } })
    const written: string[] = []
    try {
      await inBatches(rows, 8, async row => {
        await this.fileStorage.copy(byName.get(row.file_name)!.upload_key, row.file_key)
        written.push(row.file_key)
      })
    } catch (err) {
      this.logger.error(`Cutting plan ${uploadId}: storing files failed, rolling back`, err instanceof Error ? err.stack : String(err))
      await this.prisma.cutting_plan_upload.delete({ where: { id: uploadId } }).catch(() => undefined)
      await this.deleteObjects(written)
      throw new InternalServerErrorException('Could not store the files. Nothing was saved. Please try again.')
    }
    await this.deleteObjects([...byName.values()].map(f => f.upload_key))
  }

  async deleteObjects(keys: string[]) {
    await inBatches(keys, 8, async key => {
      try { await this.fileStorage.delete(key) } catch (err) {
        this.logger.warn(`Could not delete ${key}: ${err instanceof Error ? err.message : String(err)}`) // orphan only costs storage
      }
    })
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

// Run `fn` over `items`, at most `n` at a time. On the first error nothing new starts, the ones
// already running finish, then the error is thrown — so a rollback sees every write that happened.
export async function inBatches<T>(items: T[], n: number, fn: (item: T) => Promise<void>) {
  let i = 0
  let failed: unknown = null
  const worker = async () => {
    while (i < items.length && failed === null) {
      try { await fn(items[i++]) } catch (err) { failed ??= err }
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker))
  if (failed !== null) throw failed
}
