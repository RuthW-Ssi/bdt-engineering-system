// Reads a plate's nesting DXF (2026-11-06) into what the plate viewer draws:
// - parts: `Part<mark>_<n>` layers. Each part's outline is split into open
//   LWPOLYLINEs (with bulges = arcs); they are chained end to end into closed
//   loops. The largest loop is the outline, the rest are holes. R12 files write
//   `PART…` layers and POLYLINE/VERTEX outlines instead; both are read.
// - path: the `RAPID` / `CUT` LINE and ARC entities in file order, which is the
//   order the cutter runs. A cut that follows the previous end point backwards
//   (DXF arcs are always counter-clockwise) is flipped.
// Units are mm, sheet origin bottom-left. Checked on 222-B5-12-3: 131 parts /
// 31 marks = the .txt nested counts; cut length 165.5 m vs the report's 165.6 m.

type Pt = [number, number]
export interface PlatePart { mark: string; n: number; outer: Pt[]; holes: Pt[][] }
// [0 = rapid | 1 = cut, x0, y0, x1, y1, …]
export type PathElement = [0 | 1, number[]]
export interface PlateGeometry { parts: PlatePart[]; path: PathElement[] }

interface Entity { type: string; codes: [string, string][] }

const TOL = 0.05
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1])
const r1 = (v: number) => Math.round(v * 10) / 10 + 0 // + 0 turns -0 into 0

function entities(text: string): Entity[] {
  const lines = text.split(/\r?\n/)
  const out: Entity[] = []
  let section: string | null = null
  let cur: Entity | null = null
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = lines[i].trim(), value = lines[i + 1].trim()
    if (code === '0' && value === 'SECTION') { section = (lines[i + 3] ?? '').trim(); continue }
    if (code === '0') {
      if (cur) out.push(cur)
      cur = section === 'ENTITIES' ? { type: value, codes: [] } : null
      continue
    }
    if (cur) cur.codes.push([code, value])
  }
  if (cur) out.push(cur)
  return r12Polylines(out)
}

// R12 files (AC1009) draw outlines as POLYLINE + VERTEX … SEQEND. Fold each into the LWPOLYLINE shape the
// rest reads: the layer, then every vertex's 10/20/42. The POLYLINE's own 10/20 is a dummy 0,0. A closed
// one (70 bit 1) repeats its first vertex, so the last vertex's bulge draws the closing arc.
function r12Polylines(ents: Entity[]): Entity[] {
  const out: Entity[] = []
  for (let i = 0; i < ents.length; i++) {
    const e = ents[i]
    if (e.type !== 'POLYLINE') { out.push(e); continue }
    const codes: [string, string][] = [['8', layerOf(e)]]
    let j = i + 1
    for (; j < ents.length && ents[j].type === 'VERTEX'; j++) codes.push(...ents[j].codes.filter(([c]) => c === '10' || c === '20' || c === '42'))
    const first = codes.slice(1, 3)
    if (num(e, '70') & 1 && first.length === 2) codes.push(...first)
    out.push({ type: 'LWPOLYLINE', codes })
    i = ents[j]?.type === 'SEQEND' ? j : j - 1
  }
  return out
}

const layerOf = (e: Entity) => e.codes.find(([c]) => c === '8')?.[1] ?? ''
const num = (e: Entity, code: string) => Number(e.codes.find(([c]) => c === code)?.[1] ?? NaN)

// A bulge b between two vertices = arc of 4·atan(b) radians (positive = CCW).
function bulgeArc(a: Pt, b: Pt, bulge: number): Pt[] {
  const th = 4 * Math.atan(bulge)
  const c = dist(a, b)
  if (c < 1e-9) return []
  const d = c / (2 * Math.tan(th / 2)) // signed chord-midpoint → centre distance
  const cx = (a[0] + b[0]) / 2 - ((b[1] - a[1]) / c) * d
  const cy = (a[1] + b[1]) / 2 + ((b[0] - a[0]) / c) * d
  const r = Math.hypot(a[0] - cx, a[1] - cy)
  const a1 = Math.atan2(a[1] - cy, a[0] - cx)
  const seg = Math.max(3, Math.floor(Math.abs(th) / (Math.PI / 24)))
  const out: Pt[] = []
  for (let k = 1; k < seg; k++) out.push([cx + r * Math.cos(a1 + (th * k) / seg), cy + r * Math.sin(a1 + (th * k) / seg)])
  return out
}

function polylinePoints(e: Entity): Pt[] {
  const v: [number, number, number][] = []
  for (const [c, val] of e.codes) {
    if (c === '10') v.push([Number(val), 0, 0])
    else if (c === '20' && v.length) v[v.length - 1][1] = Number(val)
    else if (c === '42' && v.length) v[v.length - 1][2] = Number(val)
  }
  const out: Pt[] = []
  for (let i = 0; i < v.length - 1; i++) {
    const a: Pt = [v[i][0], v[i][1]], b: Pt = [v[i + 1][0], v[i + 1][1]]
    out.push(a)
    if (Math.abs(v[i][2]) > 1e-9) out.push(...bulgeArc(a, b, v[i][2]))
  }
  if (v.length) out.push([v[v.length - 1][0], v[v.length - 1][1]])
  return out
}

function chain(pieces: Pt[][]): Pt[][] {
  const rest = pieces.map(p => p.slice())
  const loops: Pt[][] = []
  while (rest.length) {
    const loop = rest.shift()!
    for (let grown = true; grown;) {
      grown = false
      for (let i = 0; i < rest.length; i++) {
        const p = rest[i], end = loop[loop.length - 1]
        if (dist(end, p[0]) < TOL) { loop.push(...p.slice(1)); rest.splice(i, 1); grown = true; break }
        if (dist(end, p[p.length - 1]) < TOL) { loop.push(...p.slice().reverse().slice(1)); rest.splice(i, 1); grown = true; break }
      }
    }
    if (loop.length > 2 && dist(loop[0], loop[loop.length - 1]) < TOL) loop.pop()
    loops.push(loop)
  }
  return loops
}

const area = (l: Pt[]) => Math.abs(l.reduce((s, p, i) => { const q = l[(i + 1) % l.length]; return s + p[0] * q[1] - q[0] * p[1] }, 0) / 2)

function lineOrArc(e: Entity): Pt[] {
  if (e.type === 'LINE') return [[num(e, '10'), num(e, '20')], [num(e, '11'), num(e, '21')]]
  const cx = num(e, '10'), cy = num(e, '20'), r = num(e, '40')
  const a = (num(e, '50') * Math.PI) / 180
  let b = (num(e, '51') * Math.PI) / 180
  if (b <= a) b += 2 * Math.PI
  const n = Math.max(3, Math.floor((b - a) / (Math.PI / 18)))
  return Array.from({ length: n + 1 }, (_, k) => [cx + r * Math.cos(a + ((b - a) * k) / n), cy + r * Math.sin(a + ((b - a) * k) / n)] as Pt)
}

export function parsePlateDxf(text: string): PlateGeometry {
  const ents = entities(text)

  const byLayer = new Map<string, Pt[][]>()
  for (const e of ents) {
    if (e.type !== 'LWPOLYLINE') continue
    const layer = layerOf(e)
    if (!/^part/i.test(layer)) continue // R12 writes layer names upper case
    const pts = polylinePoints(e)
    if (pts.length >= 2) byLayer.set(layer, [...(byLayer.get(layer) ?? []), pts])
  }
  const parts: PlatePart[] = []
  for (const [layer, pieces] of byLayer) {
    const m = /^Part(.+)_(\d+)$/i.exec(layer)
    if (!m) continue
    const loops = chain(pieces).sort((x, y) => area(y) - area(x))
    if (!loops.length) continue
    const round = (l: Pt[]) => l.map(([x, y]) => [r1(x), r1(y)] as Pt)
    parts.push({ mark: m[1], n: Number(m[2]), outer: round(loops[0]), holes: loops.slice(1).map(round) })
  }

  const path: PathElement[] = []
  let last: Pt | null = null
  for (const e of ents) {
    const layer = layerOf(e)
    if ((layer !== 'CUT' && layer !== 'RAPID') || (e.type !== 'LINE' && e.type !== 'ARC')) continue
    let pts = lineOrArc(e)
    if (last && dist(last, pts[0]) > 0.1 && dist(last, pts[pts.length - 1]) < 0.1) pts = pts.reverse()
    last = pts[pts.length - 1]
    const t: 0 | 1 = layer === 'CUT' ? 1 : 0
    const flat = pts.flatMap(([x, y]) => [r1(x), r1(y)])
    const prev = path[path.length - 1]
    if (t === 1 && prev && prev[0] === 1) {
      const pf = prev[1]
      prev[1] = dist([pf[pf.length - 2], pf[pf.length - 1]], pts[0]) < 0.1 ? pf.concat(flat.slice(2)) : pf.concat(flat) // contiguous cut
    } else path.push([t, flat])
  }
  return { parts, path }
}

// Machine times from the .txt (same table as the PDF): cutting and rapid feed (mm/min) and the
// time per pierce (min). Report versions wrap this table differently, so positions can't be
// trusted (checked on 244 real plates, 2026-11-06: rows on one line or split across two, numbers
// before the label, an extra "Marking text" row). What does hold:
// - time per item is printed with exactly 2 decimals ("0.10"); lengths and times have 1
// - the whole numbers are feeds and counts; counts repeat across rows or equal the DXF's pierce
//   count, so drop those
// - a real feed explains a length → time pair of its row: length (m) × 1000 / feed (mm/min) = time
//   (min), both printed with 1 decimal. A count does not (2026-11-09: a Marking text row with 176 items
//   was taken for a 176 mm/min cutting feed, 12× the report's time). Of the feeds that pair, the highest
//   is rapid; the others (cutting qualities, and marking, whose strokes the DXF also draws on its CUT
//   layer) give one length-weighted cutting feed = their total length / their total time, because the DXF
//   doesn't say which contour uses which (224-F7-32-1: 1135 and 681 mm/min over similar lengths).
// The pairs are read by row tails first (feedsByRowTails, below); loose pairs are the fallback, and
// reports where fewer than two feeds pair fall back to lowest = cutting, highest = rapid.
// Marking pierce time is not simulated.
// `pierces` = rapid moves in the DXF. Null when the table is missing or doesn't fit.
export interface MachineTimes { cutFeed: number; rapidFeed: number; pierceMin: number; totalMin: number | null }

// Loose pairs can match the wrong numbers once rows wrap (2026-11-09 full re-upload: 774 mm/min "explained"
// a time read as a length, a pierce count of 200 passed for a feed; 23 plates up to 48% off). Every method
// row ends "qty  time/qty(2 dp)  start  total", and that tail is never wrapped apart, so it gives the
// methods, each one's time (total − start) and which one is rapid (time/qty 0.00). Each method then claims
// its own printed time, a length and a feed that explain it (each printed number once; a 1-dp length is
// off by up to 50/feed min), rapid being the fastest; the closest assignment wins. Null if none fits.
function feedsByRowTails(tokens: string[]): { cutFeed: number; rapidFeed: number } | null {
  const isOneDp = (t?: string) => t != null && /^\d+\.\d$/.test(t)
  const methods: { at: number; min: number; rapid: boolean }[] = []
  tokens.forEach((t, i) => {
    const qty = tokens[i - 1], start = tokens[i + 1], total = tokens[i + 2]
    if (/^\d+\.\d{2}$/.test(t) && qty && !qty.includes('.') && isOneDp(start) && isOneDp(total))
      methods.push({ at: i, min: Number(total) - Number(start), rapid: Number(t) === 0 })
  })
  const rapidAt = methods.findIndex(m => m.rapid)
  if (methods.length < 2 || methods.filter(m => m.rapid).length !== 1) return null
  const tail = new Set(methods.flatMap(m => [m.at - 1, m.at, m.at + 1, m.at + 2]))
  const free = tokens.map((t, i) => ({ t, i, v: Number(t) })).filter(x => !tail.has(x.i))
  const feeds = free.filter(x => !x.t.includes('.') && x.v >= 100)
  const oneDp = free.filter(x => isOneDp(x.t))
  type Pick = { feed: number; len: number; min: number; used: number[]; err: number }
  const options: Pick[][] = methods.map(m => feeds.flatMap(f => oneDp.filter(t => Math.abs(t.v - m.min) <= 0.15).flatMap(t =>
    oneDp.filter(l => l.i !== t.i && Math.abs((l.v * 1000) / f.v - t.v) <= 0.06 + 50 / f.v)
      .map(l => ({ feed: f.v, len: l.v, min: t.v, used: [f.i, t.i, l.i], err: Math.abs((l.v * 1000) / f.v - t.v) })))))
  let best: Pick[] | null = null, bestErr = Infinity
  const walk = (k: number, used: Set<number>, picks: Pick[], err: number) => {
    if (err >= bestErr) return
    if (k === methods.length) {
      if (picks.every((p, j) => j === rapidAt || p.feed < picks[rapidAt].feed)) { best = [...picks]; bestErr = err }
      return
    }
    for (const o of options[k]) {
      if (o.used.some(i => used.has(i))) continue
      o.used.forEach(i => used.add(i)); picks.push(o)
      walk(k + 1, used, picks, err + o.err)
      picks.pop(); o.used.forEach(i => used.delete(i))
    }
  }
  walk(0, new Set(), [], 0)
  if (!best) return null
  const picks: Pick[] = best
  const cutting = picks.filter((_, j) => j !== rapidAt)
  return {
    cutFeed: cutting.length === 1 // one cutting method: its own feed, not a ratio of rounded numbers
      ? cutting[0].feed
      // length-weighted through the exact feeds: rounded times (a 0.3 m mark prints "0.0 min") would skew it
      : Math.round(cutting.reduce((a, p) => a + p.len, 0) / cutting.reduce((a, p) => a + p.len / p.feed, 0)),
    rapidFeed: picks[rapidAt].feed,
  }
}
export function parseMachineTimes(txt: string, pierces?: number): MachineTimes | null {
  const start = txt.indexOf('Machine times')
  if (start < 0) return null
  const body = txt.slice(start)
  const totalAt = body.search(/^Total\b/m)
  if (totalAt < 0) return null
  const header = body.search(/^m\tmm\/min/m) // the units row; numbers start after it
  const tokens = body.slice(header >= 0 ? header + 8 : 0, totalAt).match(/\d+(?:\.\d+)?/g) ?? []
  const ints = tokens.filter(t => !t.includes('.')).map(Number)
  const counted = (v: number) => ints.filter(x => x === v).length
  const feeds = [...new Set(ints.filter(v => v >= 100 && v !== pierces && counted(v) === 1))].sort((a, b) => a - b)
  const perItem = tokens.find(t => /^\d+\.\d{2}$/.test(t) && Number(t) > 0)
  if (feeds.length < 2 || !perItem) return null
  const oneDp = tokens.filter(t => /^\d+\.\d$/.test(t)).map(Number)
  // the longest (length, time) pair a feed explains, or null
  const pairOf = (feed: number) => {
    let best: { len: number; min: number } | null = null
    for (const len of oneDp) {
      const want = (len * 1000) / feed
      // the time must be another printed number than the length: a count near 1000 maps a value onto
      // itself, but a real ~1000 mm/min feed prints the same value twice (224 plates: 26.9 m in 26.9 min)
      const same = (x: number) => Math.abs(x - len) <= 0.05
      const t = oneDp.find(x => Math.abs(x - want) <= 0.08 && (!same(x) || oneDp.filter(same).length >= 2))
      if (want >= 0.1 && t != null && (!best || len > best.len)) best = { len, min: t }
    }
    return best
  }
  const paired = feeds.flatMap(f => { const p = pairOf(f); return p ? [{ f, ...p }] : [] })
  let cutFeed = feeds[0], rapidFeed = feeds[feeds.length - 1]
  const rows = feedsByRowTails(tokens)
  if (rows) ({ cutFeed, rapidFeed } = rows)
  else if (paired.length >= 2) {
    rapidFeed = Math.max(...paired.map(x => x.f))
    const cutting = paired.filter(x => x.f !== rapidFeed)
    cutFeed = cutting.length === 1
      ? cutting[0].f
      : Math.round((cutting.reduce((a, x) => a + x.len, 0) * 1000) / cutting.reduce((a, x) => a + x.min, 0))
  }
  const totalNums = (/^Total\b([^\n]*)/m.exec(body)?.[1].match(/\d+(?:\.\d+)?/g) ?? []).map(Number)
  return { cutFeed, rapidFeed, pierceMin: Number(perItem), totalMin: totalNums.length ? totalNums[totalNums.length - 1] : null }
}
