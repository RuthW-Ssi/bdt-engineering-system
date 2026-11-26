import * as XLSX from 'xlsx'
import { classifyProfile, isNotCut } from './profile-family'

// CP-Shape-Test (2026-11-11, wiki features/cp-shape-test.md): reads a Tekla part list (.xls/.xlsx) into one size
// per profile + grade. Nothing is stored. Tekla files repeat the same parts on several sheets (full list, raw
// report, one sheet per size), so only the sheet holding the most pieces is read; a "Sum of No." pivot sheet,
// when present, is checked against it. 2026-11-26: profiles go through the same families as the BOM (bom-source.ts):
// one spelling per size ("L50X50X5" → "L 50X50X5", "RHS…" → "BOX …"), plates and bought items left out, shapes not
// laid out yet named in a warning — before this a part list laid out every row, plates included, under Tekla's spelling.

export class PartListError extends Error {}

export interface PartListPart { mark: string; lengthMm: number; count: number; sleeve?: true } // sleeve: a sleeve pipe (…SL) laid out with its pipe
export interface PartListSize { profile: string; grade: string | null; parts: PartListPart[]; kgPerM: number | null }
export interface PartListResult { sizes: PartListSize[]; pieces: number; warnings: string[] }

const clean = (v: unknown) => String(v ?? '').trim()
const norm = (v: unknown) => clean(v).replace(/\s+/g, ' ').toUpperCase()
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
// kg per metre of a size: the middle value of weight-per-piece ÷ length over its rows (Tekla's weights, corner radii in)
export function medianKgPerM(samples: number[]): number | null {
  const v = samples.filter(x => Number.isFinite(x) && x > 0).sort((a, b) => a - b)
  if (!v.length) return null
  const m = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2
  return Math.round(m * 1000) / 1000
}
const num = (v: unknown) => (typeof v === 'number' ? v : Number(clean(v).replace(/,/g, '')))

type Row = unknown[]

function readSheet(rows: Row[]) {
  const head = rows.findIndex(r => r.some(c => clean(c) === 'Mark') && r.some(c => /^Length/.test(clean(c))))
  if (head < 0) return null
  const h = rows[head].map(clean)
  const col = (re: RegExp) => h.findIndex(c => re.test(c))
  const [mark, profile, no, grade, length, weight] = [col(/^Mark$/), col(/^Profile$/), col(/^No\.?$/), col(/^Grade$/), col(/^Length/), col(/^Weight/)]
  if ([mark, profile, no, length].some(i => i < 0)) return null
  const parts: { mark: string; profile: string; grade: string | null; lengthMm: number; count: number; kgPerM: number | null }[] = []
  for (const r of rows.slice(head + 1)) {
    const m = clean(r[mark]), n = num(r[no]), l = num(r[length])
    if (!m || m === 'Mark' || m.startsWith('-') || !(n > 0) || !(l > 0)) continue
    const w = weight >= 0 ? num(r[weight]) : NaN
    parts.push({ mark: m, profile: norm(r[profile]), grade: grade >= 0 ? norm(r[grade]) || null : null, lengthMm: Math.round(l * 100) / 100, count: n, kgPerM: w > 0 ? (w / l) * 1000 : null })
  }
  return parts
}

// "Sum of No." pivot: Profile | Grade | Total
function readPivot(rows: Row[]) {
  const head = rows.findIndex(r => r.some(c => /^Profile$/.test(clean(c))) && r.some(c => /^Total$/.test(clean(c))))
  if (head < 0 || !rows.slice(0, head).some(r => r.some(c => /^Sum of/.test(clean(c))))) return null
  const h = rows[head].map(clean)
  const [p, t] = [h.indexOf('Profile'), h.indexOf('Total')]
  const totals = new Map<string, number>()
  for (const r of rows.slice(head + 1)) {
    const prof = norm(r[p]), n = num(r[t])
    if (prof && prof !== '(BLANK)' && !/^GRAND TOTAL/.test(prof) && n > 0) totals.set(prof, (totals.get(prof) ?? 0) + n)
  }
  return totals
}

export function parsePartList(buffer: Buffer): PartListResult {
  let wb: XLSX.WorkBook
  try { wb = XLSX.read(buffer, { type: 'buffer' }) } catch { throw new PartListError('Not a readable .xls / .xlsx file') }
  let best: NonNullable<ReturnType<typeof readSheet>> | null = null
  let pivot: Map<string, number> | null = null
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<Row>(wb.Sheets[name], { header: 1, defval: '' })
    pivot ??= readPivot(rows)
    const parts = readSheet(rows)
    const total = (ps: { count: number }[]) => ps.reduce((n, x) => n + x.count, 0)
    if (parts && parts.length && (!best || total(parts) > total(best))) best = parts
  }
  if (!best) throw new PartListError('Not a part list: no sheet with Mark, Profile, No. and Length columns')

  const sizes = new Map<string, PartListSize>()
  const weights = new Map<string, number[]>()
  const later = new Map<string, { marks: Set<string>; pieces: number }>()
  const unknown = new Map<string, { marks: Set<string>; pieces: number }>()
  const sleeves = new Map<string, { marks: Set<string>; pieces: number }>()
  const tally = (m: Map<string, { marks: Set<string>; pieces: number }>, k: string, mark: string, n: number) => {
    const t = m.get(k) ?? { marks: new Set<string>(), pieces: 0 }
    t.marks.add(mark); t.pieces += n; m.set(k, t)
  }
  for (const raw of best) {
    const f = classifyProfile(raw.profile)
    if (!f) { if (raw.profile && !isNotCut(raw.profile)) tally(unknown, raw.profile, raw.mark, raw.count); continue } // plates, bought items: quiet
    if (!f.enabled) { tally(later, f.family, raw.mark, raw.count); continue }
    if (f.sleeve) tally(sleeves, f.profile, raw.mark, raw.count)
    const p = { ...raw, profile: f.profile, sleeve: f.sleeve }
    const key = `${p.profile}|${p.grade ?? ''}`
    if (!sizes.has(key)) sizes.set(key, { profile: p.profile, grade: p.grade, parts: [], kgPerM: null })
    if (p.kgPerM != null) weights.set(key, [...(weights.get(key) ?? []), p.kgPerM])
    const s = sizes.get(key)!
    const same = s.parts.find(x => x.mark === p.mark && x.lengthMm === p.lengthMm)
    if (same) same.count += p.count
    else s.parts.push({ mark: p.mark, lengthMm: p.lengthMm, count: p.count, ...(p.sleeve ? { sleeve: true as const } : {}) })
  }
  for (const [key, s] of sizes) s.kgPerM = medianKgPerM(weights.get(key) ?? [])
  const out = [...sizes.values()].sort((a, b) => a.profile.localeCompare(b.profile) || (a.grade ?? '').localeCompare(b.grade ?? ''))
  if (!out.length) {
    const why = later.size ? ` (not laid out yet: ${[...later].map(([f, n]) => `${f} (${plural(n.marks.size, 'mark')}, ${n.pieces} pcs)`).join(', ')})` : ''
    throw new PartListError(`No pipe, rod, box, L, C or H pieces in this part list${why}`)
  }

  const warnings: string[] = []
  if (pivot) {
    const byProfile = new Map<string, number>()
    for (const s of out) byProfile.set(s.profile, (byProfile.get(s.profile) ?? 0) + s.parts.reduce((n, p) => n + p.count, 0))
    const pivotBy = new Map<string, number>() // under the same names as the sizes; plates and later shapes not checked
    for (const [raw, total] of pivot) {
      const f = classifyProfile(raw)
      if (f?.enabled) pivotBy.set(f.profile, (pivotBy.get(f.profile) ?? 0) + total)
    }
    for (const [prof, total] of pivotBy) {
      const rows = byProfile.get(prof) ?? 0
      if (rows !== total) warnings.push(`${prof}: the summary sheet says ${total} pcs, the part rows add up to ${rows}`)
    }
  }
  for (const [profile, n] of sleeves) warnings.push(`${profile}: sleeve pipes (SL) laid out with it: ${plural(n.marks.size, 'mark')} (${n.pieces} pcs)`)
  for (const [raw, n] of unknown) warnings.push(`Unknown profile, not laid out: ${raw} (${plural(n.marks.size, 'mark')}, ${n.pieces} pcs)`)
  if (later.size) warnings.push(`Not laid out yet: ${[...later].map(([f, n]) => `${f} (${plural(n.marks.size, 'mark')}, ${n.pieces} pcs)`).join(', ')}`)
  return { sizes: out, pieces: out.reduce((n, s) => n + s.parts.reduce((a, p) => a + p.count, 0), 0), warnings }
}
