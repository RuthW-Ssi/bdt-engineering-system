import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { PrismaService } from '../../prisma/prisma.service'
import { FileStorageService } from '../file-storage/file-storage.service'
import { XlsxParserService, ParsedBomFile } from './xlsx-parser.service'
import type { BomDocType } from './filename-classifier'
import type { QueryDispatchDto } from './dto/dispatch.dto'

const ALLOWED_MIMES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/csv',
]
const MAX_BYTES = 50 * 1024 * 1024 // 50 MB

export interface FileInput {
  buffer: Buffer
  originalname: string
  mimetype: string
  size: number
  docType: BomDocType
}

@Injectable()
export class BomUploadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: FileStorageService,
    private readonly parser: XlsxParserService,
  ) {}

  // ─── Upload ──────────────────────────────────────────────────

  async upload(
    files: FileInput[],
    projectId: number,
    zoneId: number,
    subZoneId: number | null,
    uid: number,
  ) {
    // 1. Validate inputs
    this.validateFiles(files)

    // 2. Parse all files (fail fast before any DB writes)
    const parsed = new Map<BomDocType, ParsedBomFile>()
    for (const f of files) {
      parsed.set(f.docType, this.parser.parse(f.buffer, f.docType))
    }

    // 3. Save files to storage (outside transaction — I/O first)
    const now = new Date()
    const datePrefix = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`
    const savedKeys: { docType: BomDocType; key: string; sha256: string }[] = []

    for (const f of files) {
      const sha256 = crypto.createHash('sha256').update(f.buffer).digest('hex')
      const key = `bom/${datePrefix}/${f.docType.toLowerCase()}/${Date.now()}-${f.originalname}`
      const fullPath = path.join(this.storage.storageRoot(), key)
      fs.mkdirSync(path.dirname(fullPath), { recursive: true })
      fs.writeFileSync(fullPath, f.buffer)
      savedKeys.push({ docType: f.docType, key, sha256 })
    }

    // 4. Atomic transaction: dispatch + doc_revisions + assemblies + parts + junctions
    try {
      const dispatch = await this.prisma.$transaction(async tx => {
        const asmList = parsed.get('ASSEMBLY_LIST')
        const partList = parsed.get('PART_LIST')
        const asmPartList = parsed.get('ASSEMBLY_PART_LIST')

        // bom_dispatch
        const d = await tx.bom_dispatch.create({
          data: {
            project_id: projectId,
            zone_id: zoneId,
            sub_zone_id: subZoneId,
            status: 'pending',
            create_uid: uid,
            write_uid: uid,
          },
        })

        // bom_doc_revision per file
        for (const { docType, key, sha256 } of savedKeys) {
          const f = files.find(x => x.docType === docType)!
          await tx.bom_doc_revision.create({
            data: {
              dispatch_id: d.id,
              doc_type: docType,
              original_filename: f.originalname,
              storage_key: key,
              file_size_bytes: BigInt(f.size),
              file_mime_type: f.mimetype,
              file_checksum_sha256: sha256,
              create_uid: uid,
            },
          })
        }

        // bom_assembly rows — batch insert, get IDs back in one round-trip
        const assemblyIdByMark = new Map<string, number>()
        if (asmList?.assemblies.length) {
          const rows = await tx.bom_assembly.createManyAndReturn({
            data: asmList.assemblies.map(a => ({
              dispatch_id: d.id,
              assembly_mark: a.assembly_mark,
              name: a.name,
              qty: a.qty,
              weight_kg: a.weight_kg,
              surface_area_m2: a.surface_area_m2,
              create_uid: uid,
              write_uid: uid,
            })),
          })
          for (const row of rows) assemblyIdByMark.set(row.assembly_mark, row.id)
        }

        // bom_part rows — batch insert, get IDs back in one round-trip
        const partIdByMark = new Map<string, number>()
        if (partList?.parts.length) {
          const rows = await tx.bom_part.createManyAndReturn({
            data: partList.parts.map(p => ({
              dispatch_id: d.id,
              part_mark: p.part_mark,
              description: p.description,
              profile: p.profile,
              grade: p.grade,
              qty: p.qty,
              length_mm: p.length_mm,
              weight_kg: p.weight_kg,
              create_uid: uid,
              write_uid: uid,
            })),
          })
          for (const row of rows) partIdByMark.set(row.part_mark, row.id)
        }

        // bom_assembly_part junctions — batch insert
        if (asmPartList?.assemblyParts.length) {
          const junctions = asmPartList.assemblyParts.flatMap(ap => {
            const assembly_id = assemblyIdByMark.get(ap.assembly_mark)
            const part_id = partIdByMark.get(ap.part_mark)
            if (!assembly_id || !part_id) return []
            return [{ assembly_id, part_id, qty: ap.qty ?? 1, sequence: ap.sequence, create_uid: uid }]
          })
          if (junctions.length) await tx.bom_assembly_part.createMany({ data: junctions })
        }

        // Determine final status
        const hasAssembly = (asmList?.assemblies.length ?? 0) > 0
        const hasPart = (partList?.parts.length ?? 0) > 0
        const status = hasAssembly && hasPart ? 'complete' : hasAssembly || hasPart ? 'partial' : 'pending'

        return tx.bom_dispatch.update({
          where: { id: d.id },
          data: {
            status,
            assembly_total: asmList?.assemblies.length ?? null,
            part_total: partList?.parts.length ?? null,
            write_uid: uid,
          },
        })
      }, { timeout: 30000 })

      return this.findOne(dispatch.id)
    } catch (err) {
      // Rollback: delete saved files
      for (const { key } of savedKeys) {
        try { fs.unlinkSync(path.join(this.storage.storageRoot(), key)) } catch {}
      }
      throw err
    }
  }

  // ─── List ─────────────────────────────────────────────────────

  async list(query: QueryDispatchDto) {
    const page = query.page ?? 1
    const limit = query.limit ?? 20
    const skip = (page - 1) * limit

    const where = {
      ...(query.project_id ? { project_id: query.project_id } : {}),
      ...(query.zone_id ? { zone_id: query.zone_id } : {}),
      ...(query.sub_zone_id ? { sub_zone_id: query.sub_zone_id } : {}),
      ...(query.status ? { status: query.status } : {}),
    }

    const [total, items] = await Promise.all([
      this.prisma.bom_dispatch.count({ where }),
      this.prisma.bom_dispatch.findMany({
        where,
        skip,
        take: limit,
        orderBy: { uploaded_at: 'desc' },
        include: {
          zone: { select: { id: true, code: true, label: true } },
          sub_zone: { select: { id: true, name: true, code: true } },
          create_user: { select: { id: true, name: true } },
          doc_revisions: { select: { doc_type: true } },
        },
      }),
    ])

    // Aggregate totals across the current page
    const assemblyTotal = items.reduce((s, d) => s + (d.assembly_total ?? 0), 0)
    const partTotal = items.reduce((s, d) => s + (d.part_total ?? 0), 0)

    return {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      assembly_total: assemblyTotal,
      part_total: partTotal,
      items: items.map(d => this.toSummaryDto(d)),
    }
  }

  // ─── Detail ───────────────────────────────────────────────────

  async findOne(id: number) {
    const d = await this.prisma.bom_dispatch.findUnique({
      where: { id },
      include: {
        zone: { select: { id: true, code: true, label: true } },
        sub_zone: { select: { id: true, name: true, code: true } },
        create_user: { select: { id: true, name: true } },
        doc_revisions: {
          select: {
            id: true,
            dispatch_id: true,
            doc_type: true,
            original_filename: true,
            create_date: true,
            create_user: { select: { id: true, name: true } },
          },
          orderBy: { create_date: 'asc' },
        },
        assemblies: {
          orderBy: { assembly_mark: 'asc' },
          select: {
            assembly_mark: true,
            name: true,
            qty: true,
            weight_kg: true,
            assembly_parts: {
              orderBy: { sequence: 'asc' },
              select: {
                qty: true,
                part: {
                  select: {
                    part_mark: true,
                    description: true,
                    profile: true,
                    grade: true,
                    weight_kg: true,
                  },
                },
              },
            },
          },
        },
        _count: { select: { assemblies: true, parts: true } },
      },
    })

    if (!d) throw new NotFoundException(`Dispatch ${id} not found`)

    // Parts with no assembly junction (orphans)
    const orphans = await this.prisma.bom_part.findMany({
      where: { dispatch_id: id, assembly_parts: { none: {} } },
      orderBy: { part_mark: 'asc' },
      select: { part_mark: true, description: true, profile: true, grade: true, qty: true, weight_kg: true },
    })

    return {
      ...this.toSummaryDto(d),
      doc_revisions: d.doc_revisions.map(r => ({
        id: r.id,
        dispatch_id: r.dispatch_id,
        doc_type: r.doc_type,
        filename: r.original_filename,
        uploaded_at: r.create_date.toISOString(),
        uploader: r.create_user,
      })),
      assemblies: d.assemblies.map(a => ({
        assembly_mark: a.assembly_mark,
        name: a.name ?? null,
        assembly_qty: Number(a.qty ?? 1),
        total_weight_kg: a.weight_kg ? Number(a.weight_kg) : null,
        parts: a.assembly_parts.map(ap => ({
          part_mark: ap.part.part_mark,
          description: ap.part.description ?? null,
          profile: ap.part.profile ?? null,
          grade: ap.part.grade ?? null,
          part_qty: Number(ap.qty),
          unit_weight_kg: ap.part.weight_kg ? Number(ap.part.weight_kg) : null,
        })),
      })),
      orphan_parts: orphans.map(p => ({
        part_mark: p.part_mark,
        description: p.description ?? null,
        profile: p.profile ?? null,
        grade: p.grade ?? null,
        part_qty: Number(p.qty),
        unit_weight_kg: p.weight_kg ? Number(p.weight_kg) : null,
      })),
    }
  }

  // ─── Revisions ────────────────────────────────────────────────

  async getRevisions(id: number) {
    const exists = await this.prisma.bom_dispatch.findUnique({ where: { id }, select: { id: true } })
    if (!exists) throw new NotFoundException(`Dispatch ${id} not found`)

    const revisions = await this.prisma.bom_doc_revision.findMany({
      where: { dispatch_id: id },
      orderBy: { create_date: 'asc' },
      include: { create_user: { select: { id: true, name: true } } },
    })

    return revisions.map(r => ({
      id: r.id,
      dispatch_id: r.dispatch_id,
      doc_type: r.doc_type,
      filename: r.original_filename,
      uploaded_at: r.create_date.toISOString(),
      uploader: r.create_user,
    }))
  }

  // ─── Helpers ─────────────────────────────────────────────────

  private toSummaryDto(d: {
    id: number
    project_id: number
    zone_id: number
    sub_zone_id: number | null
    status: string
    uploaded_at: Date
    assembly_total: number | null
    part_total: number | null
    zone: { id: number; code: string; label: string }
    sub_zone: { id: number; name: string; code: string | null } | null
    create_user: { id: number; name: string }
    doc_revisions?: { doc_type: string }[]
  }) {
    return {
      id: d.id,
      project_id: d.project_id,
      zone_id: d.zone_id,
      sub_zone_id: d.sub_zone_id,
      status: d.status,
      doc_count: d.doc_revisions?.length ?? 0,
      uploaded_at: d.uploaded_at.toISOString(),
      zone: d.zone,
      sub_zone: d.sub_zone,
      uploader: d.create_user,
      assembly_count: d.assembly_total,
      part_count: d.part_total,
      total_weight_kg: null, // computed on demand in detail view if needed
    }
  }

  private validateFiles(files: FileInput[]) {
    if (!files.length) throw new BadRequestException('At least one file is required')
    for (const f of files) {
      if (f.size > MAX_BYTES) {
        throw new BadRequestException(`File ${f.originalname} exceeds 50 MB limit`)
      }
      if (!ALLOWED_MIMES.includes(f.mimetype) && !f.originalname.match(/\.(xlsx|xls|csv)$/i)) {
        throw new BadRequestException(`File ${f.originalname} is not a valid Excel/CSV file`)
      }
    }
    const docTypes = files.map(f => f.docType)
    if (new Set(docTypes).size !== docTypes.length) {
      throw new BadRequestException('Duplicate doc_type — each type may only appear once per dispatch')
    }
  }
}
