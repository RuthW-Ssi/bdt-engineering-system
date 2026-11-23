import { BadRequestException } from '@nestjs/common'
import type { ParsedAssembly, ParsedAssemblyPart, ParsedPart } from './xlsx-parser.service'
import { suggestAssemblies, suggestParts, type AsmRow, type PartRow } from '../mark-rename/rename-candidates'

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
export type Slot = 'MAIN' | 'ACC'
/** slot = which Dispatch Note the row came from (separate mode); null/absent = the combined DN. */
export interface DnRev { mark: string; rev: number | null; status: string | null; slot?: Slot | null }
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
  /** DN STATUS says cancelled but the mark is still in the Tekla lists — a ⚠ only; the lists decide. */
  dn_cancelled_in_files: boolean
  /** added ↔ removed mark that looks like the same piece renamed (hint only — pairing stays after save). */
  rename_hint: string | null
  editable: boolean
  diff: MarkDiff | null
  /** MAIN | ACC in separate mode, null when combined — the review offers renames within one slot (2026-11-23). */
  slot: Slot | null
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
// Tao 2026-10-27: a removed mark is either dropped from the DN or kept with STATUS cancelled.
export const isCancelledStatus = (s: string | null | undefined) => /^cancel/i.test((s ?? '').trim())

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
export function decideRevs(input: { current: (MarkSnapshot & { slot?: Slot | null })[]; previous: PrevMark[]; removable: (p: PrevMark) => boolean; dn: DnRev[] | null }): RevDecision {
  const prevBy = new Map(input.previous.map(p => [p.mark, p]))
  const dnRows = input.dn ?? []
  // A mark reads the DN of its own slot. The combined DN (no slot) and a mark
  // with no slot (combined upload) match on the mark alone; first row wins.
  const dnOf = (mark: string, slot: string | null | undefined) =>
    dnRows.find(d => d.mark === mark && (d.slot == null || slot == null || d.slot === slot))
  const currMarks = new Set(input.current.map(c => c.mark))
  const inSlot = (mark: string, slot: Slot | null | undefined) => input.current.some(c => c.mark === mark && (slot == null || c.slot == null || c.slot === slot))
  const rows: RevRow[] = input.current.map((c): RevRow => {
    const p = prevBy.get(c.mark)
    const d = dnOf(c.mark, c.slot)
    const dnRev = d?.rev ?? null
    const base = { mark: c.mark, dn_rev: dnRev, dn_status: d?.status ?? null, in_dn: !!d, dn_cancelled_in_files: isCancelledStatus(d?.status), rename_hint: null, slot: c.slot ?? null }
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
    const d = dnOf(p.mark, p.slot)
    rows.push({ mark: p.mark, kind: 'removed', prev_rev: p.rev, suggested_rev: null, suggested_source: null, dn_rev: d?.rev ?? null, dn_status: d?.status ?? null, in_dn: !!d, warning: null, dn_cancelled_in_files: false, rename_hint: null, editable: false, diff: null, slot: p.slot === 'MAIN' || p.slot === 'ACC' ? p.slot : null })
  }
  // DN-only = marks the zone has never had. A removed mark already has its row;
  // a kept mark (slot not uploaded, e.g. MAIN on an ACC-only upload with a
  // whole-zone DN) isn't missing from the files — neither raises the ⚠.
  // Separate mode: per slot — a Main-DN mark missing from the Main lists counts.
  // A cancelled row is a deliberate removal, never "files missing".
  const dnOnly = dnRows.filter(d => !inSlot(d.mark, d.slot) && !prevBy.has(d.mark) && !isCancelledStatus(d.status)).map(d => d.mark)
  hintRenames(rows, input.current, input.previous)
  return { rows, dn_only_marks: [...new Set(dnOnly)], has_dn: input.dn != null }
}

const asmRow = (s: MarkSnapshot, i: number): AsmRow => ({
  id: i, mark: s.mark, length_mm: s.length_mm, weight_kg: s.weight_kg,
  parts: s.parts.map(p => ({ part_mark: p.part_mark, profile: p.profile ?? '', length_mm: p.length_mm ?? 0, grade: p.grade ?? '', qty: p.qty ?? 0, unit_weight_kg: p.weight_kg ?? 0 })),
})

/** Same scorer + minimum as the after-save pairing dialog (rename-candidates), matched one-to-one, best score first, same slot only. */
function hintRenames(rows: RevRow[], current: (MarkSnapshot & { slot?: Slot | null })[], previous: PrevMark[]) {
  const added = new Map(rows.filter(r => r.kind === 'added').map(r => [r.mark, r]))
  const removed = new Map(rows.filter(r => r.kind === 'removed').map(r => [r.mark, r]))
  const fresh = current.filter(c => added.has(c.mark))
  const sameSlot = (a: string | null | undefined, b: string | null | undefined) => a == null || b == null || a === b
  const pairs = previous.filter(p => removed.has(p.mark)).flatMap(p => {
    const cand = fresh.filter(c => sameSlot(c.slot, p.slot))
    return suggestAssemblies(asmRow(p, 0), cand.map(asmRow)).map(s => ({ from: p.mark, to: s.mark, score: s.score }))
  }).sort((a, b) => b.score - a.score)
  for (const x of pairs) {
    const a = added.get(x.to)!, r = removed.get(x.from)!
    if (a.rename_hint || r.rename_hint) continue
    a.rename_hint = x.from
    r.rename_hint = x.to
  }
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

// ── Missing parts (2026-11-23, Tao): same decision as missing marks, before save ──
export interface PrevPart { id: number; mark: string; slot: Slot | null; profile: string | null; grade: string | null; length_mm: number | null; weight_kg: number | null
  /** linked from an ACTIVE assembly this upload does not replace (e.g. an ACC assembly using a MAIN plate) */
  used_by_kept_assembly: boolean }
export interface PartReviewRow { mark: string; kind: 'removed' | 'added'; slot: Slot | null; rename_hint: string | null
  /** removed but still needed: named in the uploaded Assembly Part List, or used by a kept assembly → the Part List may be incomplete */
  still_used: boolean }

/** `removable` = the save's part supersede rule; `referenced` = part marks the uploaded Assembly Part List names. */
export function decideParts(input: {
  previous: PrevPart[]
  current: { part_mark: string; slot?: Slot | null; profile?: string | null; grade?: string | null; length_mm?: number | null; weight_kg?: number | null }[]
  removable: (p: PrevPart) => boolean
  referenced: Set<string>
}): PartReviewRow[] {
  const currMarks = new Set(input.current.map(c => c.part_mark))
  const prevMarks = new Set(input.previous.map(p => p.mark))
  const removed = input.previous.filter(p => !currMarks.has(p.mark) && input.removable(p))
  const fresh = input.current.filter(c => !prevMarks.has(c.part_mark))
  const rows: PartReviewRow[] = [
    ...removed.map(p => ({ mark: p.mark, kind: 'removed' as const, slot: p.slot, rename_hint: null, still_used: input.referenced.has(p.mark) || p.used_by_kept_assembly })),
    ...fresh.map(c => ({ mark: c.part_mark, kind: 'added' as const, slot: c.slot ?? null, rename_hint: null, still_used: false })),
  ]
  // same scorer + minimum as the after-save dialog, one-to-one, best score first, same slot only
  const toRow = (x: { mark: string; profile?: string | null; grade?: string | null; length_mm?: number | null; weight_kg?: number | null }, id: number): PartRow =>
    ({ id, mark: x.mark, profile: x.profile ?? null, grade: x.grade ?? null, length_mm: x.length_mm ?? null, weight_kg: x.weight_kg ?? null })
  const sameSlot = (a: Slot | null | undefined, b: Slot | null | undefined) => a == null || b == null || a === b
  const pairs = removed.flatMap(p => {
    const cand = fresh.filter(c => sameSlot(c.slot, p.slot)).map((c, i) => toRow({ ...c, mark: c.part_mark }, i))
    return suggestParts(toRow(p, p.id), cand).map(x => ({ from: p.mark, to: x.mark, score: x.score }))
  }).sort((a, b) => b.score - a.score)
  const byMark = (kind: 'removed' | 'added', m: string) => rows.find(r => r.kind === kind && r.mark === m)!
  for (const x of pairs) {
    const r = byMark('removed', x.from), a = byMark('added', x.to)
    if (r.rename_hint || a.rename_hint) continue
    r.rename_hint = x.to
    a.rename_hint = x.from
  }
  return rows
}

// ── Same part mark in both MAIN and ACC Part Lists (2026-11-23, Tao) ──
// One row is kept per mark (MAIN's) and both slots' assemblies link to it; that is right when the
// two rows are the same piece. Data that differ mean a wrong export → warn in the review. qty is per list, not compared.
const CONFLICT_FIELDS = ['profile', 'grade', 'length_mm', 'weight_kg', 'description'] as const
export interface PartConflict { mark: string; fields: { field: (typeof CONFLICT_FIELDS)[number]; main: string | number | null; acc: string | number | null }[] }

export function partConflicts(parts: { part_mark: string; slot?: Slot | null; profile?: string | null; grade?: string | null; length_mm?: number | null; weight_kg?: number | null; description?: string | null }[]): PartConflict[] {
  const norm = (f: (typeof CONFLICT_FIELDS)[number], v: unknown) => (f === 'length_mm' ? round(v, 2) : f === 'weight_kg' ? round(v, 3) : text(v))
  const acc = new Map(parts.filter(p => p.slot === 'ACC').map(p => [p.part_mark, p]))
  const seen = new Set<string>()
  const out: PartConflict[] = []
  for (const m of parts) {
    if (m.slot !== 'MAIN' || seen.has(m.part_mark)) continue
    seen.add(m.part_mark)
    const a = acc.get(m.part_mark)
    if (!a) continue
    const fields = CONFLICT_FIELDS.flatMap(f => {
      const mv = norm(f, m[f]), av = norm(f, a[f])
      return mv === av ? [] : [{ field: f, main: mv, acc: av }]
    })
    if (fields.length) out.push({ mark: m.part_mark, fields })
  }
  return out
}
