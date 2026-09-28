import * as fs from 'fs'
import * as path from 'path'
// Namespace import, not default — this repo's tsconfig has no
// esModuleInterop, so `import fontkit from '@pdf-lib/fontkit'` compiles to
// `fontkit_1.default` (undefined, since the package's CJS export has no
// `.default`), which fails pdf-lib's registerFontkit() with a misleading
// "no fontkit instance was found" — confirmed via the compiled output.
import * as fontkit from '@pdf-lib/fontkit'
import { PageSizes, PDFDocument, PDFFont, PDFImage, PDFPage, rgb, type RGB } from 'pdf-lib'
import type { MoPrintAssemblyMarkRow, MoPrintPacketPlan, MoPrintWorkOrderRow } from './mo-print.service'
import { capList, fitTextSize, fmt0, fmt2, formatPlanDateTime, formatPrintPacketTitle, formatWoCodes } from './mo-print-format'
import { generateWoQrPng, getWoQrModuleCount } from './mo-print-qr'
import { drawFabIcon } from './mo-print-icons'

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
const WHITE = rgb(1, 1, 1)
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
  page.drawText(title, { x: x + 8, y: y - 13, size: 11, font: fonts.bold, color: BLACK })
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
      page.drawText(cell.label, { x: colX + 6, y: rowTop - 11, size: 9, font: fonts.regular, color: GRAY })
      if (cell.value) {
        const size = fitTextSize(fonts.bold, cell.value, widths[i] - 12, 13)
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

async function buildManifestPage(doc: PDFDocument, fonts: Fonts, logoImg: PDFImage, plan: MoPrintPacketPlan): Promise<void> {
  const page = addPrintPage(doc)
  const columnsTop = PAGE_HEIGHT - MARGIN - drawMoHeader(page, fonts, logoImg) - 20

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
      // Moved here from the Assembly List's per-row Project/Zone columns
      // (2026-09-22: "เอา project zone ออกจาก assembly แล้วเอาไปไว้ตรง mo
      // info แทน") — same value repeated on every row once an MO was
      // scoped to one project+zone at create time; shown once here instead.
      // Same value/format as each WO traveler's own Project/Zone cells.
      height: 30,
      cells: [
        { label: 'Project', value: plan.mo.projectCode && plan.mo.projectName ? `${plan.mo.projectCode} — ${plan.mo.projectName}` : '—' },
        { label: 'Zone', value: plan.mo.subZoneName ? `${plan.mo.zoneLabel} / ${plan.mo.subZoneName}` : plan.mo.zoneLabel ?? '—' },
      ],
    },
    {
      // Below Project/Zone (2026-09-22: "เอา mark prfix ลงมาอยู่ใต้ project zone").
      height: 30,
      cells: [
        { label: 'Mark Prefix', value: plan.mo.primary_mark_prefix_code },
      ],
    },
    {
      height: 30,
      cells: [
        // Date+time — plan_start/plan_finish are timestamptz, same as
        // actual_start/actual_finish below (2026-09-22).
        { label: 'Plan Start', value: plan.mo.plan_start ? formatPlanDateTime(plan.mo.plan_start) : '—' },
        { label: 'Plan Finish', value: plan.mo.plan_finish ? formatPlanDateTime(plan.mo.plan_finish) : '—' },
      ],
    },
    {
      height: 30,
      cells: [
        { label: 'Actual Start', value: plan.mo.actual_start ? formatPlanDateTime(plan.mo.actual_start) : '—' },
        { label: 'Actual Finish', value: plan.mo.actual_finish ? formatPlanDateTime(plan.mo.actual_finish) : '—' },
      ],
    },
  ])
  drawRoutingChecklist(page, fonts, plan, MARGIN, y - 12, MO_LEFT_COL_WIDTH)

  drawMoAssemblyList(doc, page, fonts, plan, MARGIN + MO_LEFT_COL_WIDTH + MO_COL_GAP, columnsTop)
  drawMoWatermark(page, fonts, plan)

  buildAssemblyPartsPages(doc, fonts, plan)
}

// Company logo + name lockup on the left (same lockup as the app's own
// Topbar — logo, then "SSI BUILDING TECH" / "POWER KEYCHAIN" stacked to its
// right), document title right-aligned on the same row. Returns its height.
function drawMoHeader(page: PDFPage, fonts: Fonts, logoImg: PDFImage): number {
  const top = PAGE_HEIGHT - MARGIN
  const logoHeight = 34
  const logoWidth = logoHeight * (logoImg.width / logoImg.height)
  const logoY = top - logoHeight
  const textX = MARGIN + logoWidth + 10

  page.drawImage(logoImg, { x: MARGIN, y: logoY, width: logoWidth, height: logoHeight })
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
// WO per mark), ruled down to the page bottom. Reads plan.routingOps, NOT
// plan.rows (2026-09-22: "ทำไม routing ในหน้าแรกไม่แสดง" — plan.rows is
// scoped to whichever WOs a selective print selected for their own
// traveler pages; this checklist is meant to summarize the MO's whole
// routing plan regardless of that, so it needs its own unfiltered source —
// see MoPrintService.getRoutingOps).
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
  const ops = plan.routingOps
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
// Project/Zone dropped (2026-09-22, moved to MO Info) — their freed width
// went to Mark/Name, the two columns most likely to need it.
const MO_ASSEMBLY_COLUMNS: [label: string, weight: number][] = [
  ['No.', 24], ['Mark', 140], ['Name', 180],
  ['Width (mm)', 55], ['Length (mm)', 55], ['Height (mm)', 55], ['Weight (kg)', 60], ['Qty', 40],
]

function drawMoAssemblyList(doc: PDFDocument, page: PDFPage, fonts: Fonts, plan: MoPrintPacketPlan, x: number, top: number): void {
  const markValues = (mark: MoPrintPacketPlan['marks'][number]) => [
    String(mark.seq),
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
    const contPage = addPrintPage(doc)
    remaining = remaining.slice(drawChunk(contPage, MARGIN, PAGE_HEIGHT - MARGIN, CONTENT_WIDTH, 'Assembly List (cont.)', remaining))
    drawMoWatermark(contPage, fonts, plan)
  }
}

// Withdrawal Log — one row per round, for the store to record when each
// round happened and who was involved as a whole (2026-09-22: "ด้านบน
// อยากให้มีเพิ่ม 1 table...รอบเบิก, date/time, ผู้เบิก, ผู้ควบคุม store...
// row ก็จะมี ครั้งที่ 1, 2, 3") — sits above the Assembly Part List table,
// since that one's own "1st/2nd/3rd Withdrawal" columns are per-part (just
// By/Qty) with no shared place to note the round's own date/time or who
// signed off on it overall. "1st/2nd/3rd" reuses the same round labels as
// the table below instead of a separate "ครั้งที่ N" numbering.
function drawWithdrawalLog(page: PDFPage, fonts: Fonts, x: number, top: number, width: number): number {
  const bandHeight = drawSectionBand(page, fonts, x, top, width, 'Withdrawal Log')
  const cols = layoutColumns([['Round', 60], ['Date/Time', 150], ['Requested By', 220], ['Store Controller', 220]], x, width)
  const tableHeight = drawCappedTable(page, fonts, cols, top - bandHeight, CONSUME_ROW_HEIGHT, 3, [
    { values: ['1st'] },
    { values: ['2nd'] },
    { values: ['3rd'] },
  ])
  return bandHeight + tableHeight
}

// Assembly Part List — every assembly in the MO as a shaded group row,
// with the bom_parts (cut pieces) it needs listed beneath it (2026-09-16,
// replacing a flat part list aggregated across assemblies). Right of each
// part: one blank cell per round ("1st"/"2nd"/"3rd", 2026-09-22 — was its
// own "By"/"Qty" pair under a "Nth Withdrawal" group label, simplified once
// the Withdrawal Log above started covering who/when for the round as a
// whole) — a part may be drawn from the store no more than 3 times — then
// a Note cell.
// Starts on its own page after the MO page and overflows onto more,
// repeating the column header and — mid-group — the assembly's row. The
// Withdrawal Log (2026-09-22) sits above it on that same first page only —
// continuation pages go straight into "Assembly Part List (cont.)".
function buildAssemblyPartsPages(doc: PDFDocument, fonts: Fonts, plan: MoPrintPacketPlan): void {
  if (plan.assemblyParts.length === 0) return
  let currentPage = addPrintPage(doc)
  let y = PAGE_HEIGHT - MARGIN
  y -= drawWithdrawalLog(currentPage, fonts, MARGIN, y, CONTENT_WIDTH) + TRAVELER_SECTION_GAP
  y -= drawSectionBand(currentPage, fonts, MARGIN, y, CONTENT_WIDTH, 'Assembly Part List')

  // One plain column per round now, not a "By" + "Qty" pair under a "Nth
  // Withdrawal" group label (2026-09-22: "column by ก็เอาออกด้วยสิ 1st
  // Withdrawal ให้เหลือแค่ 1st พอ") — with no sub-columns left to group,
  // "1st"/"2nd"/"3rd" are just the columns' own labels; drawHeader below
  // uses drawGroupedHeader's compact (single-row) mode with an empty
  // groups list for that, same as it takes for an ordinary ungrouped
  // column elsewhere.
  const cols = layoutColumns([
    ['Part Mark', 130], ['Profile', 110], ['Grade', 70], ['Qty', 55], ['Weight (kg)', 70],
    ['1st', 90], ['2nd', 90], ['3rd', 90],
    ['Note', 140],
  ])
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
    y -= drawGroupedHeader(currentPage, fonts, cols, [], y, true)
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
    drawMoWatermark(currentPage, fonts, plan)
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
      // Each withdrawal round's own By/Qty stay blank hand-fill cells
      // (2026-09-22: tried pre-filling Qty with the part's planned amount —
      // "ฉันหมายถึงเป็นช่องให้กรอก qty ไม่ใช่เอาจำนวน qty มาใส่" — the
      // ruled cell itself, under the "Qty" column label, already IS the
      // fill-in field; it doesn't need a number printed in it first).
      const values = part
        ? [part.part_mark, part.profile ?? '—', part.grade ?? '—', fmt2(part.qty), part.weight_kg != null ? fmt2(part.weight_kg) : '—']
        : ['No parts']
      values.forEach((value, i) => {
        if (!value) return
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
  drawMoWatermark(currentPage, fonts, plan)
}

// WO traveler — starts as one A3-landscape page per WO (2026-09-16 redesign
// from the user's hand sketch, since restructured 2026-09-21), in two
// columns:
//   left:  Work Order Details + QR → Consume → Production Time →
//          Activities, each a fixed-capacity table (see drawCappedTable)
//          pulled up snug against the one above it — these stay one-page,
//          a long list is capped with "+N more (see QR)".
//   right: Assembly List & QC — one row per mark on this WO (a multi-mark
//          WO prints every mark together, not a separate page per mark),
//          each with its own 3-round QC log. UNLIKE the left column, this
//          is never capped (2026-09-21: "ต้องแสดง assembly list ทั้งหมด" —
//          every mark must show) — it overflows onto full-width
//          "(cont.)" pages after the first if there isn't room, same
//          chunk-and-continue shape as drawMoAssemblyList on the manifest.
// This WO's shop drawing gets its own dedicated page right after the
// traveler (buildDrawingPage, called from buildMoPrintPdf's per-row loop).
// Parts are deliberately NOT printed here (2026-09-21, after a brief
// same-day detour that added and then removed a WO-level Parts page) —
// see the `marks` field doc comment on MoPrintWorkOrderRow for why.
const TRAVELER_COL_GAP = 16
// The right column is a hand-written check log, so it gets the wider share
// of the page (2026-09-16: "เอา qc กว้างกว่าเลยเพราะ user ต้องมาเขียนลง
// กระดาษ"); long values in the narrower left column shrink to fit.
const TRAVELER_LEFT_COL_WIDTH = 480
const TRAVELER_RIGHT_COL_WIDTH = CONTENT_WIDTH - TRAVELER_COL_GAP - TRAVELER_LEFT_COL_WIDTH
const TRAVELER_SECTION_GAP = 12
const PRODUCTION_ROW_HEIGHT = 34
// Shared preferred row height for Consume and Activities (2026-09-21) — a
// taller alternative to the original 15pt list rows, since a WO rarely
// needs many skinny rows. Consume is fixed at 6 of these; Activities
// computes how many fit in whatever space is actually left (see
// drawActivities) and may stretch them slightly taller to fill it exactly.
const CONSUME_ROW_HEIGHT = 24

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

  // Production Time/Activities pulled up snug against Consume's actual
  // (fixed) height (2026-09-21) — Consume no longer fills a pre-computed
  // slot.
  const consumeHeight = drawWoConsume(page, fonts, row, leftX, y, colWidth)
  y -= consumeHeight + TRAVELER_SECTION_GAP
  drawProductionTime(page, fonts, row, leftX, y, colWidth)
  y -= productionHeight + TRAVELER_SECTION_GAP
  // Activities fills the rest of the column down to MARGIN (2026-09-22),
  // so its own bottom border lands on the same line as the right column's.
  drawActivities(page, fonts, row, leftX, y, colWidth)

  const rightX = MARGIN + colWidth + TRAVELER_COL_GAP
  const placed = drawAssemblyAndQcChunk(page, fonts, row.marks, rightX, top, TRAVELER_RIGHT_COL_WIDTH, 'Assembly List & QC')

  // Each column keeps its own complete, independent border (2026-09-22) —
  // no line bridging the gap between them after all ("เส้นนั้นคิดว่าไม่
  // ควรจะมีนะ ไม่อยากให้มันเชื่อมกัน", reversing the same day's earlier
  // "เส้นของทั้ง 2 table" ask). Both still land on y=MARGIN exactly
  // (drawActivities/drawAssemblyAndQcChunk use the same formula), so their
  // bottom edges read as level with each other without needing to be
  // physically joined.
  drawWoWatermark(page, fonts, row)

  // Every mark must show (2026-09-21: "ต้องแสดง assembly list ทั้งหมด") —
  // continue on full-width page(s) instead of capping, same shape as
  // drawMoAssemblyList's "(cont.)" pages on the manifest.
  let remaining = row.marks.slice(placed)
  while (remaining.length > 0) {
    const contPage = addPrintPage(doc)
    const n = drawAssemblyAndQcChunk(contPage, fonts, remaining, MARGIN, PAGE_HEIGHT - MARGIN, CONTENT_WIDTH, 'Assembly List & QC (cont.)')
    remaining = remaining.slice(n)
    drawWoWatermark(contPage, fonts, row)
  }
}

// Identification grid + the QR in its own bordered box to the grid's
// right, sized to the grid's height and centered in it. The QR points at
// this WO's page in the app — no scan-to-complete flow exists yet (see
// mo-print-qr.ts). Planned time moved out of here into Production Time.
async function drawWoDetails(doc: PDFDocument, page: PDFPage, fonts: Fonts, plan: MoPrintPacketPlan, row: MoPrintWorkOrderRow, x: number, top: number, width: number): Promise<number> {
  // 110 → 140 (2026-09-21: "ขยาย qr code เพิ่มอีกหน่อย") — the box's own
  // width is still what bounds qrSize below (the grid is taller than it is
  // wide), so growing the box is what actually grows the code, not just
  // its padding.
  const qrColWidth = 140
  const qrGap = 10
  const gridWidth = width - qrColWidth - qrGap
  const gridHeight = drawFormGrid(page, fonts, x, top, gridWidth, [
    { height: 40, cells: [{ label: 'Manufacturing Order', value: plan.mo.mo_code }, { label: 'Work Order', value: row.wo.wo_code }] },
    {
      height: 40,
      cells: [
        { label: 'Sequence / Work Center', value: `${row.wo.sequence} — ${row.workCenterName}` },
        // The specific routing operation (e.g. "SAW auto weld"), distinct
        // from the work center (the physical station) — resolved
        // server-side from source_routing_op_id.
        { label: 'Operation', value: row.operationLabel ?? '—' },
      ],
    },
    // Mark/Quantity dropped (2026-09-21) — already shown in the Assembly
    // List & QC table on the right, so repeating them here was pure
    // duplication; replaced with Team (who this WO is issued to). Project/
    // Zone dropped the same day, then restored right back to this same row
    // the same day too ("เอา project กับ zone กลับมาไว้ที่เดิม") — unlike
    // Mark/Quantity, nothing else on the traveler shows them.
    {
      height: 40,
      cells: [
        { label: 'Project', value: `${row.projectCode} — ${row.projectName}` },
        { label: 'Zone', value: row.subZoneName ? `${row.zoneLabel} / ${row.subZoneName}` : row.zoneLabel },
      ],
    },
    // Headcount added next to Team (2026-09-25: "อยากเพิ่มมาอีก 1 ช่องคือ
    // ใส่จำนวนคนในทีมที่ใช้ทำใน wo นี้") — same crew-size value set on
    // Create WO (auto-counted for internal teams, manual for external).
    { height: 40, cells: [{ label: 'Team', value: row.assignedTo ?? '—' }, { label: 'Headcount', value: String(row.teamHeadcount) }] },
  ])

  const qrBoxX = x + gridWidth + qrGap
  page.drawRectangle({ x: qrBoxX, y: top - gridHeight, width: qrColWidth, height: gridHeight, borderColor: BLACK, borderWidth: 0.75 })
  const qrPng = await doc.embedPng(await generateWoQrPng(row.woUrl))
  const qrSize = Math.min(qrColWidth, gridHeight) - 4 * 2
  const qrX = qrBoxX + (qrColWidth - qrSize) / 2
  const qrY = top - gridHeight + (gridHeight - qrSize) / 2
  page.drawImage(qrPng, { x: qrX, y: qrY, width: qrSize, height: qrSize })
  // Snug frame right around the code itself (2026-09-28: "ใส่กรอบให้ qr code
  // ด้วย") — distinct from the loose outer cell border above, which sits a
  // few points further out with blank padding in between.
  page.drawRectangle({ x: qrX, y: qrY, width: qrSize, height: qrSize, borderColor: BLACK, borderWidth: 1.5 })

  // Center icon over the code (2026-09-25: "อยากรู้ว่า qr-code ที่ gen มา
  // จะสามารถแนบ icon ไว้ตรงกลางได้ไหม" → tried the company logo first, then
  // "ไม่เอา icon บริษัท ลองเป็นแค่ icon ธรรมดาก่อน" — a plain generic mark
  // instead of the branded logo) — kept to ~22% of the code's area, well
  // under the ~30% budget errorCorrectionLevel 'H' buys in generateWoQrPng.
  // Backing plate went white → black → removed entirely (QR modules showing
  // straight through, red icon on top) → back to a plate (2026-09-28: "เอา
  // กรอบใส่แบบเดิม...ทำให้เป็นพื้นหลังสีขาวและมีกรอบสีดำหนาๆ...ให้ icon เป็น
  // สีขาว") — white fill, thick black border. Tried a white icon per that
  // request too, but white-on-white is invisible (confirmed by rendering
  // it); switched to black on the user's follow-up. Snapped to whole
  // QR modules so the plate's edges land on module boundaries (2026-09-28:
  // "ทำให้ผิว qrcode กลืนเข้าไปในกรอบได้ไหม") rather than slicing across them
  // at an arbitrary offset. Uses the operation's own picked icon when it has
  // one (2026-09-29: "จะเอาไปใช้ตอน print mo wo ตรง qr code และ water mark"),
  // else falls back to the same plain circle+check as before.
  const qrCx = qrX + qrSize / 2
  const qrCy = qrY + qrSize / 2
  const iconSize = qrSize * 0.22

  const qrGridUnits = getWoQrModuleCount(row.woUrl) + 2
  const qrModuleSize = qrSize / qrGridUnits
  let backingModules = Math.round((iconSize + 8) / qrModuleSize)
  if ((backingModules - qrGridUnits) % 2 !== 0) backingModules += 1
  const backing = backingModules * qrModuleSize
  // Two concentric rings, not one thick border (2026-09-28: "ทำให้กรอบเป็น
  // สองชั้นด้วย") — outer ring right at the plate's edge, inner ring inset
  // by a module-sized gap so the white shows through between them.
  page.drawRectangle({
    x: qrCx - backing / 2, y: qrCy - backing / 2, width: backing, height: backing,
    color: WHITE, borderColor: BLACK, borderWidth: qrModuleSize * 0.6,
  })
  const innerBacking = backing - qrModuleSize * 2.2
  page.drawRectangle({
    x: qrCx - innerBacking / 2, y: qrCy - innerBacking / 2, width: innerBacking, height: innerBacking,
    borderColor: BLACK, borderWidth: qrModuleSize * 0.7,
  })
  const drewOpIcon = drawFabIcon(page, row.icon, { cx: qrCx, cy: qrCy, size: iconSize, color: BLACK, opacity: 1 })
  if (!drewOpIcon) drawGenericIcon(page, qrCx, qrCy, iconSize, BLACK, 1)

  return gridHeight
}

// This WO's own share of material consumption (same formulas as the
// manifest's MO-wide Consume table, evaluated against just this WO), with
// an "Actual" hand-fill column, plus Requested By / Responsible sign boxes
// beside it. Fixed at 6 rows (2026-09-21), not sized off the space left in
// the column (unlike Activities below it, or the right column's Assembly
// List & QC) — sits in the middle of the left column, not at its bottom,
// so there's no "last line" of its own to line up with anything. Returns
// the actual height drawn (band + table) so the caller can pull Production
// Time/Activities up snug against Consume's real bottom edge.
function drawWoConsume(page: PDFPage, fonts: Fonts, row: MoPrintWorkOrderRow, x: number, top: number, width: number): number {
  const bandHeight = drawSectionBand(page, fonts, x, top, width, 'Consumable')
  const signWidth = 140
  // Fixed at 6 rows (2026-09-21) — was fill-the-slot via fitTableRows; the
  // sign boxes to the right are sized off tableHeight below, so they shrink
  // to match automatically. Left-over slot height is simply blank page,
  // same trade-off already accepted for the QC table's 3-round cap.
  const capacity = 6
  const rowHeight = CONSUME_ROW_HEIGHT
  const cols = layoutColumns([['Code', 100], ['Name', 300], ['Qty', 70], ['Unit', 50], ['Actual', 90]], x, width - signWidth)
  const tableHeight = drawCappedTable(page, fonts, cols, top - bandHeight, rowHeight, capacity, row.consume.map(item => ({
    values: [item.code, item.name, fmt0(item.qty), item.unit ?? '—', ''],
  })))
  // Each sign box is itself split top/bottom (2026-09-21) — signature above,
  // date/time below — rather than one open box per person.
  drawFormGrid(page, fonts, x + width - signWidth, top - bandHeight, signWidth, [
    { height: tableHeight / 4, cells: [{ label: 'Requested By' }] },
    { height: tableHeight / 4, cells: [{ label: 'Date/Time' }] },
    { height: tableHeight / 4, cells: [{ label: 'Responsible' }] },
    { height: tableHeight / 4, cells: [{ label: 'Date/Time' }] },
  ])
  return bandHeight + tableHeight
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
        { label: 'Plan Duration', value: `${fmt0(plannedTotal)} min` },
      ],
    },
    { height: rowHeight, cells: [{ label: 'Actual Start' }, { label: 'Actual Finish' }, { label: 'Actual Duration' }] },
  ])
}

// Per-activity time breakdown feeding into Plan Duration
// (computeActivityDuration — same math the WO was created with), so the
// floor can check the planned activity list for completeness. An
// "unresolved" activity (no time formula could be computed) is flagged in
// red rather than shown as an indistinguishable "0 min". Fixed-size table,
// same as Consume — see the capacity/rowHeight comment below for the
// trade-off this replaced (used to shrink rows rather than ever cap them).
function drawActivities(page: PDFPage, fonts: Fonts, row: MoPrintWorkOrderRow, x: number, top: number, width: number): void {
  const bandHeight = drawSectionBand(page, fonts, x, top, width, 'Activities')
  const bodyTop = top - bandHeight
  // Capacity computed from the space actually left down to MARGIN, same
  // "fill exactly to the bottom margin" idiom as drawAssemblyAndQcChunk on
  // the right column (2026-09-22: "เส้นสุดท้ายของ column กับ activity ควร
  // เท่ากัน" — Activities is the left column's last block, so its bottom
  // border should land on the same line as the right column's, not
  // wherever a fixed row count happens to end). Was a fixed 10 rows,
  // grown/trimmed by hand each time something above it changed height —
  // this replaces that guesswork with the same self-adjusting formula.
  // Still trades away the original "never hide a planned step" rule below:
  // a WO with more real activities than fit falls back to "+N more (see
  // QR)", same as any other capped table, instead of shrinking rows
  // further to show every one.
  //
  // drawCappedTable draws its own header AT `rowHeight` (not a separate
  // fixed header height like drawGroupedHeader's compact mode) — so the
  // space split has to reserve a `+1`th row for it, or the table overshoots
  // MARGIN by one whole rowHeight (caught 2026-09-22 by rendering and
  // comparing against the right column's own line, not from the formula
  // alone — see the vertical-centering investigation earlier for why
  // that's the reliable way to check this kind of thing).
  const totalRows = Math.max(2, Math.floor((bodyTop - MARGIN) / CONSUME_ROW_HEIGHT))
  const capacity = totalRows - 1
  const rowHeight = (bodyTop - MARGIN) / totalRows
  // Note column (2026-09-28: "เพิ่ม note เข้ามาด้วยจะได้บันทึกว่าทำไมถึงใช้
  // เวลาเกินที่กำหนดไว้หรือเวลาน้อยกว่ากำหนด") — blank, hand-filled explaining
  // why Actual came in over/under Planned Min for that activity.
  const cols = layoutColumns([['Activity', 330], ['Type', 70], ['Planned Min', 110], ['Actual', 110], ['Note', 150]], x, width)
  drawCappedTable(page, fonts, cols, bodyTop, rowHeight, capacity, row.activities.map(act => ({
    values: [act.name, act.kind, act.unresolved ? 'unresolved' : fmt0(act.minutes), '', ''],
    color: act.unresolved ? rgb(0.78, 0.13, 0.16) : undefined,
  })))
}

// Right column: Assembly List & QC — one row per mark on this WO, each
// identifying one assembly (Mark/Name/Qty/Weight) plus its own QC log
// capped at 3 rounds (Result + Signature, each split top/bottom via
// drawSplitCell) and a shared Note cell. No more "Self-check" block.
//
// One row per mark, not one page per mark (2026-09-21: "ทุก assembly ต้อง
// รวมอยู่ใน wo เดียวกัน") — a multi-mark WO used to print a separate
// traveler page per mark; now every mark goes on ONE table together.
// That table is never capped (2026-09-21 follow-up: "ต้องแสดง assembly
// list ทั้งหมด" — a WO with 10 marks must show all 10, not "+5 more") — it
// chunks across as many pages as it needs; drawAssemblyAndQcChunk draws one
// page's worth and returns how many marks it placed, and buildTravelerPage
// loops it until every mark is shown.
const RECORD_ROW_HEIGHT = 50

// A cell split top/bottom by one divider line, each half carrying its own
// small label (2026-09-21) — the "Requested By / Date-Time" sign boxes in
// Consume started this pattern; Result (Passed/Not) and Signature
// (Signature/Date-Time) below reuse it instead of spending a whole separate
// column on what's really a second, secondary field.
function drawSplitCell(page: PDFPage, fonts: Fonts, col: TableColumn, bodyTop: number, rowHeight: number, topLabel: string, bottomLabel: string): void {
  const midY = bodyTop - rowHeight / 2
  page.drawLine({ start: { x: col.x, y: midY }, end: { x: col.x + col.w, y: midY }, thickness: 0.5, color: GRAY })
  page.drawText(topLabel, { x: col.x + 3, y: bodyTop - 10, size: 6, font: fonts.regular, color: GRAY })
  page.drawText(bottomLabel, { x: col.x + 3, y: midY - 10, size: 6, font: fonts.regular, color: GRAY })
}

// Draws as many mark rows as fit between `top` and the bottom margin,
// stretching RECORD_ROW_HEIGHT slightly to exactly fill that space (same
// "compute capacity from space, then stretch to fill" idiom as
// drawMoAssemblyList's own drawChunk on the manifest) — returns how many it
// placed so the caller can continue with the remainder on another page.
// Repeated-column-group shape (Result/Signature × 1st/2nd/3rd, one shared
// Note column) matches the manifest's Assembly Part List withdrawal rounds.
function drawAssemblyAndQcChunk(page: PDFPage, fonts: Fonts, marks: MoPrintAssemblyMarkRow[], x: number, top: number, width: number, title: string): number {
  drawSectionBand(page, fonts, x, top, width, title)
  const headerTop = top - SECTION_BAND_HEIGHT
  const bodyTop0 = headerTop - HEADER_ROW_HEIGHT

  // Weight (kg) dropped (2026-09-22: "เอา weight ออก") — Mark/Name/Qty is
  // now the whole identity block, so the QC round columns shift down by
  // one slot (was 4-9, now 3-8; Note was 10, now 9).
  const cols = layoutColumns([
    ['Mark', 70], ['Name', 60], ['Qty', 30],
    ['Result', 45], ['Signature', 70],
    ['Result', 45], ['Signature', 70],
    ['Result', 45], ['Signature', 70],
    ['Note', 70],
  ], x, width)
  const qcRounds: ColumnGroup[] = ['1st', '2nd', '3rd'].map((nth, i) => ({ label: nth, first: 3 + i * 2, last: 4 + i * 2 }))

  const capacity = Math.max(1, Math.floor((bodyTop0 - MARGIN) / RECORD_ROW_HEIGHT))
  const rowHeight = (bodyTop0 - MARGIN) / capacity
  drawRuledTable(page, fonts, cols, qcRounds, headerTop, rowHeight, capacity, true)

  const placed = marks.slice(0, capacity)
  placed.forEach((mark, i) => {
    const bodyTop = bodyTop0 - rowHeight * i
    for (const j of [3, 5, 7]) drawSplitCell(page, fonts, cols[j], bodyTop, rowHeight, 'Passed', 'Not')
    for (const j of [4, 6, 8]) drawSplitCell(page, fonts, cols[j], bodyTop, rowHeight, 'Signature', 'Date/Time')
    const values = [
      mark.assemblyMark,
      mark.name ?? '—',
      mark.qty != null ? fmt0(mark.qty) : '—',
    ]
    values.forEach((value, j) => {
      const c = cols[j]
      const size = fitTextSize(fonts.regular, value, c.w - 6, 10)
      // Every identity column centered horizontally (2026-09-22: "mark กับ
      // name ด้วย" — extends the earlier Qty/Weight-only centering to
      // Mark/Name too).
      const x = c.x + (c.w - fonts.regular.widthOfTextAtSize(value, size)) / 2
      // Vertically centered — same baseline formula as drawCappedTable.
      page.drawText(value, { x, y: bodyTop - rowHeight / 2 - size * 0.35, size, font: fonts.regular, color: BLACK })
    })
  })
  return placed.length
}

const HEADER_ROW_HEIGHT = 14

interface ColumnGroup { label: string; first: number; last: number }

// Two-row shaded table header: group labels (if any) on the top row over
// their columns' own labels; ungrouped labels span both rows. Draws the
// header's column dividers too (a divider inside a group starts under the
// group label). Returns the header's height.
//
// `compact` (2026-09-21) — one row instead of two: each group's label spans
// its whole column range with no per-column sub-labels beneath it (the QC
// table's split-cell labels — Passed/Not, Signature/Date-Time — already say
// what each half is, so a second header row was pure duplication). Column
// dividers still run the full row, including inside a group, so the body's
// actual column boundaries stay visible.
function drawGroupedHeader(page: PDFPage, fonts: Fonts, cols: TableColumn[], groups: ColumnGroup[], top: number, compact = false): number {
  const x = cols[0].x
  const lastCol = cols[cols.length - 1]
  const width = lastCol.x + lastCol.w - x
  const height = compact ? HEADER_ROW_HEIGHT : HEADER_ROW_HEIGHT * 2
  const bottom = top - height
  const groupOf = (i: number) => groups.find(g => i >= g.first && i <= g.last)

  page.drawRectangle({ x, y: bottom, width, height, color: rgb(0.9, 0.9, 0.9) })

  if (compact) {
    cols.forEach((c, i) => {
      const g = groupOf(i)
      if (!g || i === g.first) {
        const label = g ? g.label : c.label
        const labelWidth = g ? cols[g.last].x + cols[g.last].w - c.x : c.w
        page.drawText(label, { x: c.x + 3, y: top - 10, size: fitTextSize(fonts.bold, label, labelWidth - 6, 9), font: fonts.bold, color: BLACK })
      }
      if (i === 0) return
      page.drawLine({ start: { x: c.x, y: top }, end: { x: c.x, y: bottom }, thickness: 0.75, color: BLACK })
    })
    page.drawLine({ start: { x, y: bottom }, end: { x: x + width, y: bottom }, thickness: 0.75, color: BLACK })
    return height
  }

  cols.forEach((c, i) => {
    const y = groupOf(i) ? bottom + 4 : bottom + HEADER_ROW_HEIGHT - 3
    page.drawText(c.label, { x: c.x + 3, y, size: fitTextSize(fonts.bold, c.label, c.w - 6, 9), font: fonts.bold, color: BLACK })
    if (i === 0) return
    const g = groupOf(i)
    const lineTop = g && i > g.first ? top - HEADER_ROW_HEIGHT : top
    page.drawLine({ start: { x: c.x, y: lineTop }, end: { x: c.x, y: bottom }, thickness: 0.75, color: BLACK })
  })
  for (const g of groups) {
    const [a, b] = [cols[g.first], cols[g.last]]
    page.drawText(g.label, { x: a.x + 3, y: top - 10, size: 9, font: fonts.bold, color: BLACK })
    page.drawLine({ start: { x: a.x, y: top - HEADER_ROW_HEIGHT }, end: { x: b.x + b.w, y: top - HEADER_ROW_HEIGHT }, thickness: 0.75, color: BLACK })
  }
  page.drawLine({ start: { x, y: bottom }, end: { x: x + width, y: bottom }, thickness: 0.75, color: BLACK })
  return height
}

// drawGroupedHeader followed by `rowCount` blank ruled rows, bordered.
// Values are drawn by the caller.
function drawRuledTable(page: PDFPage, fonts: Fonts, cols: TableColumn[], groups: ColumnGroup[], top: number, rowHeight: number, rowCount: number, compactHeader = false): void {
  const x = cols[0].x
  const lastCol = cols[cols.length - 1]
  const width = lastCol.x + lastCol.w - x
  const headerBottom = top - drawGroupedHeader(page, fonts, cols, groups, top, compactHeader)
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
  const textSize = Math.min(9, rowHeight - 5)
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

// Shop drawing on its own page, right after its WO's traveler — one page
// PER MARK, not per WO (2026-09-22: "wo มีหลายมาก mark ทำไมถึงแสดงแค่
// print แค่ 1 drawing ต้อง print ทุก drawing ที่มี mark" — a multi-mark WO
// used to embed only its primary mark's drawing once; now every mark gets
// its own page, see buildMoPrintPdf's per-mark loop). Only the drawing's
// first page (real shop drawings in this app are single-view PDFs).
//
// Full-bleed, sized to the drawing's OWN native page dimensions (2026-09-23:
// "drawing ต้องเต็มแผ่นตามของจริง" — the drawing must fill the sheet,
// matching the real thing). Was previously fit-and-centered onto a fixed
// A3-landscape sheet shared with the rest of the packet — since a shop
// drawing's own title-block page is rarely A3-landscape-shaped, that always
// left letterboxing on one axis. Now the destination PAGE itself is created
// at the embedded drawing's exact width/height, so it draws 1:1 at (0,0)
// with zero scaling and zero blank margin — a printed sheet that's pixel-
// identical to opening the source drawing file on its own. PDF pages may
// vary in size within one document; this reads fine in any viewer/printer.
// No page border, since the drawing has its own title-block frame; the
// corner label (WO code + this mark, so a sheet separated from its traveler
// can still be matched back to it — mark included since a WO can now
// produce several of these sheets) moved from top-left to BOTTOM-RIGHT the
// same day, on the user's direct instruction, to sit clear of the drawing's
// own content up top.
async function buildDrawingPage(doc: PDFDocument, fonts: Fonts, row: MoPrintWorkOrderRow, mark: MoPrintAssemblyMarkRow, drawingDoc: PDFDocument): Promise<void> {
  const embeddedDrawing = await doc.embedPage(drawingDoc.getPage(0))
  const page = doc.addPage([embeddedDrawing.width, embeddedDrawing.height])
  page.drawPage(embeddedDrawing, { x: 0, y: 0, width: embeddedDrawing.width, height: embeddedDrawing.height })

  const label = `${row.wo.wo_code} · ${mark.assemblyMark}`
  const labelSize = 12
  const labelWidth = fonts.bold.widthOfTextAtSize(label, labelSize)
  page.drawText(label, {
    x: page.getWidth() - BORDER_INSET - labelWidth,
    // A tighter margin than BORDER_INSET (2026-09-23: "เอาต่ำลงมาอีก" — move
    // it down more) — the drawing's own title block sits right at the
    // bottom of the sheet, so BORDER_INSET's 20pt margin still read as
    // crowding it; this sits the label closer to the true page edge instead.
    y: 6,
    size: labelSize,
    font: fonts.bold,
    color: BLACK,
  })

  drawWoWatermark(page, fonts, row, mark.assemblyMark)
}

// Big translucent red type centered on the page — stamped last, on top of
// everything, on every page of the packet (2026-09-16, from the user's
// hand-marked sample print, for the WO/drawing pages; extended 2026-09-23 —
// "mo ทุกหน้าต้องมี ลายน้ำเป็น mo ด้วยทุกหน้า" — to every MO-section page
// too: buildManifestPage, the Assembly List's continuation pages, and every
// page buildAssemblyPartsPages adds, none of which had any watermark at
// all before). Opacity is deliberately just 8%: at the first-tried 30% the
// drawing linework under the letters tinted dark red on pink and read as
// unclear — the user compared 30%/multiply/outline variants and picked
// this. Sized so the widest line spans most of the page, capped for short
// codes — enlarged 2026-09-23 ("ขยายขนาดลายน้ำเพิ่มขึ้นอีก ทั้ง mo wo", the
// same message that asked for the MO watermark) from a 110pt/50%-of-width
// cap to 160pt/70%.
//
// Reads the PAGE's own width/height (pdf-lib's page.getWidth()/getHeight()),
// not the module-level PAGE_WIDTH/PAGE_HEIGHT constants — traveler/manifest
// pages are always exactly that fixed A3-landscape size so this was a no-op
// distinction until 2026-09-23, when drawing pages (buildDrawingPage) started
// varying in size to match each embedded drawing's own dimensions; using the
// constants here would then center the watermark on the WRONG box.
//
// `iconKey` (2026-09-25, extended 2026-09-29) appends a mark right after
// the text instead of stacking it behind — first tried the company logo
// centered behind the text, but the user pointed at that result and said
// "ต้องเอาต่อท้ายตัวเลข" (it has to go AFTER the number), then "ไม่เอา icon
// บริษัท ลองเป็นแค่ icon ธรรมดาก่อน" (not the company logo — try a plain
// icon first), and finally "จะเอาไปใช้ตอน print mo wo ตรง qr code และ water
// mark" — the plain circle+check became a per-operation fallback: `iconKey`
// omitted (undefined) means MO-section pages, no icon at all; `null` or a
// curated lucide key means a WO page, which always shows SOME icon — the
// operation's own (drawFabIcon) when it has one, else the generic mark. The
// icon and text are sized/positioned as one lockup — text left-aligned,
// icon immediately to its right — then that whole combined width is
// centered on the page, same as the text-only block was before.
// drawMoWatermark never passes anything here, so MO-section pages are
// byte-for-byte unchanged.
function drawWatermark(page: PDFPage, fonts: Fonts, lines: string[], iconKey?: string | null): void {
  const pageWidth = page.getWidth()
  const pageHeight = page.getHeight()
  const widestAt1pt = Math.max(...lines.map(line => fonts.bold.widthOfTextAtSize(line, 1)))
  const size = Math.min(160, (pageWidth * 0.7) / widestAt1pt)
  const lineGap = size * 1.1
  const widestLineWidth = Math.max(...lines.map(line => fonts.bold.widthOfTextAtSize(line, size)))
  const color = rgb(0.85, 0.1, 0.1)
  const opacity = 0.08

  const withIcon = iconKey !== undefined
  const iconGap = withIcon ? size * 0.3 : 0
  const iconSize = withIcon ? size * 0.9 : 0
  const startX = (pageWidth - (widestLineWidth + iconGap + iconSize)) / 2

  lines.forEach((line, i) => {
    page.drawText(line, {
      x: startX,
      // Centers the block vertically (0.35 ≈ half a cap height); a single
      // line collapses to just pageHeight/2 - size*0.35 since lineGap*0.5
      // is then the whole offset for i=0.
      y: pageHeight / 2 + lineGap * ((lines.length - 1) / 2 - i) - size * 0.35,
      size,
      font: fonts.bold,
      color,
      opacity,
    })
  })

  if (withIcon) {
    const iconCx = startX + widestLineWidth + iconGap + iconSize / 2
    const drew = drawFabIcon(page, iconKey, { cx: iconCx, cy: pageHeight / 2, size: iconSize, color, opacity })
    if (!drew) drawGenericIcon(page, iconCx, pageHeight / 2, iconSize, color, opacity)
  }
}

// Plain, non-branded mark: a circle with a checkmark, built entirely from
// pdf-lib's own vector primitives (drawCircle + drawLine) — no image asset,
// so it can sit at any size/color/opacity without an aspect-ratio to
// preserve (2026-09-25: "ไม่เอา icon บริษัท ลองเป็นแค่ icon ธรรมดาก่อน").
function drawGenericIcon(page: PDFPage, cx: number, cy: number, size: number, color: RGB, opacity: number): void {
  const r = size / 2
  page.drawCircle({ x: cx, y: cy, size: r, borderWidth: size * 0.06, borderColor: color, opacity, borderOpacity: opacity })
  const thickness = size * 0.09
  const a = { x: cx - r * 0.45, y: cy - r * 0.02 }
  const b = { x: cx - r * 0.08, y: cy - r * 0.42 }
  const c = { x: cx + r * 0.5, y: cy + r * 0.32 }
  page.drawLine({ start: a, end: b, thickness, color, opacity })
  page.drawLine({ start: b, end: c, thickness, color, opacity })
}

// `markCode` (optional) adds a second line below the WO code — omitted on
// the traveler (2026-09-21: "ลายน้ำ ทั้งหมดใน wo ใส่แค่ wo พอ ไม่ต้องใส่
// mark ของ assembly" — a traveler covers every mark on the WO via Assembly
// List & QC, so the watermark there just needs the WO code), but back on
// 2026-09-22 for the drawing page specifically, once that became one page
// per mark instead of one per WO — multiple sheets sharing the same WO
// code watermark would otherwise be indistinguishable from each other.
// Logo appended after the code (2026-09-25: "ลายน้ำ ต่อท้าย wo ก็ต้องเป็น
// icon เดียวกันกับที่แสดงบน qr code ด้วยนะ") — additive, not a replacement
// (user picked "add alongside" over "replace the text" when asked), and
// scoped to WO pages only — drawMoWatermark (manifest/MO-section pages)
// stays text-only. Further narrowed 2026-09-28 ("ตรง drawing ไม่ต้องใส่
// ใส่แค่ตรงลายน้ำของ wo พอ") to the WO Details page (and its own
// continuation pages) only — a markCode means this is a per-mark shop
// drawing page (buildDrawingPage), which now stays icon-free.
function drawWoWatermark(page: PDFPage, fonts: Fonts, row: MoPrintWorkOrderRow, markCode?: string): void {
  drawWatermark(page, fonts, markCode ? [row.wo.wo_code, markCode] : [row.wo.wo_code], markCode ? undefined : row.icon)
}

// MO code, one line — every page belonging to the MO section (manifest,
// Assembly List continuation, Assembly Part List) shares just this one
// watermark, unlike the WO pages which stamp per-row/per-mark (2026-09-23).
function drawMoWatermark(page: PDFPage, fonts: Fonts, plan: MoPrintPacketPlan): void {
  drawWatermark(page, fonts, [plan.mo.mo_code])
}

// Builds the full printable packet: one manifest page summarizing the MO,
// then per WO a signable traveler page followed by ITS MARKS' matched shop
// drawings, one page each (see buildDrawingPage; 2026-09-22 — a WO used to
// contribute a single drawing page from its primary mark only).
// `fetchDrawingBytes` is injected so this function stays pure/testable —
// the caller (MoPrintService) owns actually reaching file storage, and now
// takes the specific mark being drawn alongside its row. Callers must have
// already resolved plan.rows[].marks[] against findLatestPdfForMark; this
// function trusts every mark has a drawing.
// `includeManifest` (2026-09-21 selective print) — the MO overview page is
// now its own toggle, independent of which WO travelers are picked, so
// "just the MO" (no WOs) and "just some WOs, no MO page" are both valid.
export async function buildMoPrintPdf(
  plan: MoPrintPacketPlan,
  fetchDrawingBytes: (row: MoPrintWorkOrderRow, mark: MoPrintAssemblyMarkRow) => Promise<Uint8Array>,
  includeManifest = true,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(formatPrintPacketTitle(plan.mo.mo_code, new Date()))
  doc.registerFontkit(fontkit)
  const fonts: Fonts = {
    regular: await doc.embedFont(fs.readFileSync(path.join(FONT_DIR, 'Sarabun-Regular.ttf')), { features: FONT_FEATURES }),
    bold: await doc.embedFont(fs.readFileSync(path.join(FONT_DIR, 'Sarabun-Bold.ttf')), { features: FONT_FEATURES }),
  }
  // Only the manifest header lockup uses the real company logo — the QR
  // center icon and WO watermark use a plain vector mark instead
  // (drawGenericIcon), per the user's 2026-09-25 "ไม่เอา icon บริษัท".
  const logoImg = await doc.embedPng(fs.readFileSync(LOGO_PATH))

  if (includeManifest) {
    await buildManifestPage(doc, fonts, logoImg, plan)
  }

  for (const row of plan.rows) {
    await buildTravelerPage(doc, fonts, plan, row)
    for (const mark of row.marks) {
      const drawingBytes = await fetchDrawingBytes(row, mark)
      const drawingDoc = await PDFDocument.load(drawingBytes)
      await buildDrawingPage(doc, fonts, row, mark, drawingDoc)
    }
  }

  // "N / total" in every page's top-right corner (2026-09-28: "มุมขวาบน
  // หัวกระดาษาต้องทำเป็นลำดับให้ด้วย...1-10/10 ประมาณนี้") — done as one
  // final pass over the finished doc rather than counted while building,
  // since the total page count (continuation pages, per-mark drawing pages)
  // isn't known until every section above has actually been laid out. Every
  // standard page (addPrintPage) has a blank MARGIN-BORDER_INSET strip along
  // the true top edge with nothing else drawn in it; a shop drawing page
  // (buildDrawingPage) has no such guaranteed blank area since it's the
  // embedded drawing full-bleed, so this sits tight in the true corner there
  // the same way that page's own WO+mark label already does at the bottom.
  const allPages = doc.getPages()
  allPages.forEach((page, i) => {
    const label = `${i + 1} / ${allPages.length}`
    const labelSize = 9
    const labelWidth = fonts.bold.widthOfTextAtSize(label, labelSize)
    page.drawText(label, {
      x: page.getWidth() - 10 - labelWidth,
      y: page.getHeight() - 14,
      size: labelSize,
      font: fonts.bold,
      color: BLACK,
    })
  })

  return doc.save()
}
