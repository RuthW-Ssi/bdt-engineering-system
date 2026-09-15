import * as fs from 'fs'
import * as path from 'path'
// Namespace import, not default — this repo's tsconfig has no
// esModuleInterop, so `import fontkit from '@pdf-lib/fontkit'` compiles to
// `fontkit_1.default` (undefined, since the package's CJS export has no
// `.default`), which fails pdf-lib's registerFontkit() with a misleading
// "no fontkit instance was found" — confirmed via the compiled output.
import * as fontkit from '@pdf-lib/fontkit'
import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib'
import type { MoPrintPacketPlan, MoPrintWorkOrderRow } from './mo-print.service'

// pdf-lib's built-in StandardFonts only encode WinAnsi (Latin-1) and throw
// on the first non-Latin character — project/zone names in this app are
// routinely Thai (e.g. "โกดังเก็บสินค้า Zone B"), so a real Unicode font
// must be embedded via fontkit instead. Sarabun (SIL OFL, see
// assets/fonts/sarabun/Sarabun-OFL.txt) is vendored as static .ttf files
// because @fontsource/sarabun only ships woff/woff2, which pdf-lib+fontkit
// doesn't embed — see the Dockerfile's `COPY --from=builder /app/assets`
// for why these must ship with the deployed image, not just work locally.
const FONT_DIR = path.join(process.cwd(), 'assets', 'fonts', 'sarabun')

// A4 in PDF points.
const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 40
const BLACK = rgb(0, 0, 0)
const GRAY = rgb(0.45, 0.45, 0.45)

interface Fonts {
  regular: PDFFont
  bold: PDFFont
}

function drawLabelValue(page: PDFPage, fonts: Fonts, x: number, y: number, label: string, value: string) {
  page.drawText(label, { x, y, size: 8, font: fonts.regular, color: GRAY })
  page.drawText(value, { x, y: y - 13, size: 11, font: fonts.bold, color: BLACK })
}

function drawSignBox(page: PDFPage, fonts: Fonts, x: number, y: number, width: number, height: number, label: string) {
  page.drawRectangle({ x, y: y - height, width, height, borderColor: BLACK, borderWidth: 0.75 })
  page.drawText(label, { x: x + 4, y: y - 11, size: 7, font: fonts.regular, color: GRAY })
}

function buildManifestPage(doc: PDFDocument, fonts: Fonts, plan: MoPrintPacketPlan): void {
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y = PAGE_HEIGHT - MARGIN

  page.drawText('Manufacturing Order — Work Order Packet', { x: MARGIN, y, size: 16, font: fonts.bold, color: BLACK })
  y -= 30

  const first = plan.rows[0]
  drawLabelValue(page, fonts, MARGIN, y, 'MO Code', plan.mo.mo_code)
  drawLabelValue(page, fonts, MARGIN + 150, y, 'Status', plan.mo.status)
  drawLabelValue(page, fonts, MARGIN + 300, y, 'Mark Prefix', plan.mo.primary_mark_prefix_code)
  y -= 35
  drawLabelValue(page, fonts, MARGIN, y, 'Project', first ? `${first.projectCode} — ${first.projectName}` : '—')
  drawLabelValue(page, fonts, MARGIN + 300, y, 'Due Date', plan.mo.due_date ? plan.mo.due_date.toISOString().slice(0, 10) : '—')
  y -= 35
  drawLabelValue(page, fonts, MARGIN, y, 'Zone', first ? (first.subZoneName ? `${first.zoneLabel} / ${first.subZoneName}` : first.zoneLabel) : '—')
  y -= 40

  // Table header
  const cols = [
    { label: 'Seq', x: MARGIN, w: 35 },
    { label: 'WO Code', x: MARGIN + 35, w: 90 },
    { label: 'Mark', x: MARGIN + 125, w: 110 },
    { label: 'Work Center', x: MARGIN + 235, w: 110 },
    { label: 'Qty', x: MARGIN + 345, w: 50 },
    { label: 'Status', x: MARGIN + 395, w: 100 },
  ]
  page.drawRectangle({ x: MARGIN, y: y - 18, width: PAGE_WIDTH - MARGIN * 2, height: 18, color: rgb(0.9, 0.9, 0.9) })
  for (const c of cols) page.drawText(c.label, { x: c.x + 3, y: y - 13, size: 9, font: fonts.bold, color: BLACK })
  y -= 18

  const rowHeight = 18
  for (const row of plan.rows) {
    if (y < MARGIN + rowHeight) {
      // Overflow protection — realistically a single MO's WO count stays
      // well within one manifest page (routing templates cap operations
      // per assembly), but never silently truncate the table if it doesn't.
      y = PAGE_HEIGHT - MARGIN
      doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    }
    const values = [String(row.wo.sequence), row.wo.wo_code, row.assemblyMark, row.workCenterName, row.qty != null ? String(row.qty) : '—', row.wo.status]
    cols.forEach((c, i) => page.drawText(values[i], { x: c.x + 3, y: y - 13, size: 9, font: fonts.regular, color: BLACK }))
    page.drawLine({ start: { x: MARGIN, y: y - rowHeight }, end: { x: PAGE_WIDTH - MARGIN, y: y - rowHeight }, thickness: 0.5, color: GRAY })
    y -= rowHeight
  }
}

function buildTravelerPage(doc: PDFDocument, fonts: Fonts, plan: MoPrintPacketPlan, row: MoPrintWorkOrderRow): void {
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y = PAGE_HEIGHT - MARGIN

  page.drawText(`${plan.mo.mo_code} — ${row.wo.wo_code}`, { x: MARGIN, y, size: 16, font: fonts.bold, color: BLACK })
  y -= 28

  drawLabelValue(page, fonts, MARGIN, y, 'Sequence / Work Center', `${row.wo.sequence} — ${row.workCenterName}`)
  drawLabelValue(page, fonts, MARGIN + 260, y, 'Mark', row.assemblyMark)
  y -= 35
  drawLabelValue(page, fonts, MARGIN, y, 'Qty to Produce', row.qty != null ? String(row.qty) : '—')
  drawLabelValue(page, fonts, MARGIN + 260, y, 'Zone', row.subZoneName ? `${row.zoneLabel} / ${row.subZoneName}` : row.zoneLabel)
  y -= 45

  // Operator sign-off row: name + start/end date
  const signW = (PAGE_WIDTH - MARGIN * 2 - 20) / 3
  drawSignBox(page, fonts, MARGIN, y, signW, 40, 'Operator Name / Signature')
  drawSignBox(page, fonts, MARGIN + signW + 10, y, signW, 40, 'Date Started')
  drawSignBox(page, fonts, MARGIN + (signW + 10) * 2, y, signW, 40, 'Date Finished')
  y -= 55

  // Qty result row: done / scrapped / reusable
  const qtyW = (PAGE_WIDTH - MARGIN * 2 - 20) / 3
  drawSignBox(page, fonts, MARGIN, y, qtyW, 30, 'Qty Done')
  drawSignBox(page, fonts, MARGIN + qtyW + 10, y, qtyW, 30, 'Qty Scrapped')
  drawSignBox(page, fonts, MARGIN + (qtyW + 10) * 2, y, qtyW, 30, 'Qty Reusable')
  y -= 45

  // QC sign-off
  drawSignBox(page, fonts, MARGIN, y, PAGE_WIDTH - MARGIN * 2, 40, 'QC Inspection — Name / Signature / Date')
  y -= 55

  // Notes — the rest of the page
  const notesHeight = y - MARGIN
  drawSignBox(page, fonts, MARGIN, y, PAGE_WIDTH - MARGIN * 2, notesHeight, 'Notes')
}

// Builds the full printable packet: one manifest page summarizing the MO,
// then per WO a signable traveler page immediately followed by that WO's
// matched shop-drawing PDF pages (merged in, not just linked — the whole
// point of embedding is a factory-floor team never has to hunt for a
// second document). `fetchDrawingBytes` is injected so this function stays
// pure/testable — the caller (MoPrintService) owns actually reaching file
// storage. Callers must have already resolved plan.rows against
// findLatestPdfForMark; this function trusts every row has a drawing.
export async function buildMoPrintPdf(
  plan: MoPrintPacketPlan,
  fetchDrawingBytes: (row: MoPrintWorkOrderRow) => Promise<Uint8Array>,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const fonts: Fonts = {
    regular: await doc.embedFont(fs.readFileSync(path.join(FONT_DIR, 'Sarabun-Regular.ttf'))),
    bold: await doc.embedFont(fs.readFileSync(path.join(FONT_DIR, 'Sarabun-Bold.ttf'))),
  }

  buildManifestPage(doc, fonts, plan)

  for (const row of plan.rows) {
    buildTravelerPage(doc, fonts, plan, row)

    const drawingBytes = await fetchDrawingBytes(row)
    const drawingDoc = await PDFDocument.load(drawingBytes)
    const copiedPages = await doc.copyPages(drawingDoc, drawingDoc.getPageIndices())
    copiedPages.forEach(p => doc.addPage(p))
  }

  return doc.save()
}
