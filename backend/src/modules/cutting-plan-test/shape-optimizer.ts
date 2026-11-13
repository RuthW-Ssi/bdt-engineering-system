// CP-Shape-Test (2026-11-11, wiki features/cp-shape-test.md): our own 1D cutting layouts for one size, in place of
// CutLogic. Column generation (LP duals → bounded knapsack for the best new pattern) builds the patterns; an
// integer pick over them (HiGHS MIP) and a dive (fix the LP's whole columns, re-solve the rest) give two answers
// and the shorter one wins. Same rules as CutLogic: each part takes its length + kerf, the last kerf may run off
// the end; rest = stock − Σ(length + kerf), floored at 0; minimise total stock length.
// On the 0X222 NP zone 3 run (6 sizes) it reaches CutLogic's stock count and length on every size.
// Audit 2026-11-12: every LP carries a slack column per length (cost 2 × longest stock), so a tight limit never makes
// an LP infeasible mid-search — a true shortage shows as slack left in the converged LP; the search is bounded by
// work (LP solves, MIP nodes), not wall-clock, so the same input always gives the same plan; the result is checked
// (assertResult) before it goes out.
import type { Highs } from 'highs'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const highsLoader: () => Promise<Highs> = require('highs')

export class ShapeOptimizeError extends Error {}

export interface ShapePart { mark: string; lengthMm: number; count: number }
export interface ShapeStock { lengthMm: number; qty: number | null } // qty null = unlimited
// One layout = one cutting pattern (Tao 2026-11-11, option ก): the lengths cut from each stock, repeated `repeat`
// times; `marks` says which marks those pieces are, in total over the repeats (CutLogic instead splits by mark)
export interface ShapeLayout {
  stockLengthMm: number; repeat: number; restMm: number; cuts: number
  pieces: { lengthMm: number; count: number }[]
  marks: { mark: string; lengthMm: number; pcs: number }[]
  nestMm?: number[] // saddle nesting (saddle.ts): how much earlier each next piece starts, joint by joint
}
export interface ShapeResult {
  stocks: number; stockLengthMm: number; partsLengthMm: number; scrapMm: number; kerfMm: number; yieldPct: number
  nestedMm: number // saddle nesting: how much of the parts length tucked into other pieces (0 without nesting)
  cuts: number; stockMix: { lengthMm: number; pieces: number }[]; layouts: ShapeLayout[]; method: 'mip' | 'dive'
  timedOut: boolean // the work budget cut the search short: valid layouts, maybe not the fewest stocks
}

const GRID = 10 // knapsack grid: 0.1 mm; part weights round up and capacity rounds down, so a priced pattern always fits
const MIP_NODES = 2000 // integer pick: stops within NEAR_BOUND of its bound or at this node limit (deterministic), not seconds
const MAX_ROUNDS = 400
const MAX_SOLVES = 1500 // LP solves over the whole search (column generation + dive); the picks found so far then stand
const SAFETY_MS = 120_000 // default deadline: a last resort against a runaway request; the only non-deterministic exit
const NEAR_BOUND = 0.002 // integer pick within 0.2% of the LP bound: good enough, no dive
const EPS = 1e-6

let highsPromise: Promise<Highs> | null = null
const highs = () => (highsPromise ??= highsLoader())

type Pattern = { stock: number; x: number[] }

// Bounded knapsack (binary splitting); choices kept as bitsets to stay small on long stock
function knapsack(values: number[], weights: number[], bounds: number[], cap: number) {
  const items: [number, number, number, number][] = []
  values.forEach((v, i) => {
    for (let k = 1, d = bounds[i]; d > 0; k *= 2) { const t = Math.min(k, d); items.push([i, t, v * t, weights[i] * t]); d -= t }
  })
  // 0/1 over the split items, in place (capacity downwards), one bitset of choices per item
  const best = new Float64Array(cap + 1)
  const take: (Uint8Array | null)[] = []
  for (const [, , v, w] of items) {
    if (w > cap || v <= 1e-12) { take.push(null); continue }
    const bits = new Uint8Array((cap >> 3) + 1)
    for (let c = cap; c >= w; c--) {
      const cand = best[c - w] + v
      if (cand > best[c] + 1e-12) { best[c] = cand; bits[c >> 3] |= 1 << (c & 7) }
    }
    take.push(bits)
  }
  const x = values.map(() => 0)
  let c = cap
  for (let k = items.length - 1; k >= 0; k--) {
    const bits = take[k]
    if (bits && bits[c >> 3] & (1 << (c & 7))) { const [i, t, , w] = items[k]; x[i] += t; c -= w }
  }
  return { value: best[cap], x }
}

// Same answer as knapsack(), by branch and bound on the real lengths: a stock holds a handful of pieces, so this is
// usually far faster than the 0.1 mm table. Gives up (null) past a node limit; the table then decides.
const BB_NODES = 30_000
function knapsackBB(values: number[], lengths: number[], bounds: number[], capMm: number) {
  const order = values.map((v, i) => i).filter(i => values[i] > 1e-12 && lengths[i] <= capMm + 1e-9)
    .sort((a, b) => values[b] / lengths[b] - values[a] / lengths[a])
  const x = values.map(() => 0), cur = values.map(() => 0)
  let best = 0, nodes = 0
  const upper = (k: number, room: number) => {
    let ub = 0
    for (let t = k; t < order.length && room > 1e-9; t++) {
      const i = order[t], n = Math.min(bounds[i], room / lengths[i])
      ub += n * values[i]; room -= n * lengths[i]
    }
    return ub
  }
  const dfs = (k: number, room: number, val: number): boolean => {
    if (++nodes > BB_NODES) return false
    if (val > best + 1e-12) { best = val; order.forEach(i => { x[i] = cur[i] }) }
    if (k === order.length || val + upper(k, room) <= best + 1e-12) return true
    const i = order[k]
    for (let n = Math.min(bounds[i], Math.floor((room + 1e-9) / lengths[i])); n >= 0; n--) {
      cur[i] = n
      if (!dfs(k + 1, room - n * lengths[i], val + n * values[i])) return false
    }
    cur[i] = 0
    return true
  }
  return dfs(0, capMm, 0) ? { value: best, x } : null
}

// Every demand row of an LP carries a slack column a_i (one piece left uncut) at `slack` cost, so the LP is always
// feasible: a real cover of a piece costs at most one longest stock, so an optimal LP uses slack only when no real
// cover exists. The integer pick has no slack: any plan it finds, even cut short, is a real cover (or it is infeasible).
function lpModel(pats: Pattern[], stock: ShapeStock[], demand: number[], qty: (number | null)[], slack: number, integer: boolean) {
  const out = ['Minimize', ' obj: ' + [...pats.map((p, j) => `${stock[p.stock].lengthMm} x${j}`), ...(integer ? [] : demand.map((_, i) => `${slack} a${i}`))].join(' + '), 'Subject To']
  demand.forEach((d, i) => {
    const terms = pats.flatMap((p, j) => (p.x[i] ? [`${p.x[i]} x${j}`] : []))
    out.push(` d${i}: ${[...terms, ...(integer ? [] : [`a${i}`])].join(' + ')} >= ${d}`)
  })
  qty.forEach((q, s) => {
    if (q == null) return
    const terms = pats.flatMap((p, j) => (p.stock === s ? [`x${j}`] : []))
    if (terms.length) out.push(` q${s}: ${terms.join(' + ')} <= ${q}`)
  })
  if (integer) out.push('General', ' ' + pats.map((_, j) => `x${j}`).join(' '))
  out.push('End')
  return out.join('\n')
}

// Why the stock is short, in the user's terms: which pieces only fit the limited lengths, and which limits
function shortage(parts: ShapePart[], stock: ShapeStock[]) {
  const mm = (v: number) => v.toLocaleString('en-US')
  const longestFree = Math.max(0, ...stock.filter(s => s.qty == null).map(s => s.lengthMm))
  const limited = stock.filter(s => s.qty != null).map(s => `${mm(s.lengthMm)} mm × ${s.qty}`).join(', ')
  const pcs = parts.filter(p => p.lengthMm > longestFree).reduce((n, p) => n + p.count, 0)
  return longestFree
    ? `Not enough stock: ${pcs} pcs are longer than ${mm(longestFree)} mm and only fit the limited lengths (${limited}), which cannot hold them all. Clear a limit or add a longer length without a limit.`
    : `Not enough stock: ${pcs} pcs only fit the limited lengths (${limited}), which cannot hold them all. Clear a limit or add a length without a limit.`
}

// The result is checked before it goes out: every mark cut as many times as asked, no layout past its stock (the last
// kerf may run off the end), no limit broken. A slip here throws (a 500), never a wrong plan.
export function assertResult(parts: ShapePart[], stock: ShapeStock[], kerfMm: number, r: Pick<ShapeResult, 'layouts'>) {
  const mm = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 })
  const fail = (what: string) => { throw new Error(`CP-Shape-Test: layouts failed the check — ${what}`) }
  const cut = new Map<string, number>()
  r.layouts.forEach((l, i) => {
    const n = l.pieces.reduce((s, p) => s + p.count, 0)
    const nest = l.nestMm ?? []
    if (l.nestMm && nest.length !== n - 1) fail(`layout ${i + 1}: ${nest.length} joints for ${n} pieces`)
    const used = l.pieces.reduce((s, p) => s + p.count * (p.lengthMm + kerfMm), 0) - nest.reduce((a, b) => a + b, 0)
    if (used - kerfMm > l.stockLengthMm + EPS) fail(`layout ${i + 1} runs ${mm(used - kerfMm - l.stockLengthMm)} mm past the stock`)
    if (l.repeat < 1 || !Number.isInteger(l.repeat)) fail(`layout ${i + 1} repeats ${l.repeat} times`)
    const pcs = l.marks.reduce((s, m) => s + m.pcs, 0)
    if (pcs !== n * l.repeat) fail(`layout ${i + 1}: ${pcs} marks for ${n * l.repeat} pieces`)
    for (const m of l.marks) cut.set(`${m.mark}|${m.lengthMm}`, (cut.get(`${m.mark}|${m.lengthMm}`) ?? 0) + m.pcs)
  })
  for (const p of parts) {
    const k = `${p.mark}|${p.lengthMm}`
    if ((cut.get(k) ?? 0) !== p.count) fail(`${p.mark} ${mm(p.lengthMm)} mm: ${p.count} pcs needed, ${cut.get(k) ?? 0} laid out`)
    cut.delete(k)
  }
  if (cut.size) fail(`laid out but not asked for: ${[...cut.keys()].slice(0, 5).join(', ')}`)
  for (const s of stock) {
    const used = r.layouts.filter(l => l.stockLengthMm === s.lengthMm).reduce((n, l) => n + l.repeat, 0)
    if (s.qty != null && used > s.qty) fail(`${mm(s.lengthMm)} mm: ${used} used, limit ${s.qty}`)
  }
}

// creditMm (saddle nesting, saddle.ts): per length, how much a piece may tuck into the one before it. A piece then
// weighs length + kerf − credit, and a pattern with any such piece loses the largest credit, since the first piece of
// a chain has nothing to tuck into: Σ(length + kerf − credit) ≤ stock + kerf − max credit keeps the real chain within
// stock + kerf. A pattern with no nesting piece keeps the full stock (audit 2026-11-12: it used to lose the credit too).
export async function optimizeShape(parts: ShapePart[], stock: ShapeStock[], kerfMm: number, opts: { maxSolves?: number; mipNodes?: number; creditMm?: Map<number, number>; deadline?: number } = {}): Promise<ShapeResult> {
  const solver = await highs()
  const maxStock = Math.max(...stock.map(s => s.lengthMm))
  const tooLong = parts.find(p => p.lengthMm > maxStock)
  if (tooLong) throw new ShapeOptimizeError(`${tooLong.mark} (${tooLong.lengthMm.toLocaleString('en-US')} mm) is longer than every stock length`)

  const demandOf = new Map<number, number>()
  for (const p of parts) demandOf.set(p.lengthMm, (demandOf.get(p.lengthMm) ?? 0) + p.count)
  const lens = [...demandOf.keys()].sort((a, b) => b - a)
  const D0 = lens.map(l => demandOf.get(l)!)
  const credit = (l: number) => opts.creditMm?.get(l) ?? 0
  const maxCredit = Math.max(0, ...lens.map(credit))
  const nests = lens.map(l => credit(l) > 0)
  const weight = lens.map(l => l + kerfMm - credit(l))
  const w = weight.map(v => Math.ceil(v * GRID - 1e-9))
  const capMm = (s: number, nesting: boolean) => stock[s].lengthMm + kerfMm - (nesting ? maxCredit : 0)
  const capOf = (s: number, nesting: boolean) => Math.floor(capMm(s, nesting) * GRID + 1e-9)
  const key = (p: Pattern) => `${p.stock}:${p.x.join(',')}`
  const slackCost = 2 * maxStock

  const budget = opts.maxSolves ?? MAX_SOLVES
  const started = Date.now()
  let solves = 0
  let timedOut = false
  // Tao 2026-11-13: the deadline (epoch ms) bounds every step, the integer picks too (HiGHS time_limit): Z08 nest ran
  // past 300 s in one MIP after the work budget was spent
  const endAt = opts.deadline ?? started + SAFETY_MS
  const spent = () => solves >= budget || Date.now() > endAt
  const secondsLeft = () => Math.max(0.05, (endAt - Date.now()) / 1000)
  type Solved = { Status: string; ObjectiveValue: number; Columns: Record<string, { Primal: number } | undefined>; Rows: { Name: string; Dual?: number }[] }
  const solve = (model: string, options: Record<string, unknown> = {}): Solved => {
    solves++
    const r = solver.solve(model, options)
    // an LP is never infeasible (slack columns); a MIP may be infeasible (limits) or stopped at its node limit
    // (status "Unknown") with its best plan so far
    if (r.Status !== 'Optimal' && options.mip_max_nodes == null) throw new ShapeOptimizeError('Could not finish the layouts')
    return r as unknown as Solved
  }
  const slackUsed = (lp: Solved) => D0.some((_, i) => (lp.Columns[`a${i}`]?.Primal ?? 0) > EPS)

  // The best pattern for one stock at the current duals: over the plain lengths with the full stock, and over all of
  // them with the stock less the credit; whichever is worth more
  const price = (y: number[], demand: number[], si: number) => {
    const plain = nests.some(Boolean) ? y.map((v, i) => (nests[i] ? 0 : v)) : y
    let best = knapsackBB(plain, weight, demand, capMm(si, false)) ?? knapsack(plain, w, demand, capOf(si, false))
    if (maxCredit > 0) {
      const nested = knapsackBB(y, weight, demand, capMm(si, true)) ?? knapsack(y, w, demand, capOf(si, true))
      if (nested.value > best.value + 1e-9) best = nested
    }
    return best
  }

  // Column generation on a demand: returns the patterns and the final LP
  const generate = (demand: number[], qty: (number | null)[], start: Pattern[] = []) => {
    const pats: Pattern[] = []
    const seen = new Set<string>()
    const add = (p: Pattern) => { if (!seen.has(key(p))) { seen.add(key(p)); pats.push(p) } }
    start.forEach(p => { if (qty[p.stock] !== 0) add(p) })
    stock.forEach((_, s) => lens.forEach((_, i) => {
      const n = Math.min(Math.floor(capOf(s, nests[i]) / w[i]), demand[i])
      if (n > 0) { const x = lens.map(() => 0); x[i] = n; add({ stock: s, x }) }
    }))
    let lp = solve(lpModel(pats, stock, demand, qty, slackCost, false))
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const rows = new Map<string, number>(lp.Rows.map(r => [r.Name, r.Dual ?? 0]))
      const y = demand.map((_, i) => rows.get(`d${i}`) ?? 0)
      let added = 0
      stock.forEach((s, si) => {
        const { value, x } = price(y, demand, si)
        const p = { stock: si, x }
        if (value - s.lengthMm - (rows.get(`q${si}`) ?? 0) > 1e-6 && !seen.has(key(p))) { add(p); added++ }
      })
      if (!added) break
      if (spent()) { timedOut = true; break }
      lp = solve(lpModel(pats, stock, demand, qty, slackCost, false))
    }
    return { pats, lp }
  }

  const pool: Pattern[] = []
  const inPool = new Set<string>()
  const keep = (ps: Pattern[]) => ps.forEach(p => { if (!inPool.has(key(p))) { inPool.add(key(p)); pool.push(p) } })
  type Group = { stock: number; x: number[]; n: number }
  const lengthOf = (g: Group[]) => g.reduce((s, u) => s + stock[u.stock].lengthMm * u.n, 0)
  const pick = (pats: Pattern[], demand: number[], qty: (number | null)[]): Group[] | null => {
    const r = solve(lpModel(pats, stock, demand, qty, slackCost, true), { mip_max_nodes: opts.mipNodes ?? MIP_NODES, mip_rel_gap: NEAR_BOUND, time_limit: secondsLeft() })
    if (r.Status === 'Infeasible') return null
    if (r.Status !== 'Optimal') timedOut = true
    const g = pats.map((p, j) => ({ stock: p.stock, x: p.x.slice(), n: Math.round(r.Columns[`x${j}`]?.Primal ?? 0) })).filter(u => u.n > 0)
    return demand.every((dem, i) => g.reduce((s, u) => s + u.x[i] * u.n, 0) >= dem) ? g : null
  }

  // 1. Patterns for the whole demand, and the best integer pick over them
  const first = generate(D0, stock.map(s => s.qty))
  keep(first.pats)
  const bound = first.lp.ObjectiveValue
  let groups = pick(pool, D0, stock.map(s => s.qty))
  let method: ShapeResult['method'] = 'mip'
  const better = (g: Group[] | null, how: ShapeResult['method']) => {
    if (g && (!groups || lengthOf(g) < lengthOf(groups) - 1e-6)) { groups = g; method = how }
  }

  // 2. Not close to the bound: dive (fix the LP's whole columns, or its largest one, and re-solve the rest from fresh
  //    patterns), then pick again over every pattern the dive found. Reusing patterns inside the dive made it land
  //    1 stock worse on 2 CutLogic sizes. Past the work budget the dive stops and the picks found so far stand.
  if (!groups || lengthOf(groups) > bound * (1 + NEAR_BOUND)) {
    const fixed: Group[] = []
    let d = D0.slice()
    const qty = stock.map(s => s.qty)
    let ok = true
    for (let guard = 0; d.some(v => v > 0); guard++) {
      if (guard > 10_000) { ok = false; timedOut = true; break }
      const { pats, lp } = generate(d, qty)
      keep(pats)
      const vals = pats.map((_, j) => lp.Columns[`x${j}`]?.Primal ?? 0)
      // budget spent: round this LP up — every row is covered (no slack used) — within the limits, or no dive answer
      if (spent()) {
        timedOut = true
        if (slackUsed(lp)) { ok = false; break }
        const up = pats.map((p, j) => ({ stock: p.stock, x: p.x.slice(), n: Math.ceil(vals[j] - 1e-9) })).filter(u => u.n > 0)
        ok = up.every(u => qty[u.stock] == null) || stock.every((_, si) => qty[si] == null || up.filter(u => u.stock === si).reduce((n, u) => n + u.n, 0) <= qty[si]!)
        if (ok) fixed.push(...up)
        break
      }
      let whole: (readonly [number, number])[] = vals.map((v, j) => [j, Math.floor(v + 1e-9)] as const).filter(([, f]) => f >= 1)
      if (!whole.length) whole = [[vals.indexOf(Math.max(...vals)), 1]]
      let moved = false
      for (const [j, f0] of whole) {
        const p = pats[j]
        const q = qty[p.stock]
        const f = q == null ? f0 : Math.min(f0, q)
        if (f <= 0) continue
        if (q != null) qty[p.stock] = q - f
        fixed.push({ stock: p.stock, x: p.x.slice(), n: f })
        d = d.map((v, i) => Math.max(0, v - p.x[i] * f))
        moved = true
      }
      if (!moved) { ok = false; break } // the rest only fits stock that is used up: no dive answer
    }
    if (ok) better(fixed, 'dive')
    better(pick(pool, D0, stock.map(s => s.qty)), 'mip')
  }
  const chosen = groups as Group[] | null
  if (!chosen) throw new ShapeOptimizeError(slackUsed(first.lp) ? shortage(parts, stock) : 'Could not finish the layouts')
  let final: Group[] = chosen.map(g => ({ ...g, x: g.x.slice() }))

  // Over-cover from ≥ rows: drop the extra pieces (splitting a group when only part of it needs it)
  lens.forEach((_, i) => {
    let extra = final.reduce((s, g) => s + g.x[i] * g.n, 0) - D0[i]
    for (let gi = 0; extra > 0 && gi < final.length; gi++) {
      const g = final[gi]
      while (extra > 0 && g.x[i] > 0) {
        if (extra >= g.n) { g.x[i]--; extra -= g.n }
        else { const x = g.x.slice(); x[i]--; final.push({ stock: g.stock, x, n: extra }); g.n -= extra; extra = 0 }
      }
    }
  })
  final = final.filter(g => g.n > 0 && g.x.some(Boolean))

  // One layout per pattern (identical patterns from the dive and the pick merged), then hand out each length's
  // marks over the layouts in order
  const byPattern = new Map<string, Group>()
  for (const g of final) {
    const k = `${g.stock}|${g.x.join(',')}`
    const same = byPattern.get(k)
    if (same) same.n += g.n
    else byPattern.set(k, { ...g })
  }
  const queue = lens.map(l => parts.filter(p => p.lengthMm === l).map(p => ({ mark: p.mark, left: p.count })))
  const layouts = new Map<string, ShapeLayout>()
  const ordered = [...byPattern.values()].sort((a, b) => stock[b.stock].lengthMm - stock[a.stock].lengthMm || b.n - a.n)
  for (const g of ordered) {
    const L = stock[g.stock].lengthMm
    // nesting pieces first, side by side, so they chain; each one after the first tucks in by its credit
    const order = lens.map((_, i) => i).filter(i => g.x[i]).sort((a, b) => (nests[b] ? 1 : 0) - (nests[a] ? 1 : 0) || a - b)
    const seq = order.flatMap(i => Array<number>(g.x[i]).fill(lens[i]))
    const nestMm = seq.slice(1).map((l, k) => (credit(l) > 0 && credit(seq[k]) > 0 ? credit(l) : 0))
    const used = g.x.reduce((s, c, i) => s + c * (lens[i] + kerfMm), 0) - nestMm.reduce((a, b) => a + b, 0)
    const restMm = Math.max(0, L - used)
    const tail = L - (used - kerfMm) // what is left past the last piece: a stub shorter than a kerf still gets cut off
    const count = g.x.reduce((s, c) => s + c, 0)
    const marks: ShapeLayout['marks'] = []
    g.x.forEach((c, i) => {
      for (let need = c * g.n; need > 0;) {
        const q = queue[i].find(m => m.left > 0)
        if (!q) throw new Error(`CP-Shape-Test: no mark left for a ${lens[i]} mm piece`)
        const take = Math.min(need, q.left)
        q.left -= take; need -= take
        marks.push({ mark: q.mark, lengthMm: lens[i], pcs: take })
      }
    })
    layouts.set(`${g.stock}|${g.x.join(',')}`, {
      stockLengthMm: L, repeat: g.n, restMm, cuts: tail > EPS ? count : count - 1,
      pieces: order.map(i => ({ lengthMm: lens[i], count: g.x[i] })),
      marks,
      ...(maxCredit > 0 ? { nestMm } : {}),
    })
  }

  const list = [...layouts.values()].sort((a, b) => b.stockLengthMm - a.stockLengthMm || b.repeat - a.repeat)
  assertResult(parts, stock, kerfMm, { layouts: list })
  const stockLengthMm = list.reduce((s, l) => s + l.stockLengthMm * l.repeat, 0)
  const partsLengthMm = parts.reduce((s, p) => s + p.lengthMm * p.count, 0)
  const scrapMm = list.reduce((s, l) => s + l.restMm * l.repeat, 0)
  const nestedMm = list.reduce((s, l) => s + (l.nestMm ?? []).reduce((a, b) => a + b, 0) * l.repeat, 0)
  const footprintMm = partsLengthMm - nestedMm // what the parts take up on the bars
  return {
    stocks: list.reduce((s, l) => s + l.repeat, 0),
    stockLengthMm, partsLengthMm, scrapMm, kerfMm: stockLengthMm - footprintMm - scrapMm, nestedMm,
    yieldPct: (footprintMm / stockLengthMm) * 100,
    cuts: list.reduce((s, l) => s + l.cuts * l.repeat, 0),
    stockMix: stock.map(s => ({ lengthMm: s.lengthMm, pieces: list.filter(l => l.stockLengthMm === s.lengthMm).reduce((n, l) => n + l.repeat, 0) })),
    layouts: list,
    method,
    timedOut,
  }
}
