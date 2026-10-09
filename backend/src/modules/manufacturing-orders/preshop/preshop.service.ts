import { BadRequestException, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { PartMarkInput } from '../mo-part/dispatch-note-parser'
import { valueChanges, valueText, type AsmValues } from './asm-fields'
import type { PreshopAssembly } from './preshop-pdf-parser'

const dec = (v: number | null | undefined) => (v == null ? null : new Prisma.Decimal(v))
const round2 = (v: number) => Math.round(v * 100) / 100

// Pre-shop MO (2026-10-07, user: MO type replaces mark prefix; PRE_SHOP takes
// its marks from a Dispatch Note or pre-shop drawing upload). The upload is
// stored as a BOM dispatch with source PRE_SHOP for the MO's project/zone, so
// the MO lines, WOs, WO parts and progress use the normal BOM machinery
// unchanged. When the real BOM is uploaded for the zone it supersedes these
// rows (same zone + mark) and WOs offer "Accept new version" — the link to the
// real BOM data.
@Injectable()
export class PreshopService {
  /** Dispatch Note marks → assemblies (the note's WeightKg. covers all sets). */
  fromDispatchNote(marks: PartMarkInput[]): PreshopAssembly[] {
    return marks.map(m => ({
      assembly_mark: m.mark.trim(),
      name: m.name ?? null,
      qty: m.set_qty,
      // the file's weight and paint area cover all sets → per set
      weight_kg: m.weight_kg == null || !m.set_qty ? null : round2(m.weight_kg / m.set_qty),
      surface_area_m2: m.area_m2 == null || !m.set_qty ? null : Math.round((m.area_m2 / m.set_qty) * 10000) / 10000,
      // W / H back (2026-10-09, user: "เอากลับมาด้วย" — reverses 2026-10-07 "ไม่เอาค่า h b")
      length_mm: m.length_mm, width_mm: m.width_mm, height_mm: m.height_mm,
      parts: [],
    }))
  }

  /** Several pre-shop drawing PDFs → one list; a mark already read is skipped (warned). */
  mergeFiles(files: { filename: string; assemblies: PreshopAssembly[] }[]) {
    const assemblies: PreshopAssembly[] = []
    const from = new Map<string, string>()
    const warnings: string[] = []
    for (const f of files) {
      if (!f.assemblies.length) warnings.push(`${f.filename}: no BILL OF MATERIAL found`)
      for (const a of f.assemblies) {
        const first = from.get(a.assembly_mark)
        if (first) { warnings.push(`${f.filename}: ${a.assembly_mark} already read from ${first} — skipped`); continue }
        from.set(a.assembly_mark, f.filename)
        assemblies.push({ ...a, source_file: f.filename })
      }
    }
    return { assemblies, warnings }
  }

  /** Writes the PRE_SHOP dispatch; returns assembly_mark → bom_assembly.id. */
  async createDispatch(
    tx: Prisma.TransactionClient,
    scope: { project_id: number; zone_id: number; sub_zone_id?: number | null },
    assemblies: PreshopAssembly[],
    userId: number,
  ): Promise<Map<string, number>> {
    const seen = new Set<string>()
    for (const a of assemblies) {
      const mark = a.assembly_mark.trim()
      if (!mark) throw new BadRequestException('Assembly mark is required')
      if (seen.has(mark)) throw new BadRequestException(`Duplicate assembly mark ${mark}`)
      seen.add(mark)
      if (!(a.qty > 0)) throw new BadRequestException(`${mark}: sets must be more than 0`)
      for (const p of a.parts) if (!(p.qty > 0)) throw new BadRequestException(`${mark} / ${p.part_mark}: qty must be more than 0`)
    }

    const dispatch = await tx.bom_dispatch.create({
      data: {
        project_id: scope.project_id, zone_id: scope.zone_id, sub_zone_id: scope.sub_zone_id ?? null,
        source: 'PRE_SHOP', status: 'ready', upload_mode: 'combined', revision: 0,
        assembly_total: assemblies.length,
        part_total: new Set(assemblies.flatMap(a => a.parts.map(p => p.part_mark))).size,
        create_uid: userId, write_uid: userId,
      },
    })
    const created = await tx.bom_assembly.createManyAndReturn({
      data: assemblies.map(a => ({
        dispatch_id: dispatch.id,
        assembly_mark: a.assembly_mark.trim(),
        name: a.name?.trim() || null,
        qty: new Prisma.Decimal(a.qty),
        weight_kg: dec(a.weight_kg), surface_area_m2: dec(a.surface_area_m2),
        length_mm: dec(a.length_mm), width_mm: dec(a.width_mm), height_mm: dec(a.height_mm),
        create_uid: userId, write_uid: userId,
      })),
      select: { id: true, assembly_mark: true },
    })
    const asmId = new Map(created.map(a => [a.assembly_mark, a.id]))

    // One bom_part per part mark (first spec wins); qty = pieces over all sets.
    const parts = new Map<string, { spec: PreshopAssembly['parts'][number]; total: number }>()
    for (const a of assemblies) for (const p of a.parts) {
      const cur = parts.get(p.part_mark)
      if (cur) cur.total += p.qty * a.qty
      else parts.set(p.part_mark, { spec: p, total: p.qty * a.qty })
    }
    if (parts.size) {
      const partRows = await tx.bom_part.createManyAndReturn({
        data: [...parts.values()].map(({ spec, total }) => ({
          dispatch_id: dispatch.id, part_mark: spec.part_mark, profile: spec.profile, grade: spec.grade,
          qty: new Prisma.Decimal(total), length_mm: dec(spec.length_mm), weight_kg: dec(spec.unit_weight_kg),
          create_uid: userId, write_uid: userId,
        })),
        select: { id: true, part_mark: true },
      })
      const partId = new Map(partRows.map(p => [p.part_mark, p.id]))
      await tx.bom_assembly_part.createMany({
        data: assemblies.flatMap(a => a.parts.map((p, i) => ({
          assembly_id: asmId.get(a.assembly_mark.trim())!, part_id: partId.get(p.part_mark)!,
          qty: new Prisma.Decimal(p.qty), sequence: i, create_uid: userId,
        }))),
      })
    }
    return asmId
  }

  /** Every difference between a mark in the MO and the same mark in an upload
   *  or the real BOM — empty = the same (2026-10-09, user: "ต้องเปรียบเทียบกัน
   *  ทุกค่า"): name, L, W, H, kg/set, area/set and every part field, exactly.
   *  An upload (default) skips what the file doesn't carry (a Dispatch Note has
   *  no parts, a PDF no name / W / H); `strict` (the real BOM) doesn't. */
  sizeChanges(
    was: Partial<AsmValues> & { parts: PreshopAssembly['parts'] },
    now: Partial<AsmValues> & { parts: PreshopAssembly['parts'] },
    opts: { strict?: boolean } = {},
  ): string[] {
    const out = valueChanges(was, now, { onlyGiven: !opts.strict }).map(c => `${c.label} ${valueText(c.from)} → ${valueText(c.to)}`)
    if (now.parts.length || opts.strict) {
      const spec = (p: PreshopAssembly['parts'][number]) => `${p.profile}${p.grade ? ` ${p.grade}` : ''} L${p.length_mm} ×${p.qty} ${p.unit_weight_kg}kg`
      const before = new Map(was.parts.map(p => [p.part_mark, spec(p)]))
      const after = new Map(now.parts.map(p => [p.part_mark, spec(p)]))
      for (const [m, s] of before) {
        const t = after.get(m)
        if (t != null && t !== s) out.push(`${m}: ${s} → ${t}`)
      }
      for (const m of before.keys()) if (!after.has(m)) out.push(`ไม่มี part ${m}`)
      for (const m of after.keys()) if (!before.has(m)) out.push(`part ใหม่ ${m}`)
    }
    return out
  }

  /** Pairs one assembly's parts with another version's (2026-10-09): same part
   *  mark first, then the same spec (profile + L + count per set) — a part
   *  renamed in the real BOM. What finds no partner is `to: null`. */
  pairParts(was: PreshopAssembly['parts'], now: PreshopAssembly['parts']): { from: string; to: string | null; how: 'name' | 'spec' | 'none' }[] {
    const spec = (p: PreshopAssembly['parts'][number]) => `${p.profile.trim()}|${p.length_mm}|${p.qty}`
    const free = new Map(now.map(p => [p.part_mark, p]))
    const out: { from: string; to: string | null; how: 'name' | 'spec' | 'none' }[] = []
    const rest: PreshopAssembly['parts'] = []
    for (const p of was) {
      if (free.has(p.part_mark)) { out.push({ from: p.part_mark, to: p.part_mark, how: 'name' }); free.delete(p.part_mark) }
      else rest.push(p)
    }
    for (const p of rest) {
      const hit = [...free.values()].find(q => spec(q) === spec(p))
      if (hit) { out.push({ from: p.part_mark, to: hit.part_mark, how: 'spec' }); free.delete(hit.part_mark) }
      else out.push({ from: p.part_mark, to: null, how: 'none' })
    }
    return out
  }

  /** How likely two assemblies are the same piece under different marks, 0–100:
   *  parts with the same spec 60, same L 15, kg/set within 2 % 15, one mark
   *  containing the other 10. A suggestion only — the user confirms. */
  pairScore(
    wasMark: string, was: { length_mm: number | null; weight_kg: number | null; parts: PreshopAssembly['parts'] },
    nowMark: string, now: { length_mm: number | null; weight_kg: number | null; parts: PreshopAssembly['parts'] },
  ): number {
    const spec = (p: PreshopAssembly['parts'][number]) => `${p.profile.trim()}|${p.length_mm}|${p.qty}`
    const nowSpecs = now.parts.map(spec)
    let same = 0
    for (const k of was.parts.map(spec)) { const i = nowSpecs.indexOf(k); if (i >= 0) { same++; nowSpecs.splice(i, 1) } }
    const partScore = Math.max(was.parts.length, now.parts.length) ? same / Math.max(was.parts.length, now.parts.length) : 0
    const lScore = was.length_mm != null && now.length_mm != null && Math.abs(was.length_mm - now.length_mm) <= 1 ? 1 : 0
    const kgScore = was.weight_kg && now.weight_kg && Math.abs(was.weight_kg - now.weight_kg) <= was.weight_kg * 0.02 ? 1 : 0
    const norm = (m: string) => m.toUpperCase().replace(/[^A-Z0-9]/g, '')
    const a = norm(wasMark), b = norm(nowMark)
    const nameScore = a && b && (a.includes(b) || b.includes(a)) ? 1 : 0
    return Math.round(100 * (0.6 * partScore + 0.15 * lScore + 0.15 * kgScore + 0.1 * nameScore))
  }
}
