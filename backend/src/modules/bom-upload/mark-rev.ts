import { BadRequestException } from '@nestjs/common'
import type { ParsedAssembly, ParsedAssemblyPart, ParsedPart } from './xlsx-parser.service'

// Per-mark BOM revision (2026-10-26, wiki features/bom-mark-revision-plan.md).
// Pure: preview and save both run this, so the server never trusts the
// client's rev numbers. "A rev goes up only when the mark's BOM data changes"
// (Tao) — every DN-vs-diff mismatch is a ⚠ the user settles.

export type RevSource = 'DISPATCH_NOTE' | 'CARRIED' | 'NEW' | 'MANUAL'
export type RevWarning = 'CHANGED_NO_REV_UP' | 'REV_UP_NO_CHANGE' | 'DN_REV_LOWER'
export interface Change { field: string; old: string | number | null; new: string | number | null }
export interface PartLine { part_mark: string; qty: number | null; description: string | null; profile: string | null; grade: string | null; length_mm: number | null; weight_kg: number | null }
export interface MarkSnapshot { mark: string; qty: number | null; name: string | null; length_mm: number | null; width_mm: number | null; height_mm: number | null; weight_kg: number | null; surface_area_m2: number | null; parts: PartLine[] }
export interface PrevMark extends MarkSnapshot { rev: number; slot: string | null }
export interface MarkDiff { fields: Change[]; parts_added: PartLine[]; parts_removed: PartLine[]; parts_changed: { part_mark: string; changes: Change[] }[] }
export interface DnRev { mark: string; rev: number | null; status: string | null }
export interface RevRow {
  mark: string
  kind: 'added' | 'changed' | 'unchanged' | 'removed'
  prev_rev: number | null
  suggested_rev: number | null // null only for removed
  suggested_source: RevSource | null
  dn_rev: number | null
  dn_status: string | null
  in_dn: boolean
  warning: RevWarning | null
  editable: boolean
  diff: MarkDiff | null
}
export interface RevDecision { rows: RevRow[]; dn_only_marks: string[]; has_dn: boolean }
export interface FinalRev { rev: number; rev_source: RevSource; dn_status: string | null }
export interface RevEdit { mark: string; rev: number }

export const MAX_REV = 999
// The BOM diff's field set (open item 2): sets + ASM_FIELDS; parts by junction.
// bom_part.qty (zone total) is left out — another assembly can change it.
const MARK_FIELDS = ['qty', 'name', 'length_mm', 'width_mm', 'height_mm', 'weight_kg', 'surface_area_m2'] as const
const PART_FIELDS = ['qty', 'description', 'profile', 'grade', 'length_mm', 'weight_kg'] as const

/** Same scale as the DB column (schema.prisma), so a file value equals what Postgres stored. */
export function round(v: unknown, scale: number): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? Number(n.toFixed(scale)) : null
}
const text = (v: unknown) => (v == null ? null : String(v).trim() || null)

export function partLine(p: { part_mark: string; description?: unknown; profile?: unknown; grade?: unknown; length_mm?: unknown; weight_kg?: unknown }, qty: unknown): PartLine {
  return {
    part_mark: p.part_mark, qty: round(qty ?? 1, 3), description: text(p.description), profile: text(p.profile), grade: text(p.grade),
    length_mm: round(p.length_mm, 2), weight_kg: round(p.weight_kg, 3),
  }
}

export function snapshot(a: { assembly_mark: string; name?: unknown; qty?: unknown; length_mm?: unknown; width_mm?: unknown; height_mm?: unknown; weight_kg?: unknown; surface_area_m2?: unknown }, parts: PartLine[]): MarkSnapshot {
  return {
    mark: a.assembly_mark, qty: round(a.qty, 3), name: text(a.name),
    length_mm: round(a.length_mm, 2), width_mm: round(a.width_mm, 2), height_mm: round(a.height_mm, 2),
    weight_kg: round(a.weight_kg, 3), surface_area_m2: round(a.surface_area_m2, 4), parts,
  }
}

/** The upload's marks exactly as save will store them (junction dedupe + NC-merged parts). */
export function snapshotsFromUpload(assemblies: ParsedAssembly[], junctions: ParsedAssemblyPart[], parts: ParsedPart[]): MarkSnapshot[] {
  const partByMark = new Map(parts.map(p => [p.part_mark, p]))
  const lines = new Map<string, PartLine[]>()
  const seen = new Set<string>()
  for (const j of junctions) {
    const p = partByMark.get(j.part_mark)
    const key = `${j.assembly_mark}\0${j.part_mark}`
    if (!p || seen.has(key)) continue
    seen.add(key)
    lines.set(j.assembly_mark, [...(lines.get(j.assembly_mark) ?? []), partLine(p, j.qty ?? 1)])
  }
  return assemblies.map(a => snapshot(a, lines.get(a.assembly_mark) ?? []))
}

export function markDiff(prev: MarkSnapshot, curr: MarkSnapshot): MarkDiff {
  const fields: Change[] = MARK_FIELDS.flatMap(f => (prev[f] === curr[f] ? [] : [{ field: f, old: prev[f], new: curr[f] }]))
  const before = new Map(prev.parts.map(p => [p.part_mark, p]))
  const after = new Set(curr.parts.map(p => p.part_mark))
  const parts_changed = curr.parts.flatMap(p => {
    const b = before.get(p.part_mark)
    if (!b) return []
    const changes: Change[] = PART_FIELDS.flatMap(f => (b[f] === p[f] ? [] : [{ field: f, old: b[f], new: p[f] }]))
    return changes.length ? [{ part_mark: p.part_mark, changes }] : []
  })
  return { fields, parts_added: curr.parts.filter(p => !before.has(p.part_mark)), parts_removed: prev.parts.filter(p => !after.has(p.part_mark)), parts_changed }
}

export const isUnchanged = (d: MarkDiff) => !d.fields.length && !d.parts_added.length && !d.parts_removed.length && !d.parts_changed.length

/** Spec decision 3 — the suggested rev of every mark of the upload, plus removed marks. */
export function decideRevs(input: { current: MarkSnapshot[]; previous: PrevMark[]; removable: (p: PrevMark) => boolean; dn: DnRev[] | null }): RevDecision {
  const prevBy = new Map(input.previous.map(p => [p.mark, p]))
  const dnBy = new Map((input.dn ?? []).map(d => [d.mark, d]))
  const currMarks = new Set(input.current.map(c => c.mark))
  const rows: RevRow[] = input.current.map((c): RevRow => {
    const p = prevBy.get(c.mark)
    const d = dnBy.get(c.mark)
    const dnRev = d?.rev ?? null
    const base = { mark: c.mark, dn_rev: dnRev, dn_status: d?.status ?? null, in_dn: !!d }
    if (!p) return { ...base, kind: 'added', prev_rev: null, suggested_rev: dnRev ?? 0, suggested_source: dnRev != null ? 'DISPATCH_NOTE' : 'NEW', warning: null, editable: false, diff: null }
    const diff = markDiff(p, c)
    if (!isUnchanged(diff)) {
      return dnRev != null && dnRev > p.rev
        ? { ...base, kind: 'changed', prev_rev: p.rev, suggested_rev: dnRev, suggested_source: 'DISPATCH_NOTE', warning: null, editable: true, diff }
        : { ...base, kind: 'changed', prev_rev: p.rev, suggested_rev: p.rev + 1, suggested_source: 'MANUAL', warning: 'CHANGED_NO_REV_UP', editable: true, diff }
    }
    const keep = { ...base, kind: 'unchanged' as const, prev_rev: p.rev, suggested_rev: p.rev, diff: null }
    if (dnRev == null) return { ...keep, suggested_source: 'CARRIED', warning: null, editable: false }
    if (dnRev === p.rev) return { ...keep, suggested_source: 'DISPATCH_NOTE', warning: null, editable: false }
    return { ...keep, suggested_source: 'CARRIED', warning: dnRev > p.rev ? 'REV_UP_NO_CHANGE' : 'DN_REV_LOWER', editable: true }
  })
  for (const p of input.previous) {
    if (currMarks.has(p.mark) || !input.removable(p)) continue
    const d = dnBy.get(p.mark)
    rows.push({ mark: p.mark, kind: 'removed', prev_rev: p.rev, suggested_rev: null, suggested_source: null, dn_rev: d?.rev ?? null, dn_status: d?.status ?? null, in_dn: !!d, warning: null, editable: false, diff: null })
  }
  // DN-only = marks the zone has never had. A removed mark already has its row;
  // a kept mark (slot not uploaded, e.g. MAIN on an ACC-only upload with a
  // whole-zone DN) isn't missing from the files — neither raises the ⚠.
  return { rows, dn_only_marks: (input.dn ?? []).map(d => d.mark).filter(m => !currMarks.has(m) && !prevBy.has(m)), has_dn: input.dn != null }
}

/** Review table rows: new, changed, removed, or listed in the Dispatch Note. */
export const reviewRows = (d: RevDecision) => d.rows.filter(r => r.kind !== 'unchanged' || r.in_dn)

function sourceOf(r: RevRow, rev: number): RevSource {
  if (r.warning === 'CHANGED_NO_REV_UP') return 'MANUAL'
  if (r.warning) return rev === r.prev_rev ? 'CARRIED' : 'MANUAL'
  return rev === r.suggested_rev ? r.suggested_source! : 'MANUAL'
}

/** The rev saved for every mark of the upload. `edits` come from the review table. */
export function finalizeRevs(d: RevDecision, edits: RevEdit[]): Map<string, FinalRev> {
  const byMark = new Map(d.rows.filter(r => r.kind !== 'removed').map(r => [r.mark, r]))
  const edited = new Map<string, number>()
  for (const e of edits) {
    const r = byMark.get(e.mark)
    if (!r) throw new BadRequestException(`${e.mark}: ไม่มี mark นี้ในไฟล์ที่อัปโหลด`)
    if (!Number.isInteger(e.rev) || e.rev < 0 || e.rev > MAX_REV) throw new BadRequestException(`${e.mark}: rev ต้องเป็นเลขจำนวนเต็ม 0 ถึง ${MAX_REV}`)
    if (!r.editable && e.rev !== r.suggested_rev) throw new BadRequestException(`${e.mark}: แก้ rev ได้เฉพาะแถวที่มี ⚠ หรือข้อมูลเปลี่ยน`)
    if (r.prev_rev != null && e.rev < r.prev_rev) throw new BadRequestException(`${e.mark}: rev ต่ำกว่า rev ปัจจุบัน (${r.prev_rev}) ไม่ได้`)
    // Tao 2026-10-26: WO alerts only on a rev rise, so changed data must raise the rev.
    if (r.kind === 'changed' && r.prev_rev != null && e.rev <= r.prev_rev) throw new BadRequestException(`${e.mark}: ข้อมูลของ mark นี้เปลี่ยน ต้องใส่ rev มากกว่า ${r.prev_rev}`)
    edited.set(e.mark, e.rev)
  }
  const out = new Map<string, FinalRev>()
  for (const r of byMark.values()) {
    const rev = edited.get(r.mark) ?? r.suggested_rev!
    out.set(r.mark, { rev, rev_source: sourceOf(r, rev), dn_status: r.dn_status })
  }
  return out
}
