import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { classifyProfile, markGroup } from './profile-family'
import type { PartListResult, PartListSize } from './part-list'

// CP-Shape-Test (2026-11-11): parts for a layout straight from the BOM (active parts of complete dispatches) of the
// picked zones and mark groups, in place of a part list file. Read only.

const num = (v: { toString(): string } | null) => (v == null ? null : Number(v.toString()))
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

@Injectable()
export class BomSourceService {
  constructor(private readonly prisma: PrismaService) {}

  private async rows(projectId: number, zoneIds?: number[]) {
    if (!(await this.prisma.project.findUnique({ where: { id: projectId }, select: { id: true } }))) throw new NotFoundException(`Project ${projectId} not found`)
    return this.prisma.bom_part.findMany({
      where: { status: 'ACTIVE', dispatch: { project_id: projectId, status: 'complete', ...(zoneIds ? { zone_id: { in: zoneIds } } : {}) } },
      select: { part_mark: true, profile: true, grade: true, qty: true, length_mm: true, dispatch: { select: { zone_id: true } } },
    })
  }

  async sources(projectId: number) {
    const rows = await this.rows(projectId)
    const zones = await this.prisma.project_zone.findMany({ where: { project_id: projectId, active: true, is_placeholder: false }, select: { id: true, code: true, label: true }, orderBy: { code: 'asc' } })
    return {
      zones: zones.map(z => {
        const groups = new Map<string, number>()
        for (const r of rows) {
          if (r.dispatch.zone_id !== z.id || !classifyProfile(r.profile)?.enabled) continue
          const g = markGroup(r.part_mark)
          groups.set(g, (groups.get(g) ?? 0) + (num(r.qty) ?? 0))
        }
        const list = [...groups].map(([group, pieces]) => ({ group, pieces })).sort((a, b) => a.group.localeCompare(b.group, 'en', { numeric: true }))
        return { ...z, pieces: list.reduce((n, g) => n + g.pieces, 0), groups: list }
      }),
    }
  }

  async parts(projectId: number, zoneIds: number[], groups: string[]): Promise<PartListResult> {
    if (!zoneIds.length) throw new BadRequestException('Pick at least one zone')
    const rows = (await this.rows(projectId, zoneIds)).filter(r => !groups.length || groups.includes(markGroup(r.part_mark)))
    const sizes = new Map<string, PartListSize>()
    const noLength = new Map<string, { marks: string[]; pieces: number }>()
    const spellings = new Map<string, Set<string>>()
    const later = new Map<string, { marks: number; pieces: number }>()
    // One mark = one part, but per-zone exports carry it with slightly different lengths (500 / 500.01 / 499.99) or none
    const byMark = new Map<string, { profile: string; grade: string | null; mark: string; entries: { length: number | null; qty: number }[] }>()
    for (const r of rows) {
      const f = classifyProfile(r.profile)
      if (!f) continue
      const qty = num(r.qty) ?? 0
      if (!f.enabled) {
        const l = later.get(f.family) ?? { marks: 0, pieces: 0 }
        later.set(f.family, { marks: l.marks + 1, pieces: l.pieces + qty })
        continue
      }
      if (!spellings.has(f.profile)) spellings.set(f.profile, new Set())
      spellings.get(f.profile)!.add(String(r.profile).trim())
      const grade = r.grade?.trim() || null
      const k = `${f.profile}|${grade ?? ''}|${r.part_mark}`
      if (!byMark.has(k)) byMark.set(k, { profile: f.profile, grade, mark: r.part_mark, entries: [] })
      const length = num(r.length_mm)
      byMark.get(k)!.entries.push({ length: length && length > 0 ? length : null, qty })
    }

    const mm = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 })
    const rounded = new Map<string, string[]>(), filled = new Map<string, { marks: string[]; pieces: number }>(), apart = new Map<string, string[]>()
    const add = (m: Map<string, string[]>, k: string, v: string) => m.set(k, [...(m.get(k) ?? []), v])
    for (const { profile, grade, mark, entries } of byMark.values()) {
      const bad = entries.filter(e => !Number.isInteger(e.qty) || e.qty <= 0)
      const good = entries.filter(e => !bad.includes(e))
      const withLength = good.filter(e => e.length != null)
      const missing = good.filter(e => e.length == null)
      const distinct = [...new Set(withLength.map(e => e.length!))]
      const put = (lengthMm: number, count: number) => {
        const key = `${profile}|${grade ?? ''}`
        if (!sizes.has(key)) sizes.set(key, { profile, grade, parts: [] })
        sizes.get(key)!.parts.push({ mark, lengthMm, count })
      }
      const lost = (pieces: number) => {
        const n = noLength.get(profile) ?? { marks: [], pieces: 0 }
        noLength.set(profile, { marks: n.marks.includes(mark) ? n.marks : [...n.marks, mark], pieces: n.pieces + pieces })
      }
      if (bad.length) lost(bad.reduce((n, e) => n + e.qty, 0))
      if (!distinct.length) { if (missing.length) lost(missing.reduce((n, e) => n + e.qty, 0)); continue }
      if (distinct.length > 1 && Math.max(...distinct) - Math.min(...distinct) > 1) {
        add(apart, profile, `${mark} (${distinct.map(mm).join(' / ')})`)
        for (const l of distinct) put(l, withLength.filter(e => e.length === l).reduce((n, e) => n + e.qty, 0))
        if (missing.length) lost(missing.reduce((n, e) => n + e.qty, 0))
        continue
      }
      const qtyOf = (l: number) => withLength.filter(e => e.length === l).reduce((n, e) => n + e.qty, 0)
      const L = distinct.reduce((a, b) => (qtyOf(b) > qtyOf(a) ? b : a))
      if (distinct.length > 1) add(rounded, profile, `${mark} (${distinct.map(mm).join(' / ')} → ${mm(L)})`)
      if (missing.length) {
        const n = filled.get(profile) ?? { marks: [], pieces: 0 }
        filled.set(profile, { marks: [...n.marks, mark], pieces: n.pieces + missing.reduce((m, e) => m + e.qty, 0) })
      }
      put(L, good.reduce((n, e) => n + e.qty, 0))
    }
    const out = [...sizes.values()].sort((a, b) => a.profile.localeCompare(b.profile) || (a.grade ?? '').localeCompare(b.grade ?? ''))
    out.forEach(s => s.parts.sort((a, b) => a.mark.localeCompare(b.mark, 'en', { numeric: true }) || a.lengthMm - b.lengthMm))

    const warnings: string[] = []
    for (const [profile, n] of noLength) {
      warnings.push(`${profile}: ${plural(n.marks.length, 'mark')} (${n.pieces} pcs) ${n.marks.length === 1 ? 'has' : 'have'} no length and ${n.marks.length === 1 ? 'is' : 'are'} left out: ${n.marks.slice(0, 10).join(', ')}${n.marks.length > 10 ? ', …' : ''}`)
    }
    const list = (m: string[]) => `${m.slice(0, 10).join(', ')}${m.length > 10 ? ', …' : ''}`
    for (const [profile, m] of rounded) warnings.push(`${profile}: ${plural(m.length, 'mark')} differ${m.length === 1 ? 's' : ''} by up to 1 mm between zones; used the most common length: ${list(m)}`)
    for (const [profile, n] of filled) warnings.push(`${profile}: ${plural(n.marks.length, 'mark')} (${n.pieces} pcs) had no length in some zones; used the same mark's length from the other picked zones: ${list(n.marks)}`)
    for (const [profile, m] of apart) warnings.push(`${profile}: ${plural(m.length, 'mark')} ${m.length === 1 ? 'has' : 'have'} lengths more than 1 mm apart between zones; kept apart: ${list(m)}`)
    for (const [profile, names] of spellings) {
      if (names.size > 1) warnings.push(`${profile} is written ${names.size} ways in the BOM (${[...names].sort().join(', ')}); counted as one size`)
    }
    if (later.size) warnings.push(`Not laid out yet: ${[...later].map(([f, n]) => `${f} (${plural(n.marks, 'mark')}, ${n.pieces} pcs)`).join(', ')}`)
    return { sizes: out, pieces: out.reduce((n, s) => n + s.parts.reduce((m, p) => m + p.count, 0), 0), warnings }
  }
}
