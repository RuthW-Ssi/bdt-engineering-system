// Per-piece job sheet ("ใบงานต่อชิ้น") — PDF layout. One A4 portrait
// page per sheet: piece identity + QR, material, traceability/schedule,
// hole summary, routing operations with sign-off boxes, remarks.
//
// Follows the print packet's conventions (mo-print/mo-print-pdf-builder.ts):
// pdf-lib + fontkit with the vendored Sarabun TTF (Thai needs an embedded
// font — pdf-lib's standard fonts are Latin-1 only), `{ subset: true }` so
// Thai tone marks stack correctly, the same QR generator, labels passed in
// as an explicit `L`. Runs on a worker thread (job-sheet-worker.ts).
//
// DRAFT form: content/layout needs production + QA approval before use as a
// controlled record.
import * as fs from 'fs'
import * as path from 'path'
// `import * as` on purpose — no esModuleInterop in this repo (see the note
// at the top of mo-print-pdf-builder.ts).
import * as fontkit from '@pdf-lib/fontkit'
import { PDFDocument, PageSizes, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'
import { generateWoQrPng } from '../mo-print/mo-print-qr'
import type { PrintLang } from '../mo-print/mo-print-labels'
import { JOB_SHEET_LABELS, type JobSheetLabels } from './job-sheet-labels'
import { fitText, fmtJobSheetDate, fmtKg, fmtMm, formatJobSheetTitle, totalHoles } from './job-sheet-format'
import type { JobSheet, JobSheetPlan } from './job-sheet.types'

const FONT_DIR = path.join(process.cwd(), 'assets', 'fonts', 'sarabun')
const LOGO_PATH = path.join(process.cwd(), 'assets', 'logo', 'powerkeychain-logo.png')

const [PAGE_W, PAGE_H] = PageSizes.A4
const MARGIN = 36
const BORDER_INSET = 20
const CONTENT_W = PAGE_W - MARGIN * 2
const BAND_H = 20
const GRID_ROW_H = 30
const SECTION_GAP = 8
const QR_BOX = 126
const ROUTING_ROW_H = 26
const ROUTING_ROW_MIN_H = 16
const MIN_ROUTING_ROWS = 6
const MAX_HOLE_CELLS = 6

const BLACK = rgb(0, 0, 0)
const GRAY = rgb(0.45, 0.45, 0.45)
const BAND_FILL = rgb(0.9, 0.9, 0.9)
const HEAD_FILL = rgb(0.95, 0.95, 0.95)
const RED = rgb(0.78, 0.13, 0.16)

interface Fonts {
  regular: PDFFont
  bold: PDFFont
}

interface Cell {
  label: string
  value: string
  bold?: boolean
  size?: number
  weight?: number
  hint?: string // gray text shown when value is empty (hand-fill prompt)
}

function drawBand(page: PDFPage, fonts: Fonts, x: number, top: number, width: number, title: string): number {
  page.drawRectangle({ x, y: top - BAND_H, width, height: BAND_H, color: BAND_FILL, borderColor: BLACK, borderWidth: 0.75 })
  page.drawText(title, { x: x + 6, y: top - BAND_H + 6, size: 10, font: fonts.bold, color: BLACK })
  return top - BAND_H
}

function drawFitted(page: PDFPage, font: PDFFont, text: string, x: number, y: number, maxWidth: number, size: number, color = BLACK): void {
  if (!text) return
  const f = fitText(text, maxWidth, size, 6, (t, s) => font.widthOfTextAtSize(t, s))
  page.drawText(f.text, { x, y, size: f.size, font, color })
}

// Label-over-value form grid: each row is a list of cells sharing the width
// by `weight`. Returns the y of the grid's bottom edge.
function drawGrid(page: PDFPage, fonts: Fonts, x: number, top: number, width: number, rows: Cell[][], rowH = GRID_ROW_H): number {
  let y = top
  for (const row of rows) {
    const totalWeight = row.reduce((s, c) => s + (c.weight ?? 1), 0)
    let cx = x
    for (const cell of row) {
      const w = (width * (cell.weight ?? 1)) / totalWeight
      page.drawRectangle({ x: cx, y: y - rowH, width: w, height: rowH, borderColor: BLACK, borderWidth: 0.75 })
      page.drawText(cell.label, { x: cx + 5, y: y - 10, size: 7, font: fonts.regular, color: GRAY })
      if (cell.value) drawFitted(page, cell.bold ? fonts.bold : fonts.regular, cell.value, cx + 5, y - rowH + 6, w - 10, cell.size ?? 11)
      else if (cell.hint) page.drawText(cell.hint, { x: cx + 5, y: y - rowH + 6, size: 7, font: fonts.regular, color: GRAY })
      cx += w
    }
    y -= rowH
  }
  return y
}

// Ruled table with a shaded header. Empty-string cells stay blank (sign-off
// boxes). Returns the y of the table's bottom edge.
function drawTable(page: PDFPage, fonts: Fonts, x: number, top: number, width: number, cols: { label: string; weight: number }[], rows: string[][], rowH: number): number {
  const headerH = 18
  const total = cols.reduce((s, c) => s + c.weight, 0)
  const xs: number[] = []
  let cx = x
  for (const c of cols) {
    xs.push(cx)
    cx += (width * c.weight) / total
  }
  xs.push(x + width)
  page.drawRectangle({ x, y: top - headerH, width, height: headerH, color: HEAD_FILL, borderColor: BLACK, borderWidth: 0.75 })
  cols.forEach((c, i) => drawFitted(page, fonts.bold, c.label, xs[i] + 4, top - headerH + 5, xs[i + 1] - xs[i] - 8, 8))
  let y = top - headerH
  for (const r of rows) {
    page.drawRectangle({ x, y: y - rowH, width, height: rowH, borderColor: BLACK, borderWidth: 0.75 })
    r.forEach((v, i) => drawFitted(page, fonts.regular, v, xs[i] + 4, y - rowH / 2 - 3, xs[i + 1] - xs[i] - 8, 9))
    y -= rowH
  }
  for (let i = 1; i < cols.length; i++) {
    page.drawLine({ start: { x: xs[i], y: top }, end: { x: xs[i], y }, thickness: 0.75, color: BLACK })
  }
  return y
}

function drawHeader(page: PDFPage, fonts: Fonts, L: JobSheetLabels, logo: PDFImage | null, plan: JobSheetPlan, sheet: JobSheet): number {
  const top = PAGE_H - MARGIN
  let textX = MARGIN
  if (logo) {
    const h = 30
    const w = (logo.width / logo.height) * h
    page.drawImage(logo, { x: MARGIN, y: top - h, width: w, height: h })
    textX = MARGIN + w + 10
  }
  page.drawText(L.title, { x: textX, y: top - 22, size: 18, font: fonts.bold, color: BLACK })
  const right = L.sheetOf(sheet.sheetNo, plan.sheets.length)
  const rightW = fonts.regular.widthOfTextAtSize(right, 9)
  page.drawText(right, { x: PAGE_W - MARGIN - rightW, y: top - 10, size: 9, font: fonts.regular, color: BLACK })
  // Per sheet: a zone batch mixes MOs.
  const moText = `${sheet.moCode}  Rev.${sheet.moRevision}`
  const moW = fonts.bold.widthOfTextAtSize(moText, 11)
  page.drawText(moText, { x: PAGE_W - MARGIN - moW, y: top - 26, size: 11, font: fonts.bold, color: BLACK })
  return top - 40
}

function drawSheet(doc: PDFDocument, fonts: Fonts, L: JobSheetLabels, logo: PDFImage | null, plan: JobSheetPlan, sheet: JobSheet, qr: PDFImage): void {
  const page = doc.addPage([PAGE_W, PAGE_H])
  page.drawRectangle({
    x: BORDER_INSET, y: BORDER_INSET,
    width: PAGE_W - BORDER_INSET * 2, height: PAGE_H - BORDER_INSET * 2,
    borderColor: BLACK, borderWidth: 1,
  })
  let y = drawHeader(page, fonts, L, logo, plan, sheet)

  // ── Identity (left) + QR (right) ────────────────────────────────────
  const idW = CONTENT_W - QR_BOX - 8
  const idTop = y
  y = drawBand(page, fonts, MARGIN, y, idW, L.identity)
  const zone = [sheet.zoneLabel, sheet.subZoneName].filter(Boolean).join(' / ')
  const project = [sheet.projectCode, sheet.projectName].filter(Boolean).join(' — ')
  y = drawGrid(page, fonts, MARGIN, y, idW, [
    [{ label: L.project, value: project, weight: 2 }, { label: L.zone, value: zone }],
    [{ label: L.assembly, value: sheet.assemblyMark, bold: true, size: 13 }, { label: L.piece, value: sheet.pieceNo != null ? L.pieceOf(sheet.pieceNo, sheet.pieceTotal) : L.qtyOnly(sheet.pieceTotal), bold: true, size: 13 }],
  ])
  // Part mark — the one thing read from across the bay, so it gets the big type.
  const markH = QR_BOX + BAND_H - (idTop - y) > 34 ? QR_BOX + BAND_H - (idTop - y) : 34
  page.drawRectangle({ x: MARGIN, y: y - markH, width: idW, height: markH, borderColor: BLACK, borderWidth: 0.75 })
  page.drawText(L.partMark, { x: MARGIN + 5, y: y - 10, size: 7, font: fonts.regular, color: GRAY })
  drawFitted(page, fonts.bold, sheet.partMark, MARGIN + 5, y - markH + 10, idW - 10, 30)
  const identityBottom = y - markH

  const qrX = MARGIN + idW + 8
  const qrBoxH = idTop - identityBottom
  page.drawRectangle({ x: qrX, y: identityBottom, width: QR_BOX, height: qrBoxH, borderColor: BLACK, borderWidth: 0.75 })
  const qrSize = Math.min(QR_BOX - 12, qrBoxH - 26)
  page.drawImage(qr, { x: qrX + (QR_BOX - qrSize) / 2, y: identityBottom + qrBoxH - qrSize - 6, width: qrSize, height: qrSize })
  drawFitted(page, fonts.regular, sheet.pieceId, qrX + 4, identityBottom + 11, QR_BOX - 8, 7)
  drawFitted(page, fonts.regular, L.scanHint, qrX + 4, identityBottom + 3, QR_BOX - 8, 6, GRAY)
  y = identityBottom - SECTION_GAP

  // ── Material ────────────────────────────────────────────────────────
  y = drawBand(page, fonts, MARGIN, y, CONTENT_W, L.material)
  y = drawGrid(page, fonts, MARGIN, y, CONTENT_W, [
    [
      { label: L.profile, value: sheet.profile ?? '', bold: true, size: 13, weight: 2 },
      { label: L.grade, value: sheet.grade ?? '', bold: true, size: 13 },
      { label: L.unitWeight, value: fmtKg(sheet.unitWeight_kg) },
    ],
    [
      { label: L.length, value: fmtMm(sheet.length_mm) },
      { label: L.width, value: fmtMm(sheet.width_mm) },
      { label: L.thickness, value: fmtMm(sheet.thickness_mm) },
      { label: L.qtyPerAssembly, value: String(sheet.qtyPerAssembly) },
    ],
    [{ label: L.description, value: sheet.description ?? sheet.assemblyName ?? '' }],
  ])
  y -= SECTION_GAP

  // ── Traceability & schedule ─────────────────────────────────────────
  y = drawBand(page, fonts, MARGIN, y, CONTENT_W, L.trace)
  const drawing = sheet.drawings.length > 0
    ? sheet.drawings.map(d => `${d.file_name} (${L.drawingRev(d.rev)}, ${fmtJobSheetDate(d.uploaded_at)})`).join('; ')
    : ''
  y = drawGrid(page, fonts, MARGIN, y, CONTENT_W, [
    [
      { label: L.heatNo, value: sheet.heatNo ?? '', hint: L.handFill, bold: true },
      { label: L.plateId, value: sheet.plateId ?? '', hint: L.handFill, bold: true },
      { label: L.dueDate, value: fmtJobSheetDate(sheet.dueDate), hint: L.handFill, bold: true, size: 13 },
    ],
    [{ label: L.drawing, value: drawing, hint: L.noDrawing }],
  ])
  y -= SECTION_GAP

  // ── Hole summary ────────────────────────────────────────────────────
  const total = totalHoles(sheet.holes)
  y = drawBand(page, fonts, MARGIN, y, CONTENT_W, sheet.holesKnown ? `${L.holes} — ${L.holeTotal(total)}` : L.holes)
  if (!sheet.holesKnown) {
    page.drawRectangle({ x: MARGIN, y: y - 22, width: CONTENT_W, height: 22, borderColor: BLACK, borderWidth: 0.75 })
    page.drawText(L.noHoleData, { x: MARGIN + 6, y: y - 15, size: 9, font: fonts.regular, color: RED })
    y -= 22
  } else {
    // One grid row, a cell per diameter ("D22" over "x 4") with a tick box for
    // the checker — keeps the vertical space for the routing sign-off rows.
    const cells: Cell[] = sheet.holes.slice(0, MAX_HOLE_CELLS).map(g => ({ label: `${L.holeDia} D${g.diameter_mm}`, value: `x ${g.count}`, bold: true, size: 13 }))
    if (sheet.holes.length > MAX_HOLE_CELLS) {
      // never dropped silently: the last cell sums up the diameters that did not fit
      const rest = sheet.holes.slice(MAX_HOLE_CELLS - 1)
      cells[cells.length - 1] = { label: L.holeMore(rest.length), value: `x ${rest.reduce((s, g) => s + g.count, 0)}`, bold: true, size: 13 }
    }
    const rowTop = y
    y = drawGrid(page, fonts, MARGIN, y, CONTENT_W, [cells])
    const cellW = CONTENT_W / cells.length
    cells.forEach((_, i) => page.drawRectangle({ x: MARGIN + cellW * (i + 1) - 20, y: rowTop - GRID_ROW_H + 8, width: 12, height: 12, borderColor: BLACK, borderWidth: 0.75 }))
  }
  y -= SECTION_GAP

  // ── Routing operations with sign-off boxes ──────────────────────────
  const footerTop = BORDER_INSET + 34
  y = drawBand(page, fonts, MARGIN, y, CONTENT_W, L.routing)
  if (sheet.routing.length === 0) {
    page.drawRectangle({ x: MARGIN, y: y - 18, width: CONTENT_W, height: 18, borderColor: BLACK, borderWidth: 0.75 })
    page.drawText(L.noRouting, { x: MARGIN + 6, y: y - 13, size: 8, font: fonts.regular, color: RED })
    y -= 18
  }
  // Rows shrink (26 → 16pt) so a long routing still fits the one sheet; only
  // beyond that is the list capped — and the cap is printed, never silent.
  const available = y - 18 - footerTop
  const rowH = Math.max(ROUTING_ROW_MIN_H, Math.min(ROUTING_ROW_H, Math.floor(available / Math.max(sheet.routing.length, MIN_ROUTING_ROWS))))
  const capacity = Math.max(1, Math.floor(available / rowH))
  const ops = sheet.routing.slice(0, capacity)
  const rows = ops.map(op => [String(op.sequence), op.operationLabel ?? '', op.workCenterName, op.woCode ?? '', '', '', ''])
  // An over-long routing never drops silently: the last visible row says how many more there are.
  if (sheet.routing.length > capacity) rows[rows.length - 1] = ['...', `+${sheet.routing.length - capacity + 1}`, '', '', '', '', '']
  while (rows.length < Math.min(capacity, MIN_ROUTING_ROWS)) rows.push(['', '', '', '', '', '', ''])
  y = drawTable(page, fonts, MARGIN, y, CONTENT_W, [
    { label: L.seq, weight: 0.7 }, { label: L.operation, weight: 3.2 }, { label: L.workCenter, weight: 2.4 }, { label: L.wo, weight: 2 },
    { label: L.doneBy, weight: 2 }, { label: L.date, weight: 1.5 }, { label: L.qc, weight: 1.5 },
  ], rows, rowH)
  y -= SECTION_GAP

  // ── Remarks (ruled to the footer) ───────────────────────────────────
  if (y - BAND_H - 20 > footerTop) {
    y = drawBand(page, fonts, MARGIN, y, CONTENT_W, L.remarks)
    page.drawRectangle({ x: MARGIN, y: footerTop, width: CONTENT_W, height: y - footerTop, borderColor: BLACK, borderWidth: 0.75 })
  }

  // ── Footer ──────────────────────────────────────────────────────────
  const printed = L.printedAt(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(plan.generatedAt))
  page.drawText(printed, { x: MARGIN, y: BORDER_INSET + 20, size: 7, font: fonts.regular, color: GRAY })
  page.drawText(L.draft, { x: MARGIN, y: BORDER_INSET + 9, size: 7, font: fonts.regular, color: RED })
  const idW2 = fonts.regular.widthOfTextAtSize(sheet.pieceId, 7)
  page.drawText(sheet.pieceId, { x: PAGE_W - MARGIN - idW2, y: BORDER_INSET + 9, size: 7, font: fonts.regular, color: GRAY })
}

export async function buildJobSheetPdf(plan: JobSheetPlan, lang: PrintLang = 'en'): Promise<Uint8Array> {
  const L = JOB_SHEET_LABELS[lang]
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const fonts: Fonts = {
    regular: await doc.embedFont(fs.readFileSync(path.join(FONT_DIR, 'Sarabun-Regular.ttf')), { subset: true }),
    bold: await doc.embedFont(fs.readFileSync(path.join(FONT_DIR, 'Sarabun-Bold.ttf')), { subset: true }),
  }
  const logo = fs.existsSync(LOGO_PATH) ? await doc.embedPng(fs.readFileSync(LOGO_PATH)) : null
  doc.setTitle(formatJobSheetTitle(plan.mo?.mo_code ?? `ZONE-${plan.zone?.code ?? 'ALL'}`, plan.generatedAt))

  // In 'piece' mode every sheet has its own URL; in 'part' mode sheets can share one.
  const qrByUrl = new Map<string, PDFImage>()
  for (const sheet of plan.sheets) {
    let qr = qrByUrl.get(sheet.qrUrl)
    if (!qr) {
      qr = await doc.embedPng(await generateWoQrPng(sheet.qrUrl))
      qrByUrl.set(sheet.qrUrl, qr)
    }
    drawSheet(doc, fonts, L, logo, plan, sheet, qr)
  }
  return doc.save()
}
