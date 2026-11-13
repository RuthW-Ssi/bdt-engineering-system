import * as XLSX from 'xlsx'

// CP-Shape-Test (2026-11-11, wiki features/cp-shape-test.md): reads a Tekla part list (.xls/.xlsx) into one size
// per profile + grade. Nothing is stored. Tekla files repeat the same parts on several sheets (full list, raw
// report, one sheet per size), so only the sheet holding the most pieces is read; a "Sum of No." pivot sheet,
// when present, is checked against it.

export class PartListError extends Error {}

export interface PartListPart { mark: string; lengthMm: number; count: number }
export interface PartListSize { profile: string; grade: string | null; parts: PartListPart[] }
export interface PartListResult { sizes: PartListSize[]; pieces: number; warnings: string[] }

const clean = (v: unknown) => String(v ?? '').trim()
const norm = (v: unknown) => clean(v).replace(/\s+/g, ' ').toUpperCase()
const num = (v: unknown) => (typeof v === 'number' ? v : Number(clean(v).replace(/,/g, '')))

type Row = unknown[]

function readSheet(rows: Row[]) {
  const head = rows.findIndex(r => r.some(c => clean(c) === 'Mark') && r.some(c => /^Length/.test(clean(c))))
  if (head < 0) return null
  const h = rows[head].map(clean)
  const col = (re: RegExp) => h.findIndex(c => re.test(c))
  const [mark, profile, no, grade, length] = [col(/^Mark$/), col(/^Profile$/), col(/^No\.?$/), col(/^Grade$/), col(/^Length/)]
  if ([mark, profile, no, length].some(i => i < 0)) return null
  const parts: { mark: string; profile: string; grade: string | null; lengthMm: number; count: number }[] = []
  for (const r of rows.slice(head + 1)) {
    const m = clean(r[mark]), n = num(r[no]), l = num(r[length])
    if (!m || m === 'Mark' || m.startsWith('-') || !(n > 0) || !(l > 0)) continue
    parts.push({ mark: m, profile: norm(r[profile]), grade: grade >= 0 ? norm(r[grade]) || null : null, lengthMm: Math.round(l * 100) / 100, count: n })
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
  for (const p of best) {
    const key = `${p.profile}|${p.grade ?? ''}`
    if (!sizes.has(key)) sizes.set(key, { profile: p.profile, grade: p.grade, parts: [] })
    const s = sizes.get(key)!
    const same = s.parts.find(x => x.mark === p.mark && x.lengthMm === p.lengthMm)
    if (same) same.count += p.count
    else s.parts.push({ mark: p.mark, lengthMm: p.lengthMm, count: p.count })
  }
  const out = [...sizes.values()].sort((a, b) => a.profile.localeCompare(b.profile) || (a.grade ?? '').localeCompare(b.grade ?? ''))

  const warnings: string[] = []
  if (pivot) {
    const byProfile = new Map<string, number>()
    for (const s of out) byProfile.set(s.profile, (byProfile.get(s.profile) ?? 0) + s.parts.reduce((n, p) => n + p.count, 0))
    for (const [prof, total] of pivot) {
      const rows = byProfile.get(prof) ?? 0
      if (rows !== total) warnings.push(`${prof}: the summary sheet says ${total} pcs, the part rows add up to ${rows}`)
    }
  }
  return { sizes: out, pieces: best.reduce((n, p) => n + p.count, 0), warnings }
}
