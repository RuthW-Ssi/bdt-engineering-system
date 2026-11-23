import { BadRequestException, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { PreshopService } from '../manufacturing-orders/preshop/preshop.service'
import type { PreshopAssembly } from '../manufacturing-orders/preshop/preshop-pdf-parser'
import { XlsxParserService } from './xlsx-parser.service'

// Pre-shop at the BOM page (2026-11-23, wiki features/bom-preshop-upload-plan).
// Stored like the MO pre-shop upload (bom_dispatch source PRE_SHOP, via
// PreshopService.createDispatch) but with revision ≥ 1: each save is a new
// revision and the previous BOM-page one goes INACTIVE. MO-made pre-shop
// dispatches keep revision 0 and MO lines point at them, so nothing here
// reads or touches revision 0.

export interface PreshopListPart { part_mark: string; profile: string; grade: string; length_mm: number | null; unit_weight_kg: number | null; no: number | null }

export type PreshopScope = { project_id: number; zone_id: number; sub_zone_id: number | null }

const BOM_PRESHOP_LOCK = 4202 // per-zone advisory lock (MO create uses 4201)
const BOM_PAGE_PRESHOP = { source: 'PRE_SHOP', revision: { gte: 1 } } as const
const n = (v: Prisma.Decimal | null) => (v == null ? null : Number(v))

@Injectable()
export class BomPreshopService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly preshop: PreshopService,
    private readonly xlsx: XlsxParserService,
  ) {}

  private where(scope: PreshopScope) {
    return { project_id: scope.project_id, zone_id: scope.zone_id, sub_zone_id: scope.sub_zone_id ?? null, ...BOM_PAGE_PRESHOP }
  }

  /** A Tekla Part List (.xls/.xlsx) → parts. `no` = pieces over the zone. Not stored. */
  partsFromPartList(buffer: Buffer): PreshopListPart[] {
    const NOT_PART_LIST = 'Part List: ไม่พบ part ในไฟล์นี้ — ตรวจว่าเป็นไฟล์ Part List'
    let parsed: ReturnType<XlsxParserService['parse']>
    try {
      parsed = this.xlsx.parse(buffer, 'PART_LIST')
    } catch {
      throw new BadRequestException(NOT_PART_LIST)
    }
    if (!parsed.parts.length) throw new BadRequestException(NOT_PART_LIST)
    // Tekla lists one mark on several rows when plate sizes round apart
    // (PL12x225.9 / PL12x226): first row's size, as the real upload does
    // (buildDedupedParts), pieces added up so the zone count stays right.
    const byMark = new Map<string, PreshopListPart>()
    for (const p of parsed.parts) {
      const cur = byMark.get(p.part_mark)
      if (cur) { if (p.qty != null) cur.no = (cur.no ?? 0) + p.qty; continue }
      byMark.set(p.part_mark, {
        part_mark: p.part_mark, profile: p.profile ?? '', grade: p.grade ?? '',
        length_mm: p.length_mm ?? null, unit_weight_kg: p.weight_kg ?? null, no: p.qty ?? null,
      })
    }
    return [...byMark.values()]
  }

  /** The zone's current BOM-page pre-shop (ACTIVE rows, parts per set), or null. */
  async current(scope: PreshopScope): Promise<{ dispatch_id: number; revision: number; uploaded_at: string; assemblies: PreshopAssembly[] } | null> {
    const d = await this.prisma.bom_dispatch.findFirst({ where: this.where(scope), orderBy: { id: 'desc' }, select: { id: true, revision: true, uploaded_at: true } })
    if (!d) return null
    const rows = await this.prisma.bom_assembly.findMany({
      where: { dispatch_id: d.id, status: 'ACTIVE' },
      orderBy: { id: 'asc' },
      select: {
        assembly_mark: true, name: true, qty: true, weight_kg: true, surface_area_m2: true, length_mm: true, width_mm: true, height_mm: true,
        assembly_parts: {
          orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
          select: { qty: true, part: { select: { part_mark: true, profile: true, grade: true, length_mm: true, weight_kg: true } } },
        },
      },
    })
    return {
      dispatch_id: d.id,
      revision: d.revision,
      uploaded_at: d.uploaded_at.toISOString(),
      assemblies: rows.map(a => ({
        assembly_mark: a.assembly_mark, name: a.name, qty: Number(a.qty ?? 0),
        weight_kg: n(a.weight_kg), surface_area_m2: n(a.surface_area_m2), length_mm: n(a.length_mm), width_mm: n(a.width_mm), height_mm: n(a.height_mm),
        parts: a.assembly_parts.map(l => ({
          part_mark: l.part.part_mark, profile: l.part.profile ?? '', length_mm: n(l.part.length_mm) ?? 0, grade: l.part.grade ?? '',
          qty: Number(l.qty), unit_weight_kg: n(l.part.weight_kg) ?? 0,
        })),
      })),
    }
  }

  /** Save as a new BOM-page pre-shop revision; the previous one goes INACTIVE. */
  async save(scope: PreshopScope, assemblies: PreshopAssembly[], userId: number): Promise<{ dispatch_id: number; revision: number }> {
    const noParts = assemblies.filter(a => !a.parts.length).map(a => a.assembly_mark)
    if (noParts.length) throw new BadRequestException(`ใส่ part ให้ครบทุก mark ก่อนบันทึก: ${noParts.join(', ')}`)
    // one bom_part per mark ("first spec wins" in createDispatch) — refuse instead of silently dropping a size
    const spec = new Map<string, string>()
    const clash = new Set<string>()
    for (const a of assemblies) for (const p of a.parts) {
      const k = `${p.profile.trim()}|${p.grade.trim()}|${p.length_mm}|${p.unit_weight_kg}`
      const cur = spec.get(p.part_mark)
      if (cur == null) spec.set(p.part_mark, k)
      else if (cur !== k) clash.add(p.part_mark)
    }
    if (clash.size) throw new BadRequestException(`Part mark ซ้ำแต่ขนาดไม่ตรงกัน: ${[...clash].join(', ')}`)

    return this.prisma.$transaction(async (tx) => {
      // two saves for one zone at the same moment would both read the same "previous" revision
      await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(${BOM_PRESHOP_LOCK}::int, ${scope.zone_id}::int)) l`
      const prev = await tx.bom_dispatch.findFirst({ where: this.where(scope), orderBy: { id: 'desc' }, select: { id: true, revision: true } })
      const realBom = await tx.bom_assembly.count({ where: { status: 'ACTIVE', dispatch: { zone_id: scope.zone_id, source: 'BOM_UPLOAD' } } })
      if (realBom > 0) throw new BadRequestException('Zone นี้มี BOM แล้ว — ใช้ BOM จริงแทน pre-shop')

      if (prev) {
        await tx.bom_assembly.updateMany({ where: { dispatch_id: prev.id }, data: { status: 'INACTIVE' } })
        await tx.bom_part.updateMany({ where: { dispatch_id: prev.id }, data: { status: 'INACTIVE' } })
      }
      const revision = (prev?.revision ?? 0) + 1
      await this.preshop.createDispatch(tx, scope, assemblies, userId, { revision })
      // createDispatch returns mark → assembly id; read back the dispatch it just wrote (under the lock)
      const created = await tx.bom_dispatch.findFirst({ where: { ...this.where(scope), revision }, orderBy: { id: 'desc' }, select: { id: true } })
      return { dispatch_id: created!.id, revision }
    })
  }
}
