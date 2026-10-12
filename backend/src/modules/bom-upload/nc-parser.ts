export interface NcFileParsed {
  partMark: string
  grade: string | null
  qty: number
  profileBase: string | null
  lengthMm: number | null
  weightKg: number | null
}

/**
 * Parse a Tekla NC1 file.
 *
 * Layout (0-indexed lines):
 *   0: ST
 *   1: ** <filename>
 *   3: <part_mark>
 *   6: <grade>
 *   7: <qty>   ← canonical total (line 8 in 1-indexed docs)
 *   8: <profile base>
 *   B: marker line
 *   B+1: length_mm
 *   B+7: weight_kg
 */
export function parseNcFile(filename: string, content: string): NcFileParsed {
  const partMark = filename.replace(/\.nc1$/i, '')
  const lines = content.split('\n').map(l => l.trimEnd())

  const grade = lines[6]?.trim() || null
  const qty = parseInt(lines[7]?.trim() ?? '0', 10) || 0
  const profileBase = lines[8]?.trim() || null

  const bIdx = lines.findIndex(l => l.trim() === 'B')

  const pf = (v: string | undefined): number | null => {
    const n = parseFloat(v?.trim() ?? '')
    return isNaN(n) || n === 0 ? null : n
  }

  let lengthMm: number | null = null
  let weightKg: number | null = null

  if (bIdx >= 0) {
    lengthMm = pf(lines[bIdx + 1])
    weightKg = pf(lines[bIdx + 7])
  }

  return { partMark, grade, qty, profileBase, lengthMm, weightKg }
}

// ── Detailed NC1 read (2026-10-06, wiki features/mo-part-round3-impl-plan §A) ──
// DSTV NC1 header after `ST` (comment lines starting with ** skipped):
//   0 order · 1 drawing · 2 phase · 3 piece · 4 grade · 5 qty · 6 profile ·
//   7 code (B = plate) · 8 length · 9 height (plate width) · 10 flange width ·
//   11 flange t (plate thickness) · 12 web t · 13 radius · 14 unit weight
//   (kg/m for sections, **kg/m² for plates**) · 15 paint surface …
// Blocks: AK outer contour, IK inner contours, BO holes (x y d), EN end.

export interface NcDetail extends NcFileParsed {
  orderNo: string | null
  code: string | null
  widthMm: number | null
  thicknessMm: number | null
  unitWeight: number | null
  areaM2: number | null
  pieceWeightKg: number | null
  cutLengthMm: number | null
  holes: { diameter_mm: number; count: number }[]
}

// "250.09s" / "0.00u" → 250.09 / 0 (DSTV appends face/ref letters)
const ncNum = (v: string | undefined): number | null => {
  const n = parseFloat((v ?? '').replace(/[a-z]+$/i, ''))
  return Number.isFinite(n) ? n : null
}

function blockRows(lines: string[], name: string): string[][][] {
  const out: string[][][] = []
  let cur: string[][] | null = null
  for (const raw of lines) {
    const t = raw.trim()
    if (/^[A-Z]{2}$/.test(t)) {
      cur = t === name ? [] : null
      if (cur) out.push(cur)
      continue
    }
    if (cur && t) cur.push(t.split(/\s+/).filter(tok => !/^[a-z]$/i.test(tok)))
  }
  return out
}

// Contour rows are `x y r …`: a non-zero r on a point makes the segment that
// STARTS there an arc of radius |r| — positive bulges outward (adds area),
// negative cuts inward (notch, removes area). Convention checked against
// Tekla Part List weights on 671 real plates (median error 0.09%).
function polygon(rows: string[][]): { area: number; perimeter: number } | null {
  const pts = rows
    .map(r => [ncNum(r[0]), ncNum(r[1]), ncNum(r[2]) ?? 0])
    .filter((p): p is [number, number, number] => p[0] != null && p[1] != null)
  if (pts.length < 2) return null
  let a = 0
  let per = 0
  let bulge = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1, r] = pts[i]
    const [x2, y2] = pts[(i + 1) % pts.length]
    a += x1 * y2 - x2 * y1
    const chord = Math.hypot(x2 - x1, y2 - y1) // 0 for the closing segment when the file repeats the first point
    if (r !== 0 && chord > 0 && Math.abs(r) >= chord / 2 - 1e-6) {
      const theta = 2 * Math.asin(Math.min(1, chord / (2 * Math.abs(r))))
      bulge += Math.sign(r) * (r * r / 2) * (theta - Math.sin(theta))
      per += Math.abs(r) * theta
    } else {
      per += chord
    }
  }
  const area = Math.abs(a) / 2 + bulge
  return area > 0 ? { area, perimeter: per } : null
}

export function parseNcDetail(filename: string, content: string): NcDetail {
  const base = parseNcFile(filename, content)
  const lines = content.split('\n').map(l => l.trimEnd())
  const st = lines.findIndex(l => l.trim() === 'ST')
  const h = lines.slice(st + 1).filter(l => !l.trim().startsWith('**')).slice(0, 16).map(l => l.trim())
  const code = h[7] || null
  const isPlate = code === 'B'
  const length = ncNum(h[8])
  const unitWeight = ncNum(h[14])

  const holeRows = blockRows(lines, 'BO').flat()
  const byDia = new Map<number, number>()
  for (const r of holeRows) {
    const d = ncNum(r[2])
    if (d && d > 0) byDia.set(d, (byDia.get(d) ?? 0) + 1)
  }
  const holes = [...byDia.entries()].sort((a, b) => a[0] - b[0]).map(([diameter_mm, count]) => ({ diameter_mm, count }))

  let areaM2: number | null = null
  let cutLengthMm: number | null = null
  let pieceWeightKg: number | null = null
  if (isPlate) {
    const outer = blockRows(lines, 'AK')[0]
    const outerPoly = outer ? polygon(outer) : null
    if (outerPoly) {
      const inner = blockRows(lines, 'IK').map(polygon).filter((p): p is { area: number; perimeter: number } => !!p)
      // Holes are NOT deducted from the area — Tekla's per-piece weight is the
      // gross plate, and that is what material/weight reports compare against.
      const holeCut = holes.reduce((s, g) => s + g.count * Math.PI * g.diameter_mm, 0)
      const areaMm2 = outerPoly.area - inner.reduce((s, p) => s + p.area, 0)
      areaM2 = areaMm2 / 1e6
      cutLengthMm = outerPoly.perimeter + inner.reduce((s, p) => s + p.perimeter, 0) + holeCut
      pieceWeightKg = unitWeight != null ? areaM2 * unitWeight : null
    }
  } else if (unitWeight != null && length != null) {
    pieceWeightKg = (unitWeight * length) / 1000
  }

  return {
    ...base,
    orderNo: h[0] || null,
    code,
    widthMm: isPlate ? ncNum(h[9]) : null,
    thicknessMm: isPlate ? ncNum(h[11]) : null,
    unitWeight,
    areaM2,
    pieceWeightKg,
    cutLengthMm,
    holes,
  }
}
