import * as crypto from 'crypto'

// CutLogic 1D "Cutting layouts" report (CP-*.pdf), the only file Cutting Plan Shape reads (Tao 2026-11-10).
// Per report: title "Plan #668 - PIPE 113.5X2.4 - …", Note 2 = grade, totals (Yield, Stocks, Parts, Layouts, Kerf),
// then each layout "1 of 5 | stock # | [rest] | length | 10x" followed by its part rows
// "# | part # | [*] | mark | [*] | order # | length | count". The * carries no meaning (Tao): stripped.

export interface ShapePart { partNo: number; mark: string; lengthMm: number; count: number }
export interface ShapeLayout { seq: number; stockNo: number; stockLengthMm: number; restMm: number; repeat: number; parts: ShapePart[] }
export interface ShapePlan {
  planNo: number; title: string; profile: string; grade: string | null; kerfMm: number | null
  yieldPct: number; stocks: number; parts: number; partsLengthMm: number; layoutsCount: number; layouts: ShapeLayout[]
}

export class ShapeReportError extends Error {
  constructor(readonly problems: string[]) { super(problems.join('; ')) }
}

const CELL = ' | '
const MAX_PAGES = 200
const FOOTER = 'CutLogic 1D'

/** Every text line of the PDF, top to bottom, its cells joined by " | " (the preshop-pdf-parser pattern). */
export async function pdfLines(buffer: Buffer): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.js')
  let doc
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), disableWorker: true, isEvalSupported: false, verbosity: 0 }).promise
  } catch {
    throw new ShapeReportError(['Not a readable PDF'])
  }
  const out: string[] = []
  try {
    if (doc.numPages > MAX_PAGES) throw new ShapeReportError([`More than ${MAX_PAGES} pages`])
    for (let p = 1; p <= doc.numPages; p++) {
      const tc = await (await doc.getPage(p)).getTextContent()
      const items = (tc.items as { str: string; transform: number[] }[])
        .filter(i => i.str.trim())
        .map(i => ({ s: i.str.trim(), x: i.transform[4], y: i.transform[5] }))
      const lines: { y: number; items: typeof items }[] = []
      for (const it of items.sort((a, b) => b.y - a.y || a.x - b.x)) {
        const line = lines.find(l => Math.abs(l.y - it.y) < 2.5)
        if (line) line.items.push(it)
        else lines.push({ y: it.y, items: [it] })
      }
      for (const l of lines) out.push(l.items.sort((a, b) => a.x - b.x).map(i => i.s).join(CELL))
    }
  } finally {
    await doc.destroy()
  }
  return out
}

const num = (s: string | undefined) => (s == null ? NaN : Number(s.replace(/,/g, '').replace(/%$/, '')))
const isNum = (s: string | undefined) => s != null && /^[\d,]+(\.\d+)?%?$/.test(s)

/** "PIPEØ139.8X3.2" → "PIPE 139.8X3.2", "PIPE 165.2x4.5 SS500" → "PIPE 165.2X4.5", "ROD  RB25" → "ROD RB25". */
export function normaliseProfile(s: string): string {
  const t = s.toUpperCase().replace(/Ø/g, ' ').replace(/\s+/g, ' ').trim()
  const m = /^([A-Z]+)\s*([A-Z]*\d[\d.]*(?:\s*X\s*[\d.]+)*)/.exec(t)
  return m ? `${m[1]} ${m[2].replace(/\s+/g, '')}` : t
}

/** The size at the end of a CutLogic file name: "CP-… -PIPE 139.8X3.2-HSS550.pdf" → "PIPE 139.8X3.2". */
export function profileFromFileName(name: string): string | null {
  const base = name.replace(/\.pdf$/i, '')
  const m = /([A-Z]+\s*Ø?\s*[A-Z]*\d[\d.]*(?:\s*[xX]\s*[\d.]+)*)\s*-\s*[A-Z]*\d+[A-Z]*\s*$/i.exec(base)
  return m ? normaliseProfile(m[1]) : null
}

/** Same report → same fingerprint; the footer carries the print date/time, so it is left out. */
export function shapeFingerprint(lines: string[]): string {
  return crypto.createHash('sha1').update(lines.filter(l => !l.includes(FOOTER)).join('\n')).digest('hex')
}

export function parseCutLogic(lines: string[]): ShapePlan {
  const titleAt = lines.findIndex(l => /^Plan #\d+ - /.test(l))
  if (titleAt < 0 || !lines.some(l => l.startsWith('Cutting layouts'))) throw new ShapeReportError(['Not a CutLogic 1D cutting layout'])
  const title = lines[titleAt].split(CELL)[0]
  const tm = /^Plan #(\d+) - (.+?) - /.exec(title)
  if (!tm) throw new ShapeReportError(['Not a CutLogic 1D cutting layout'])

  const plan: ShapePlan = {
    planNo: Number(tm[1]), title, profile: normaliseProfile(tm[2]), grade: null, kerfMm: null,
    yieldPct: NaN, stocks: NaN, parts: NaN, partsLengthMm: NaN, layoutsCount: NaN, layouts: [],
  }
  const problems: string[] = []
  const after = (cells: string[], key: string) => cells[cells.indexOf(key) + 1]

  for (const line of lines.slice(titleAt + 1)) {
    if (line.includes(FOOTER)) continue
    const cells = line.split(CELL)
    if (cells[0] === 'Note 2' && cells[1] && cells[1] !== 'Yield') plan.grade = cells[1]
    if (cells.includes('Yield') && Number.isNaN(plan.yieldPct)) plan.yieldPct = num(after(cells, 'Yield'))
    if (cells.includes('Stocks') && Number.isNaN(plan.stocks)) plan.stocks = num(after(cells, 'Stocks'))
    if (cells[0] === 'Parts' && Number.isNaN(plan.parts)) { plan.parts = num(cells[1]); plan.partsLengthMm = num(cells[2]) }
    if (cells[0] === 'Layouts' && Number.isNaN(plan.layoutsCount)) plan.layoutsCount = num(cells[1])
    if (cells[0] === 'Kerf' && isNum(cells[1])) plan.kerfMm = num(cells[1])

    const lm = /^(\d+) of \d+$/.exec(cells[0])
    if (lm) {
      // "N of M | stock # | [description] | [rest] | length | 10x"
      const repeat = /^(\d+)x$/.exec(cells[cells.length - 1])
      const length = cells[cells.length - 2]
      const rest = cells.length >= 5 && isNum(cells[cells.length - 3]) ? cells[cells.length - 3] : undefined
      if (!repeat || !isNum(length) || !isNum(cells[1])) { problems.push(`Layout ${lm[1]}: cannot read "${line}"`); continue }
      plan.layouts.push({ seq: Number(lm[1]), stockNo: num(cells[1]), stockLengthMm: num(length), restMm: rest ? num(rest) : 0, repeat: Number(repeat[1]), parts: [] })
      continue
    }

    const layout = plan.layouts[plan.layouts.length - 1]
    if (layout && /^\d+$/.test(cells[0]) && /^\d+$/.test(cells[1] ?? '')) {
      // "# | part # | [*] | mark | [*] | order # | length | count"
      const body = cells.slice(2).filter(c => c !== '*').map(c => c.replace(/^\*\s*|\s*\*$/g, ''))
      const count = body[body.length - 1], length = body[body.length - 2]
      if (body.length < 4 || !/^\d+$/.test(count) || !isNum(length)) { problems.push(`Layout ${layout.seq}: cannot read part row "${line}"`); continue }
      layout.parts.push({ partNo: Number(cells[1]), mark: body[0], lengthMm: num(length), count: Number(count) })
    }
  }

  for (const [k, v] of [['Yield', plan.yieldPct], ['Stocks', plan.stocks], ['Parts', plan.parts], ['Layouts', plan.layoutsCount]] as const) {
    if (Number.isNaN(v)) problems.push(`${k} total not found`)
  }
  if (problems.length) throw new ShapeReportError(problems)
  return plan
}

/** The report's own totals must match its layouts; [] when they do. */
export function planProblems(p: ShapePlan): string[] {
  const out: string[] = []
  const stocks = p.layouts.reduce((t, l) => t + l.repeat, 0)
  const parts = p.layouts.reduce((t, l) => t + l.repeat * l.parts.reduce((s, x) => s + x.count, 0), 0)
  if (p.layouts.length !== p.layoutsCount) out.push(`Layouts: found ${p.layouts.length}, the report says ${p.layoutsCount}`)
  if (stocks !== p.stocks) out.push(`Stocks: layouts add up to ${stocks}, the report says ${p.stocks}`)
  if (parts !== p.parts) out.push(`Parts: layouts add up to ${parts}, the report says ${p.parts}`)
  for (const l of p.layouts) if (!l.parts.length) out.push(`Layout ${l.seq} has no parts`)
  return out
}
