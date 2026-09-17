import * as fs from 'fs'
import * as path from 'path'
// Namespace import, not default — this repo's tsconfig has no
// esModuleInterop, so `import fontkit from '@pdf-lib/fontkit'` compiles to
// `fontkit_1.default` (undefined, since the package's CJS export has no
// `.default`), which fails pdf-lib's registerFontkit() with a misleading
// "no fontkit instance was found" — confirmed via the compiled output.
import * as fontkit from '@pdf-lib/fontkit'
import { PageSizes, PDFDocument, PDFFont, PDFPage, rgb, type RGB } from 'pdf-lib'
import type { MoPrintPacketPlan, MoPrintWorkOrderRow } from './mo-print.service'
import { capList, fitTableRows, fitTextSize, fmt2, formatPlanDateTime, formatPrintPacketTitle, formatWoCodes, summarizeOperations } from './mo-print-format'
import { generateWoQrPng } from './mo-print-qr'

// pdf-lib's built-in StandardFonts only encode WinAnsi (Latin-1) and throw
// on the first non-Latin character — project/zone names in this app are
// routinely Thai (e.g. "โกดังเก็บสินค้า Zone B"), so a real Unicode font
// must be embedded via fontkit instead. Sarabun (SIL OFL, see
// assets/fonts/sarabun/Sarabun-OFL.txt) is vendored as static .ttf files
// because @fontsource/sarabun only ships woff/woff2, which pdf-lib+fontkit
// doesn't embed — see the Dockerfile's `COPY --from=builder /app/assets`
// for why these must ship with the deployed image, not just work locally.
const FONT_DIR = path.join(process.cwd(), 'assets', 'fonts', 'sarabun')

// Same logo used in the app's Topbar/LoginPage (frontend `public/assets/
// logo/powerkeychain-logo.png`) — vendored into the backend's own assets
// so it ships with the Docker image (see FONT_DIR comment above for why).
const LOGO_PATH = path.join(process.cwd(), 'assets', 'logo', 'powerkeychain-logo.png')

// A3 landscape — PageSizes.A3 is [short, long] (portrait), so swapped
// (2026-09-16).
const [PAGE_HEIGHT, PAGE_WIDTH] = PageSizes.A3
const MARGIN = 40
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const BORDER_INSET = 20
const SECTION_BAND_HEIGHT = 18

// pdf-lib's CustomFontEmbedder pre-computes the embedded font's /W (glyph
// width) table from each Unicode codepoint's *default* glyph only — it
// never sees a contextual GSUB alternate (e.g. Sarabun's small-variant tone
// mark used after a tall vowel, as in "เชื่อม"). With no /DW fallback set,
// that glyph silently gets the PDF-spec default width of 1000 units instead
// of its real (0) width, rendering as a wide visible gap. Disabling the
// font's 'ccmp' feature makes fontkit select the plain (correctly-widthed)
// glyph instead — confirmed against every Thai material/zone/project name
// in the dev DB with zero regressions (2026-09-15).
const FONT_FEATURES = { ccmp: false }
const BLACK = rgb(0, 0, 0)
const GRAY = rgb(0.45, 0.45, 0.45)

interface Fonts {
  regular: PDFFont
  bold: PDFFont
}

// Full-width shaded section-title bar, sitting directly atop the block it
// labels (no gap) — matches real work-order forms that divide the page
// into named bands (e.g. "Wearer Profile", "Emblem Profile / Instructions")
// rather than a plain text title floating above a table (2026-09-16
// redesign, from a reference garment-industry work order the user shared).
function drawSectionBand(page: PDFPage, fonts: Fonts, x: number, y: number, width: number, title: string): number {
  const height = SECTION_BAND_HEIGHT
  page.drawRectangle({ x, y: y - height, width, height, color: rgb(0.85, 0.85, 0.85), borderColor: BLACK, borderWidth: 0.75 })
  page.drawText(title, { x: x + 8, y: y - 13, size: 10, font: fonts.bold, color: BLACK })
  return height
}

interface TableColumn { label: string; x: number; w: number }

// Lays a table's columns out left-to-right from relative width weights,
// scaled to span `width` (the full content width by default). The weights
// are each table's old portrait-A3 point widths, so every table keeps its
// proportions in landscape instead of leaving all the extra width to its
// last column (2026-09-16).
function layoutColumns(specs: [label: string, weight: number][], startX = MARGIN, width = CONTENT_WIDTH): TableColumn[] {
  const totalWeight = specs.reduce((sum, [, weight]) => sum + weight, 0)
  let x = startX
  return specs.map(([label, weight]) => {
    const col = { label, x, w: (width * weight) / totalWeight }
    x += col.w
    return col
  })
}

// Closes off an outer border + full-height column dividers around a
// shaded-header data table (Activities / Planned Consume / WO list) so it
// reads as one bordered block, consistent with the drawFormGrid sections —
// these tables draw per-row instead of in one drawFormGrid call (rows
// aren't known up front / can overflow across pages), so the border has to
// be closed off separately once the table's actual extent is known
// (2026-09-16 feedback: these looked like the odd ones out with no border).
function drawTableBorder(page: PDFPage, x: number, top: number, bottom: number, width: number, colXs: number[]) {
  page.drawRectangle({ x, y: bottom, width, height: top - bottom, borderColor: BLACK, borderWidth: 0.75 })
  for (const colX of colXs) {
    if (colX > x) page.drawLine({ start: { x: colX, y: top }, end: { x: colX, y: bottom }, thickness: 0.75, color: BLACK })
  }
}

interface FormGridCell { label: string; value?: string }
interface FormGridRow { height: number; cells: FormGridCell[]; widths?: number[] }

// Draws one continuous bordered grid — an outer rectangle plus internal
// row/column divider lines. Real shop-traveler forms (surveyed 2026-09-15:
// Carbon, ProShop, Codeware Shopfloor) use dense bordered tables for
// identification + sign-off fields, not separate floating boxes with gaps
// between them. Rows may have different column counts/widths (e.g. a
// 3-column row above a full-width row) while still sharing one border.
// A cell with no `value` is a blank hand-fill field (just the label). A
// value too long for its cell shrinks to fit rather than spilling into the
// next one.
function drawFormGrid(page: PDFPage, fonts: Fonts, x: number, y: number, width: number, rows: FormGridRow[]): number {
  const totalHeight = rows.reduce((sum, r) => sum + r.height, 0)
  page.drawRectangle({ x, y: y - totalHeight, width, height: totalHeight, borderColor: BLACK, borderWidth: 0.75 })

  let rowTop = y
  rows.forEach((row, rowIndex) => {
    const rowBottom = rowTop - row.height
    if (rowIndex > 0) {
      page.drawLine({ start: { x, y: rowTop }, end: { x: x + width, y: rowTop }, thickness: 0.75, color: BLACK })
    }
    const widths = row.widths ?? row.cells.map(() => width / row.cells.length)
    let colX = x
    row.cells.forEach((cell, i) => {
      if (i > 0) page.drawLine({ start: { x: colX, y: rowTop }, end: { x: colX, y: rowBottom }, thickness: 0.75, color: BLACK })
      page.drawText(cell.label, { x: colX + 6, y: rowTop - 11, size: 7, font: fonts.regular, color: GRAY })
      if (cell.value) {
        const size = fitTextSize(fonts.bold, cell.value, widths[i] - 12, 10)
        page.drawText(cell.value, { x: colX + 6, y: rowTop - 24, size, font: fonts.bold, color: BLACK })
      }
      colX += widths[i]
    })
    rowTop = rowBottom
  })
  return totalHeight
}

// Every manifest/traveler page gets an outer frame — a printed factory
// form reads as unfinished without one. Never applied to the embedded shop
// drawing pages (those are the source file's own content, untouched).
function addPrintPage(doc: PDFDocument): PDFPage {
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  page.drawRectangle({
    x: BORDER_INSET, y: BORDER_INSET,
    width: PAGE_WIDTH - BORDER_INSET * 2, height: PAGE_HEIGHT - BORDER_INSET * 2,
    borderColor: BLACK, borderWidth: 1,
  })
  return page
}

// MO page (2026-09-16 redesign from the user's hand sketch): the header
// row, then two columns —
//   left:  MO Info, then a Routing checklist — one row per routing
//          operation with a blank Release / Done tick box plus a Date cell
//          each, for the office admin to mark dispatch and completion by
//          hand;
//   right: the MO's Assembly List, ruled down to the bottom of the page
//          (a long list continues on full-width pages after it).
// MO-level Consume is no longer printed here — each WO traveler still has
// its own. The Assembly Part List follows on its own page(s).
const MO_LEFT_COL_WIDTH = 500
const MO_COL_GAP = 16
const MO_RIGHT_COL_WIDTH = CONTENT_WIDTH - MO_COL_GAP - MO_LEFT_COL_WIDTH
const ROUTING_ROW_HEIGHT = 30
const MO_ASSEMBLY_ROW_HEIGHT = 18

async function buildManifestPage(doc: PDFDocument, fonts: Fonts, plan: MoPrintPacketPlan): Promise<void> {
  const page = addPrintPage(doc)
  const columnsTop = PAGE_HEIGHT - MARGIN - (await drawMoHeader(doc, page, fonts)) - 20

  let y = columnsTop
  y -= drawSectionBand(page, fonts, MARGIN, y, MO_LEFT_COL_WIDTH, 'MO Info')
  // Project/Zone live on each WO's traveler and in the Assembly List — a
  // single MO can span several projects/zones (one per assembly's dispatch).
  y -= drawFormGrid(page, fonts, MARGIN, y, MO_LEFT_COL_WIDTH, [
    {
      height: 30,
      cells: [
        { label: 'Manufacturing Order', value: plan.mo.mo_code },
        // Static plant identifier, not the MO's workflow status — this
        // system only prints packets for the BIF factory (2026-09-16).
        { label: 'Manufacturing Factory', value: 'BIF' },
      ],
    },
    {
      height: 30,
      cells: [
        { label: 'Mark Prefix', value: plan.mo.primary_mark_prefix_code },
        { label: 'Due Date', value: plan.mo.due_date ? plan.mo.due_date.toISOString().slice(0, 10) : '—' },
      ],
    },
  ])
  drawRoutingChecklist(page, fonts, plan, MARGIN, y - 12, MO_LEFT_COL_WIDTH)

  drawMoAssemblyList(doc, page, fonts, plan, MARGIN + MO_LEFT_COL_WIDTH + MO_COL_GAP, columnsTop)

  buildAssemblyPartsPages(doc, fonts, plan)
}

// Company logo + name lockup on the left (same lockup as the app's own
// Topbar — logo, then "SSI BUILDING TECH" / "POWER KEYCHAIN" stacked to its
// right), document title right-aligned on the same row. Returns its height.
async function drawMoHeader(doc: PDFDocument, page: PDFPage, fonts: Fonts): Promise<number> {
  const top = PAGE_HEIGHT - MARGIN
  const logoPng = await doc.embedPng(fs.readFileSync(LOGO_PATH))
  const logoHeight = 34
  const logoWidth = logoHeight * (logoPng.width / logoPng.height)
  const logoY = top - logoHeight
  const textX = MARGIN + logoWidth + 10

  page.drawImage(logoPng, { x: MARGIN, y: logoY, width: logoWidth, height: logoHeight })
  page.drawText('SSI BUILDING TECH', { x: textX, y: logoY + logoHeight / 2 + 4, size: 10, font: fonts.bold, color: BLACK })
  page.drawText('POWER KEYCHAIN', { x: textX, y: logoY + logoHeight / 2 - 9, size: 8, font: fonts.regular, color: GRAY })

  const title = 'Manufacturing Order'
  const titleSize = 16
  const titleWidth = fonts.bold.widthOfTextAtSize(title, titleSize)
  page.drawText(title, { x: PAGE_WIDTH - MARGIN - titleWidth, y: logoY + logoHeight / 2 - titleSize / 2 + 3, size: titleSize, font: fonts.bold, color: BLACK })
  return logoHeight
}

// Draws one data row's values into an already-ruled table row, vertically
// centered, each shrunk to fit its column.
function drawRowValues(page: PDFPage, fonts: Fonts, cols: TableColumn[], rowTop: number, rowHeight: number, values: string[], size = 8): void {
  values.forEach((value, i) => {
    if (!value) return
    const c = cols[i]
    page.drawText(value, { x: c.x + 3, y: rowTop - rowHeight / 2 - size * 0.35, size: fitTextSize(fonts.regular, value, c.w - 6, size), font: fonts.regular, color: BLACK })
  })
}

function drawTickBox(page: PDFPage, col: TableColumn, rowTop: number, rowHeight: number): void {
  const size = 12
  page.drawRectangle({ x: col.x + (col.w - size) / 2, y: rowTop - (rowHeight + size) / 2, width: size, height: size, borderColor: BLACK, borderWidth: 0.75 })
}

// One row per routing operation (not per WO — today each operation has one
// WO per mark; see summarizeOperations), ruled down to the page bottom.
function drawRoutingChecklist(page: PDFPage, fonts: Fonts, plan: MoPrintPacketPlan, x: number, top: number, width: number): void {
  const bandHeight = drawSectionBand(page, fonts, x, top, width, 'Routing')
  const cols = layoutColumns([
    ['Seq', 30], ['Operation', 160], ['Work Center', 100], ['WO', 95],
    // Tick-box columns carry no label of their own — the group label
    // (Release / Done) is enough (2026-09-16 feedback).
    ['', 30], ['Date', 70], ['', 30], ['Date', 70],
  ], x, width)
  const groups: ColumnGroup[] = [{ label: 'Release', first: 4, last: 5 }, { label: 'Done', first: 6, last: 7 }]
  const headerTop = top - bandHeight
  const bodyTop = headerTop - HEADER_ROW_HEIGHT * 2
  const ops = summarizeOperations(plan.rows.map(r => ({
    sequence: r.wo.sequence, operationLabel: r.operationLabel, workCenterName: r.workCenterName, woCode: r.wo.wo_code,
  })))
  const rowCount = Math.max(ops.length, Math.floor((bodyTop - MARGIN) / ROUTING_ROW_HEIGHT))
  const rowHeight = (bodyTop - MARGIN) / rowCount

  drawRuledTable(page, fonts, cols, groups, headerTop, rowHeight, rowCount)
  ops.forEach((op, i) => {
    const rowTop = bodyTop - rowHeight * i
    drawRowValues(page, fonts, cols, rowTop, rowHeight, [String(op.sequence), op.operationLabel ?? '—', op.workCenterName, formatWoCodes(op.woCodes)], 9)
    drawTickBox(page, cols[4], rowTop, rowHeight)
    drawTickBox(page, cols[6], rowTop, rowHeight)
  })
}

// The MO's marks (one row per mo_assembly_line), ruled down the right
// column. Marks that don't fit continue on full-width pages right after
// the MO page.
const MO_ASSEMBLY_COLUMNS: [label: string, weight: number][] = [
  ['No.', 24], ['Project', 70], ['Zone', 90], ['Mark', 90], ['Name', 110],
  ['Width (mm)', 55], ['Length (mm)', 55], ['Height (mm)', 55], ['Weight (kg)', 60], ['Qty', 40],
]

function drawMoAssemblyList(doc: PDFDocument, page: PDFPage, fonts: Fonts, plan: MoPrintPacketPlan, x: number, top: number): void {
  const markValues = (mark: MoPrintPacketPlan['marks'][number]) => [
    String(mark.seq),
    mark.projectCode,
    mark.subZoneName ? `${mark.zoneLabel} / ${mark.subZoneName}` : mark.zoneLabel,
    mark.assemblyMark,
    mark.name ?? '—',
    mark.width_mm != null ? fmt2(mark.width_mm) : '—',
    mark.length_mm != null ? fmt2(mark.length_mm) : '—',
    mark.height_mm != null ? fmt2(mark.height_mm) : '—',
    mark.weight_kg != null ? fmt2(mark.weight_kg) : '—',
    fmt2(mark.qty),
  ]
  // Draws one page's worth of the list; returns how many marks it placed.
  const drawChunk = (target: PDFPage, chunkX: number, chunkTop: number, width: number, title: string, marks: MoPrintPacketPlan['marks']) => {
    const bandHeight = drawSectionBand(target, fonts, chunkX, chunkTop, width, title)
    const cols = layoutColumns(MO_ASSEMBLY_COLUMNS, chunkX, width)
    const headerTop = chunkTop - bandHeight
    const bodyTop = headerTop - HEADER_ROW_HEIGHT * 2
    const capacity = Math.floor((bodyTop - MARGIN) / MO_ASSEMBLY_ROW_HEIGHT)
    const rowHeight = (bodyTop - MARGIN) / capacity
    drawRuledTable(target, fonts, cols, [], headerTop, rowHeight, capacity)
    const placed = marks.slice(0, capacity)
    placed.forEach((mark, i) => drawRowValues(target, fonts, cols, bodyTop - rowHeight * i, rowHeight, markValues(mark)))
    return placed.length
  }

  let remaining = plan.marks
  remaining = remaining.slice(drawChunk(page, x, top, MO_RIGHT_COL_WIDTH, 'Assembly List', remaining))
  while (remaining.length > 0) {
    remaining = remaining.slice(drawChunk(addPrintPage(doc), MARGIN, PAGE_HEIGHT - MARGIN, CONTENT_WIDTH, 'Assembly List (cont.)', remaining))
  }
}

// Assembly Part List — every assembly in the MO as a shaded group row,
// with the bom_parts (cut pieces) it needs listed beneath it (2026-09-16,
// replacing a flat part list aggregated across assemblies). Right of each
// part: blank By / Qty cells for at most three withdrawals — a part may be
// drawn from the store no more than 3 times — then a Note cell.
// Starts on its own page after the MO page and overflows onto more,
// repeating the column header and — mid-group — the assembly's row.
function buildAssemblyPartsPages(doc: PDFDocument, fonts: Fonts, plan: MoPrintPacketPlan): void {
  if (plan.assemblyParts.length === 0) return
  let currentPage = addPrintPage(doc)
  let y = PAGE_HEIGHT - MARGIN
  y -= drawSectionBand(currentPage, fonts, MARGIN, y, CONTENT_WIDTH, 'Assembly Part List')

  const cols = layoutColumns([
    ['Part Mark', 130], ['Profile', 110], ['Grade', 70], ['Qty', 55], ['Weight (kg)', 70],
    ['By', 95], ['Qty', 50], ['By', 95], ['Qty', 50], ['By', 95], ['Qty', 50],
    ['Note', 140],
  ])
  const withdrawalGroups: ColumnGroup[] = ['1st', '2nd', '3rd'].map((nth, i) => ({
    label: `${nth} Withdrawal`, first: 5 + i * 2, last: 6 + i * 2,
  }))
  const groupHeight = 18
  const partHeight = 16
  const partIndent = 14
  let tableTop = y

  const drawDividers = (top: number, bottom: number) => {
    for (const c of cols.slice(1)) currentPage.drawLine({ start: { x: c.x, y: top }, end: { x: c.x, y: bottom }, thickness: 0.75, color: BLACK })
  }
  const drawRule = () => {
    currentPage.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + CONTENT_WIDTH, y }, thickness: 0.5, color: GRAY })
  }
  const drawHeader = () => {
    y -= drawGroupedHeader(currentPage, fonts, cols, withdrawalGroups, y)
  }
  // No column dividers across a group row — its label spans the table.
  const drawGroupRow = (group: MoPrintPacketPlan['assemblyParts'][number], continued: boolean) => {
    currentPage.drawRectangle({ x: MARGIN, y: y - groupHeight, width: CONTENT_WIDTH, height: groupHeight, color: rgb(0.95, 0.95, 0.95) })
    const label = [group.assemblyMark, group.name, `Assembly Qty ${fmt2(group.qty)}`].filter(Boolean).join('   ·   ')
    currentPage.drawText(continued ? `${label}   (cont.)` : label, { x: MARGIN + 4, y: y - 13, size: 9, font: fonts.bold, color: BLACK })
    y -= groupHeight
    drawRule()
  }
  const closeTable = () => {
    currentPage.drawRectangle({ x: MARGIN, y, width: CONTENT_WIDTH, height: tableTop - y, borderColor: BLACK, borderWidth: 0.75 })
  }
  const startNewPage = () => {
    closeTable()
    y = PAGE_HEIGHT - MARGIN
    currentPage = addPrintPage(doc)
    tableTop = y
    drawHeader()
  }

  drawHeader()
  for (const group of plan.assemblyParts) {
    // Never strand a group row at the bottom of a page without its first part.
    if (y - groupHeight - partHeight < MARGIN) startNewPage()
    drawGroupRow(group, false)
    for (const part of group.parts.length > 0 ? group.parts : [null]) {
      if (y - partHeight < MARGIN) {
        startNewPage()
        drawGroupRow(group, true)
      }
      const values = part
        ? [part.part_mark, part.profile ?? '—', part.grade ?? '—', fmt2(part.qty), part.weight_kg != null ? fmt2(part.weight_kg) : '—']
        : ['No parts']
      values.forEach((value, i) => {
        const inset = i === 0 ? partIndent : 3
        const c = cols[i]
        currentPage.drawText(value, { x: c.x + inset, y: y - 11.5, size: fitTextSize(fonts.regular, value, c.w - inset - 3, 8), font: fonts.regular, color: part ? BLACK : GRAY })
      })
      drawDividers(y, y - partHeight)
      y -= partHeight
      drawRule()
    }
  }
  closeTable()
}

// WO traveler — exactly one A3-landscape page per WO, in two columns
// (2026-09-16 redesign from the user's hand sketch):
//   left:  Work Order Details + QR → Consume → Production Time →
//          Activities. Consume and Activities split the leftover height
//          evenly (2026-09-16: "ลด activity และเพิ่ม consume ให้เท่ากัน").
//          The bottom-left QC Inspection box was dropped the same day —
//          the right column's QC log (with Signature/Note per check)
//          replaces it.
//   right: Assembly List beside a QC record table (Self-check + QC),
//          both ruled all the way down the page
// Nothing ever overflows onto a second page — see drawCappedTable for how
// a list longer than its slot is handled.
const TRAVELER_COL_GAP = 16
// The right column is a hand-written check log, so it gets the wider share
// of the page (2026-09-16: "เอา qc กว้างกว่าเลยเพราะ user ต้องมาเขียนลง
// กระดาษ"); long values in the narrower left column shrink to fit.
const TRAVELER_LEFT_COL_WIDTH = 480
const TRAVELER_RIGHT_COL_WIDTH = CONTENT_WIDTH - TRAVELER_COL_GAP - TRAVELER_LEFT_COL_WIDTH
const TRAVELER_SECTION_GAP = 12
const PRODUCTION_ROW_HEIGHT = 34
// Consume/Activities tables: preferred row height, and the floor rows may
// shrink to (6pt text — the smallest that stays legible printed) before a
// long list gets capped.
const LIST_ROW_HEIGHT = 15
const LIST_MIN_ROW_HEIGHT = 11

async function buildTravelerPage(doc: PDFDocument, fonts: Fonts, plan: MoPrintPacketPlan, row: MoPrintWorkOrderRow): Promise<void> {
  const page = addPrintPage(doc)
  const top = PAGE_HEIGHT - MARGIN
  const leftX = MARGIN
  const colWidth = TRAVELER_LEFT_COL_WIDTH

  // Left column, top-down.
  let y = top
  y -= drawSectionBand(page, fonts, leftX, y, colWidth, 'Work Order Details')
  y -= (await drawWoDetails(doc, page, fonts, plan, row, leftX, y, colWidth)) + TRAVELER_SECTION_GAP
  const productionHeight = SECTION_BAND_HEIGHT + PRODUCTION_ROW_HEIGHT * 2
  const listSlotHeight = (y - MARGIN - productionHeight - TRAVELER_SECTION_GAP * 2) / 2

  drawWoConsume(page, fonts, row, leftX, y, colWidth, listSlotHeight)
  y -= listSlotHeight + TRAVELER_SECTION_GAP
  drawProductionTime(page, fonts, row, leftX, y, colWidth)
  y -= productionHeight + TRAVELER_SECTION_GAP
  drawActivities(page, fonts, row, leftX, y, colWidth, listSlotHeight)

  drawAssemblyAndQcRecord(page, fonts, row, MARGIN + colWidth + TRAVELER_COL_GAP, top, TRAVELER_RIGHT_COL_WIDTH)

  drawWoWatermark(page, fonts, row)
}

// Identification grid + the QR in its own bordered box to the grid's
// right, sized to the grid's height and centered in it. The QR points at
// this WO's page in the app — no scan-to-complete flow exists yet (see
// mo-print-qr.ts). Planned time moved out of here into Production Time.
async function drawWoDetails(doc: PDFDocument, page: PDFPage, fonts: Fonts, plan: MoPrintPacketPlan, row: MoPrintWorkOrderRow, x: number, top: number, width: number): Promise<number> {
  const qrColWidth = 110
  const qrGap = 10
  const gridWidth = width - qrColWidth - qrGap
  const gridHeight = drawFormGrid(page, fonts, x, top, gridWidth, [
    { height: 30, cells: [{ label: 'Manufacturing Order', value: plan.mo.mo_code }, { label: 'Work Order', value: row.wo.wo_code }] },
    {
      height: 30,
      cells: [
        { label: 'Sequence / Work Center', value: `${row.wo.sequence} — ${row.workCenterName}` },
        // The specific routing operation (e.g. "SAW auto weld"), distinct
        // from the work center (the physical station) — resolved
        // server-side from source_routing_op_id.
        { label: 'Operation', value: row.operationLabel ?? '—' },
      ],
    },
    {
      // Per WO, not on the manifest — a single MO can span multiple
      // projects/zones since each WO's assembly has its own dispatch.
      height: 30,
      cells: [
        { label: 'Project', value: `${row.projectCode} — ${row.projectName}` },
        { label: 'Zone', value: row.subZoneName ? `${row.zoneLabel} / ${row.subZoneName}` : row.zoneLabel },
      ],
    },
    { height: 30, cells: [{ label: 'Mark', value: row.assemblyMark }, { label: 'Quantity', value: row.qty != null ? fmt2(row.qty) : '—' }] },
  ])

  const qrBoxX = x + gridWidth + qrGap
  page.drawRectangle({ x: qrBoxX, y: top - gridHeight, width: qrColWidth, height: gridHeight, borderColor: BLACK, borderWidth: 0.75 })
  const qrPng = await doc.embedPng(await generateWoQrPng(row.woUrl))
  const qrSize = Math.min(qrColWidth, gridHeight) - 12 * 2
  page.drawImage(qrPng, {
    x: qrBoxX + (qrColWidth - qrSize) / 2,
    y: top - gridHeight + (gridHeight - qrSize) / 2,
    width: qrSize,
    height: qrSize,
  })
  return gridHeight
}

// This WO's own share of material consumption (same formulas as the
// manifest's MO-wide Consume table, evaluated against just this WO), with
// an "Actual" hand-fill column, plus Requested By / Responsible sign
// boxes beside it. Fills its `slotHeight` exactly (see fitTableRows).
function drawWoConsume(page: PDFPage, fonts: Fonts, row: MoPrintWorkOrderRow, x: number, top: number, width: number, slotHeight: number): void {
  const bandHeight = drawSectionBand(page, fonts, x, top, width, 'Consume')
  const signWidth = 140
  const { capacity, rowHeight } = fitTableRows(slotHeight - bandHeight, row.consume.length, LIST_ROW_HEIGHT, LIST_MIN_ROW_HEIGHT)
  const cols = layoutColumns([['Code', 100], ['Material', 300], ['Qty', 70], ['Unit', 50], ['Actual', 90]], x, width - signWidth)
  const tableHeight = drawCappedTable(page, fonts, cols, top - bandHeight, rowHeight, capacity, row.consume.map(item => ({
    values: [item.code, item.name, fmt2(item.qty), item.unit ?? '—', ''],
  })))
  drawFormGrid(page, fonts, x + width - signWidth, top - bandHeight, signWidth, [
    { height: tableHeight / 2, cells: [{ label: 'Requested By' }] },
    { height: tableHeight / 2, cells: [{ label: 'Responsible' }] },
  ])
}

// Who's on the job, plus planned vs actual timing. Plan Start/Finish come
// from the active production schedule (blank when unscheduled); Plan
// Duration is the WO's setup + run minutes (the same numbers the WO was
// created with). The Actual row is blank for hand-fill.
function drawProductionTime(page: PDFPage, fonts: Fonts, row: MoPrintWorkOrderRow, x: number, top: number, width: number): void {
  const bandHeight = drawSectionBand(page, fonts, x, top, width, 'Production Time')
  const responsibleWidth = 130
  const rowHeight = PRODUCTION_ROW_HEIGHT
  drawFormGrid(page, fonts, x, top - bandHeight, responsibleWidth, [
    { height: rowHeight * 2, cells: [{ label: 'Responsible', value: row.assignedTo ?? undefined }] },
  ])
  const plannedTotal = row.wo.setup_time_min + row.wo.expected_duration_min
  drawFormGrid(page, fonts, x + responsibleWidth, top - bandHeight, width - responsibleWidth, [
    {
      height: rowHeight,
      cells: [
        { label: 'Plan Start', value: formatPlanDateTime(row.planStart) },
        { label: 'Plan Finish', value: formatPlanDateTime(row.planEnd) },
        { label: 'Plan Duration', value: `${fmt2(row.wo.setup_time_min)} + ${fmt2(row.wo.expected_duration_min)} = ${fmt2(plannedTotal)} min` },
      ],
    },
    { height: rowHeight, cells: [{ label: 'Actual Start' }, { label: 'Actual Finish' }, { label: 'Actual Duration' }] },
  ])
}

// Per-activity time breakdown feeding into Plan Duration
// (computeActivityDuration — same math the WO was created with), so the
// floor can check the planned activity list for completeness. An
// "unresolved" activity (no time formula could be computed) is flagged in
// red rather than shown as an indistinguishable "0 min". Fills its
// `slotHeight` exactly (see fitTableRows) — rows shrink before any get
// capped, since hiding planned steps defeats the point of the list.
function drawActivities(page: PDFPage, fonts: Fonts, row: MoPrintWorkOrderRow, x: number, top: number, width: number, slotHeight: number): void {
  const bandHeight = drawSectionBand(page, fonts, x, top, width, 'Activities')
  const { capacity, rowHeight } = fitTableRows(slotHeight - bandHeight, row.activities.length, LIST_ROW_HEIGHT, LIST_MIN_ROW_HEIGHT)
  const cols = layoutColumns([['Activity', 380], ['Type', 80], ['Planned Min', 130], ['Actual', 130]], x, width)
  drawCappedTable(page, fonts, cols, top - bandHeight, rowHeight, capacity, row.activities.map(act => ({
    values: [act.name, act.kind, act.unresolved ? 'unresolved' : fmt2(act.minutes), ''],
    color: act.unresolved ? rgb(0.78, 0.13, 0.16) : undefined,
  })))
}

// Right column: two separate tables side by side, sharing one set of
// ruled rows that run all the way down to the bottom margin (2026-09-16
// feedback — replaces a single combined table + a Notes box):
//   Assembly List — the WO's assembly (mark, name, qty, per-piece weight)
//     on the first row; deliberately no part breakdown ("เอา part ออก
//     เอาไว้แค่ assembly" — parts are on the manifest's Assembly Part
//     List).
//   QC — a hand-fill check log, one row per check: Self-check (Date, Qty)
//     and QC (Qty, Passed, Not Passed, Signature, Note). Passed / Not
//     Passed are plain blank cells, so a tick or a count both fit.
const RECORD_ROW_HEIGHT = 24
// Assembly List only ever holds one filled row; the QC log is where people
// write, so it takes the larger share.
const ASSEMBLY_TABLE_SHARE = 0.3
const ASSEMBLY_QC_GAP = 10

function drawAssemblyAndQcRecord(page: PDFPage, fonts: Fonts, row: MoPrintWorkOrderRow, x: number, top: number, width: number): void {
  const assemblyWidth = (width - ASSEMBLY_QC_GAP) * ASSEMBLY_TABLE_SHARE
  const qcX = x + assemblyWidth + ASSEMBLY_QC_GAP
  const qcWidth = x + width - qcX

  drawSectionBand(page, fonts, x, top, assemblyWidth, 'Assembly List')
  drawSectionBand(page, fonts, qcX, top, qcWidth, 'QC')
  const headerTop = top - SECTION_BAND_HEIGHT
  const bodyTop = headerTop - HEADER_ROW_HEIGHT * 2
  const rowCount = Math.floor((bodyTop - MARGIN) / RECORD_ROW_HEIGHT)
  const rowHeight = (bodyTop - MARGIN) / rowCount

  const assemblyCols = layoutColumns([['Mark', 70], ['Name', 60], ['Qty', 30], ['Weight (kg)', 50]], x, assemblyWidth)
  drawRuledTable(page, fonts, assemblyCols, [], headerTop, rowHeight, rowCount)
  const firstRow = [
    row.assemblyMark,
    row.assemblyName ?? '—',
    row.qty != null ? fmt2(row.qty) : '—',
    row.assemblyWeightKg != null ? fmt2(row.assemblyWeightKg) : '—',
  ]
  firstRow.forEach((value, i) => {
    const c = assemblyCols[i]
    page.drawText(value, { x: c.x + 3, y: bodyTop - rowHeight / 2 - 3, size: fitTextSize(fonts.regular, value, c.w - 6, 9), font: fonts.regular, color: BLACK })
  })

  const qcCols = layoutColumns([
    ['Date', 55], ['Qty', 35],
    ['Qty', 35], ['Passed', 40], ['Not Passed', 45], ['Signature', 70], ['Note', 70],
  ], qcX, qcWidth)
  drawRuledTable(page, fonts, qcCols, [{ label: 'Self-check', first: 0, last: 1 }, { label: 'QC', first: 2, last: 6 }], headerTop, rowHeight, rowCount)
}

const HEADER_ROW_HEIGHT = 14

interface ColumnGroup { label: string; first: number; last: number }

// Two-row shaded table header: group labels (if any) on the top row over
// their columns' own labels; ungrouped labels span both rows. Draws the
// header's column dividers too (a divider inside a group starts under the
// group label). Returns the header's height.
function drawGroupedHeader(page: PDFPage, fonts: Fonts, cols: TableColumn[], groups: ColumnGroup[], top: number): number {
  const x = cols[0].x
  const lastCol = cols[cols.length - 1]
  const width = lastCol.x + lastCol.w - x
  const bottom = top - HEADER_ROW_HEIGHT * 2
  const groupOf = (i: number) => groups.find(g => i >= g.first && i <= g.last)

  page.drawRectangle({ x, y: bottom, width, height: HEADER_ROW_HEIGHT * 2, color: rgb(0.9, 0.9, 0.9) })
  cols.forEach((c, i) => {
    const y = groupOf(i) ? bottom + 4 : bottom + HEADER_ROW_HEIGHT - 3
    page.drawText(c.label, { x: c.x + 3, y, size: fitTextSize(fonts.bold, c.label, c.w - 6, 8), font: fonts.bold, color: BLACK })
    if (i === 0) return
    const g = groupOf(i)
    const lineTop = g && i > g.first ? top - HEADER_ROW_HEIGHT : top
    page.drawLine({ start: { x: c.x, y: lineTop }, end: { x: c.x, y: bottom }, thickness: 0.75, color: BLACK })
  })
  for (const g of groups) {
    const [a, b] = [cols[g.first], cols[g.last]]
    page.drawText(g.label, { x: a.x + 3, y: top - 10, size: 8, font: fonts.bold, color: BLACK })
    page.drawLine({ start: { x: a.x, y: top - HEADER_ROW_HEIGHT }, end: { x: b.x + b.w, y: top - HEADER_ROW_HEIGHT }, thickness: 0.75, color: BLACK })
  }
  page.drawLine({ start: { x, y: bottom }, end: { x: x + width, y: bottom }, thickness: 0.75, color: BLACK })
  return HEADER_ROW_HEIGHT * 2
}

// drawGroupedHeader followed by `rowCount` blank ruled rows, bordered.
// Values are drawn by the caller.
function drawRuledTable(page: PDFPage, fonts: Fonts, cols: TableColumn[], groups: ColumnGroup[], top: number, rowHeight: number, rowCount: number): void {
  const x = cols[0].x
  const lastCol = cols[cols.length - 1]
  const width = lastCol.x + lastCol.w - x
  const headerBottom = top - drawGroupedHeader(page, fonts, cols, groups, top)
  const bottom = headerBottom - rowHeight * rowCount

  for (let r = 1; r < rowCount; r++) {
    const y = headerBottom - rowHeight * r
    page.drawLine({ start: { x, y }, end: { x: x + width, y }, thickness: 0.5, color: GRAY })
  }
  for (const c of cols.slice(1)) page.drawLine({ start: { x: c.x, y: headerBottom }, end: { x: c.x, y: bottom }, thickness: 0.75, color: BLACK })
  page.drawRectangle({ x, y: bottom, width, height: top - bottom, borderColor: BLACK, borderWidth: 0.75 })
}

interface CappedTableRow { values: string[]; color?: RGB }

// Shaded-header table with a FIXED number of body rows (`capacity`) —
// what keeps the traveler to one page. Unused rows stay blank and ruled
// (hand-fill space). If there are more rows than fit, the last one
// becomes a "+N more" pointer to the WO page (the QR) instead of rows
// silently disappearing. Returns the table's total height.
function drawCappedTable(page: PDFPage, fonts: Fonts, cols: TableColumn[], top: number, rowHeight: number, capacity: number, rows: CappedTableRow[]): number {
  const x = cols[0].x
  const last = cols[cols.length - 1]
  const width = last.x + last.w - x
  const textSize = Math.min(8, rowHeight - 5)
  const baseline = (rowTop: number) => rowTop - rowHeight / 2 - textSize * 0.35

  page.drawRectangle({ x, y: top - rowHeight, width, height: rowHeight, color: rgb(0.9, 0.9, 0.9) })
  for (const c of cols) page.drawText(c.label, { x: c.x + 3, y: baseline(top), size: textSize, font: fonts.bold, color: BLACK })

  const { shown, hiddenCount } = capList(rows, capacity)
  let y = top - rowHeight
  for (let i = 0; i < capacity; i++) {
    const r = shown[i]
    if (r) {
      cols.forEach((c, j) => {
        const value = r.values[j] ?? ''
        if (value) page.drawText(value, { x: c.x + 3, y: baseline(y), size: fitTextSize(fonts.regular, value, c.w - 6, textSize), font: fonts.regular, color: r.color ?? BLACK })
      })
    } else if (i === shown.length && hiddenCount > 0) {
      const more = `+${hiddenCount} more (see QR)`
      page.drawText(more, { x: x + 3, y: baseline(y), size: fitTextSize(fonts.bold, more, cols[0].w - 6, textSize), font: fonts.bold, color: BLACK })
    }
    y -= rowHeight
    if (i < capacity - 1) page.drawLine({ start: { x, y }, end: { x: x + width, y }, thickness: 0.5, color: GRAY })
  }
  drawTableBorder(page, x, top, y, width, cols.map(c => c.x))
  return top - y
}

// Shop drawing on its own page, right after its WO's traveler — only the
// drawing's first page (real shop drawings in this app are single-view
// PDFs), scaled to fill the sheet. No page border, since the drawing has
// its own title-block frame; just the WO code in the top-left corner so a
// sheet separated from its traveler can still be matched back to it
// (2026-09-16, replaces the inline Shop Drawing Preview that used to fill
// the bottom of the traveler).
async function buildDrawingPage(doc: PDFDocument, fonts: Fonts, row: MoPrintWorkOrderRow, drawingDoc: PDFDocument): Promise<void> {
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])

  const labelSize = 12
  const labelY = PAGE_HEIGHT - BORDER_INSET - labelSize
  page.drawText(row.wo.wo_code, { x: BORDER_INSET, y: labelY, size: labelSize, font: fonts.bold, color: BLACK })

  const areaTop = labelY - 8
  const areaWidth = PAGE_WIDTH - BORDER_INSET * 2
  const areaHeight = areaTop - BORDER_INSET
  const embeddedDrawing = await doc.embedPage(drawingDoc.getPage(0))
  const scale = Math.min(areaWidth / embeddedDrawing.width, areaHeight / embeddedDrawing.height)
  const drawnWidth = embeddedDrawing.width * scale
  const drawnHeight = embeddedDrawing.height * scale
  page.drawPage(embeddedDrawing, {
    x: BORDER_INSET + (areaWidth - drawnWidth) / 2,
    y: BORDER_INSET + (areaHeight - drawnHeight) / 2,
    width: drawnWidth,
    height: drawnHeight,
  })

  drawWoWatermark(page, fonts, row)
}

// WO code over the mark, big translucent red type centered on the page —
// stamped last, on top of everything, on both the drawing page and the
// traveler (2026-09-16, from the user's hand-marked sample print) so every
// sheet is unmistakably tied to its WO at a glance. Opacity is
// deliberately just 8%: at the first-tried 30% the drawing linework under
// the letters tinted dark red on pink and read as unclear — the user
// compared 30%/multiply/outline variants and picked this. Sized so the
// wider line spans half the page, capped for short codes.
function drawWoWatermark(page: PDFPage, fonts: Fonts, row: MoPrintWorkOrderRow): void {
  const lines = [row.wo.wo_code, row.assemblyMark]
  const widestAt1pt = Math.max(...lines.map(line => fonts.bold.widthOfTextAtSize(line, 1)))
  const size = Math.min(110, (PAGE_WIDTH * 0.5) / widestAt1pt)
  const lineGap = size * 1.1
  lines.forEach((line, i) => {
    page.drawText(line, {
      x: (PAGE_WIDTH - fonts.bold.widthOfTextAtSize(line, size)) / 2,
      // Centers the two-line block vertically (0.35 ≈ half a cap height).
      y: PAGE_HEIGHT / 2 + lineGap * (0.5 - i) - size * 0.35,
      size,
      font: fonts.bold,
      color: rgb(0.85, 0.1, 0.1),
      opacity: 0.08,
    })
  })
}

// Builds the full printable packet: one manifest page summarizing the MO,
// then per WO a signable traveler page followed by that WO's matched shop
// drawing on its own page (see buildDrawingPage). `fetchDrawingBytes` is
// injected so this function stays pure/testable — the caller
// (MoPrintService) owns actually reaching file storage. Callers must have
// already resolved plan.rows against findLatestPdfForMark; this function
// trusts every row has a drawing.
export async function buildMoPrintPdf(
  plan: MoPrintPacketPlan,
  fetchDrawingBytes: (row: MoPrintWorkOrderRow) => Promise<Uint8Array>,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(formatPrintPacketTitle(plan.mo.mo_code, new Date()))
  doc.registerFontkit(fontkit)
  const fonts: Fonts = {
    regular: await doc.embedFont(fs.readFileSync(path.join(FONT_DIR, 'Sarabun-Regular.ttf')), { features: FONT_FEATURES }),
    bold: await doc.embedFont(fs.readFileSync(path.join(FONT_DIR, 'Sarabun-Bold.ttf')), { features: FONT_FEATURES }),
  }

  await buildManifestPage(doc, fonts, plan)

  for (const row of plan.rows) {
    const drawingBytes = await fetchDrawingBytes(row)
    const drawingDoc = await PDFDocument.load(drawingBytes)

    await buildTravelerPage(doc, fonts, plan, row)
    await buildDrawingPage(doc, fonts, row, drawingDoc)
  }

  return doc.save()
}
