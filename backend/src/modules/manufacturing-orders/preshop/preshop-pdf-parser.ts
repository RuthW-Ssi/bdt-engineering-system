import { BadRequestException } from '@nestjs/common'

// Pre-shop drawing PDF (Tekla "BILL OF MATERIAL" on each assembly drawing,
// 2026-10-07): one assembly per page — "BUH1-3 FOR 1 UNIT ONLY", its parts per
// set and "TOTAL <kg> <m²>" (per set). "TOTAL REQUIRED <n> SETS" is the whole
// project's count, not the zone's — ignored; the user types the sets
// (2026-10-08), so qty comes back 0 (= not entered). Parsed in
// memory, never stored. pdfRows() rebuilds the table rows from the text layer
// (Tekla splits words into separate items); parseBomRows() reads them.

export interface PreshopPart {
  part_mark: string
  profile: string
  length_mm: number
  grade: string
  qty: number // per set
  unit_weight_kg: number
}

export interface PreshopAssembly {
  assembly_mark: string
  name?: string | null // from the Dispatch Note's Name column (2026-10-09)
  qty: number // sets — 0 from a PDF until the user types it
  weight_kg: number | null // per set
  surface_area_m2: number | null // per set
  length_mm: number | null // longest part
  width_mm?: number | null
  height_mm?: number | null
  parts: PreshopPart[]
  source_file?: string // which uploaded file it came from (display only, not stored)
}

const n = (s: string) => Number(s.replace(/,/g, ''))
const ASSEMBLY = /^(\S+)\s+FOR\s+1\s+UNIT\s+ONLY\b/i
// part, profile, length, grade, qty, unit kg, total kg, area
const PART = /^(\S+)\s+(\S+)\s+([\d.,]+)\s+(\S+)\s+(\d+(?:\.\d+)?)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/
const SET_TOTAL = /^TOTAL\s+([\d.,]+)\s+([\d.,]+)$/i

export function parseBomRows(rows: string[]): PreshopAssembly[] {
  const out: PreshopAssembly[] = []
  let cur: PreshopAssembly | null = null
  for (const raw of rows) {
    const row = raw.trim()
    const a = ASSEMBLY.exec(row)
    if (a) {
      cur = { assembly_mark: a[1], qty: 0, weight_kg: null, surface_area_m2: null, length_mm: null, parts: [] }
      out.push(cur)
      continue
    }
    if (!cur) continue
    if (/^TOTAL\s+REQUIRED\b/i.test(row)) continue
    const t = SET_TOTAL.exec(row)
    if (t) { cur.weight_kg = n(t[1]); cur.surface_area_m2 = n(t[2]); continue }
    if (/^(GRAND\s+)?TOTAL\b/i.test(row)) continue
    const p = PART.exec(row)
    if (p) {
      const part = { part_mark: p[1], profile: p[2], length_mm: n(p[3]), grade: p[4], qty: n(p[5]), unit_weight_kg: n(p[6]) }
      cur.parts.push(part)
      cur.length_mm = Math.max(cur.length_mm ?? 0, part.length_mm)
    }
  }
  return out
}

// Bounded PDF uploads (security review M3, 2026-10-09): real PDFs only (".pdf" and the
// %PDF- header), at most 50 MB per request, at most MAX_PAGES pages read per file.
const MAX_TOTAL = 50 * 1024 * 1024
const MAX_PAGES = 200

export function checkPdfUploads(files: { originalname: string; size: number; buffer: Buffer }[]) {
  const bad = files.filter(f => !/\.pdf$/i.test(f.originalname) || f.buffer.subarray(0, 5).toString('latin1') !== '%PDF-').map(f => f.originalname)
  if (bad.length) throw new BadRequestException(`Not PDF files: ${bad.slice(0, 5).join(', ')}${bad.length > 5 ? ' …' : ''}`)
  if (files.reduce((t, f) => t + f.size, 0) > MAX_TOTAL) throw new BadRequestException('Pre-shop drawings: at most 50 MB per upload — upload in smaller batches')
}

/** Text rows of each page's BILL OF MATERIAL table (from "BILL" down to "FIELD BOLTS"). */
export async function pdfRows(buffer: Buffer): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.js')
  let doc
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), disableWorker: true, isEvalSupported: false, verbosity: 0 }).promise
  } catch {
    throw new BadRequestException('Pre-shop drawing: file is not a readable PDF')
  }
  const rows: string[] = []
  try {
  if (doc.numPages > MAX_PAGES) throw new BadRequestException(`Pre-shop drawing: more than ${MAX_PAGES} pages`)
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent()
    const items = (tc.items as { str: string; transform: number[] }[])
      .filter(i => i.str.trim())
      .map(i => ({ s: i.str.trim(), x: i.transform[4], y: i.transform[5] }))
    const bill = items.find(i => i.s === 'BILL' || i.s.startsWith('BILL OF MATERIAL'))
    if (!bill) continue
    const bolts = items.find(i => i.s.startsWith('FIELD') && i.y < bill.y)
    const box = items.filter(i => i.y < bill.y && i.y > (bolts?.y ?? -Infinity) && i.x > bill.x - 400 && i.x < bill.x + 600)
    const lines: { y: number; items: typeof box }[] = []
    for (const it of box.sort((a, b) => b.y - a.y || a.x - b.x)) {
      const line = lines.find(l => Math.abs(l.y - it.y) < 2.5)
      if (line) line.items.push(it)
      else lines.push({ y: it.y, items: [it] })
    }
    for (const l of lines) rows.push(l.items.sort((a, b) => a.x - b.x).map(i => i.s).join(' '))
  }
  } finally {
    await doc.destroy() // freed on every path, errors included
  }
  return rows
}
