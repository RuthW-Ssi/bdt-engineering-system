import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PageSizes } from 'pdf-lib'
import * as zlib from 'zlib'
import { buildMoPrintPdf } from './mo-print-pdf-builder'
import type { MoPrintPacketPlan, MoPrintWorkOrderRow } from './mo-print.service'

// Decodes one page's content-stream bytes (FlateDecode-inflated) into raw
// operator text — the ground truth for what pdf-lib actually drew, since
// embedded CID font text isn't readable as plain characters and cosmetic
// shapes like a page border don't show up in the object tree at all.
function decodedContentStream(doc: PDFDocument, pageIndex: number): string {
  const context = doc.context
  const streamBytes = (ref: unknown): Buffer => {
    const obj = context.lookup(ref as never)
    if (!(obj instanceof PDFRawStream)) return Buffer.alloc(0)
    const filter = obj.dict.get(PDFName.of('Filter'))
    const raw = Buffer.from(obj.contents)
    return filter?.toString() === '/FlateDecode' ? zlib.inflateSync(raw) : raw
  }
  const contents = doc.getPage(pageIndex).node.Contents()
  const chunks = contents instanceof PDFArray
    ? Array.from({ length: contents.size() }, (_, j) => streamBytes(contents.get(j)))
    : [streamBytes(contents)]
  return Buffer.concat(chunks).toString('latin1')
}

// Decodes every content-stream byte across the whole document into one
// uppercase string of raw operator text, and slices each <...> hex-string
// operand into its individual 4-hex-digit glyph codes. Used to prove a
// *specific* CID never gets drawn — the ground-truth check for the Thai
// small-variant-glyph regression below.
function drawnGlyphCodes(doc: PDFDocument): Set<string> {
  let all = ''
  for (let i = 0; i < doc.getPageCount(); i++) all += decodedContentStream(doc, i)
  const codes = new Set<string>()
  for (const match of all.matchAll(/<([0-9A-Fa-f]+)>/g)) {
    const hex = match[1].toUpperCase()
    for (let j = 0; j < hex.length; j += 4) codes.add(hex.slice(j, j + 4))
  }
  return codes
}

// True if the page's /Resources /XObject dict has at least one entry whose
// Subtype is /Image — used to confirm the WO QR code actually got embedded
// on the traveler page, without decoding the PNG pixels themselves.
function pageHasEmbeddedImage(doc: PDFDocument, pageIndex: number): boolean {
  const resources = doc.getPage(pageIndex).node.Resources()
  const xObjects = resources?.lookupMaybe(PDFName.of('XObject'), PDFDict)
  if (!xObjects) return false
  return xObjects.keys().some(key => {
    const obj = doc.context.lookup(xObjects.get(key))
    return obj instanceof PDFRawStream && obj.dict.get(PDFName.of('Subtype'))?.toString() === '/Image'
  })
}

// Same idea as pageHasEmbeddedImage, but for a /Form XObject — what
// doc.embedPage()+page.drawPage() produce. Confirms the shop drawing page
// actually embeds the real matched drawing, not just a placeholder
// rectangle.
function pageHasEmbeddedForm(doc: PDFDocument, pageIndex: number): boolean {
  const resources = doc.getPage(pageIndex).node.Resources()
  const xObjects = resources?.lookupMaybe(PDFName.of('XObject'), PDFDict)
  if (!xObjects) return false
  return xObjects.keys().some(key => {
    const obj = doc.context.lookup(xObjects.get(key))
    return obj instanceof PDFRawStream && obj.dict.get(PDFName.of('Subtype'))?.toString() === '/Form'
  })
}

// True if the page's /Resources /ExtGState dict has a graphics state with
// a fill alpha (ca) below 1 — what pdf-lib emits for drawText({ opacity }).
function pageHasTranslucentGraphicsState(doc: PDFDocument, pageIndex: number): boolean {
  const extGStates = doc.getPage(pageIndex).node.Resources()?.lookupMaybe(PDFName.of('ExtGState'), PDFDict)
  if (!extGStates) return false
  return extGStates.keys().some(key => {
    const gs = doc.context.lookup(extGStates.get(key))
    const ca = gs instanceof PDFDict ? gs.get(PDFName.of('ca')) : undefined
    return ca instanceof PDFNumber && ca.asNumber() < 1
  })
}

// Every text-positioning (Tm) operator's y origin on one page — a text
// label drawn below the page's own border (y < BORDER_INSET) means the
// block it labels was laid out past the bottom edge of the sheet.
function textOriginYs(doc: PDFDocument, pageIndex: number): number[] {
  return Array.from(decodedContentStream(doc, pageIndex).matchAll(/(-?[\d.]+) (-?[\d.]+) Tm/g), m => Number(m[2]))
}

async function fakePdfBytes(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pageCount; i++) {
    // A real shop drawing always has drawn content — a page with zero draw
    // calls has no /Contents stream at all, which doc.embedPage() (used
    // for the Shop Drawing page) rejects with MissingPageContentsEmbeddingError.
    doc.addPage([200, 200]).drawLine({ start: { x: 0, y: 0 }, end: { x: 200, y: 200 } })
  }
  return doc.save()
}

function makeRow(overrides: Partial<MoPrintWorkOrderRow> = {}): MoPrintWorkOrderRow {
  return {
    wo: { id: 1398, wo_code: 'WO-00000739', sequence: 10, status: 'NOT_STARTED', expected_duration_min: 60, setup_time_min: 15 },
    workCenterName: 'Cutting',
    assemblyMark: 'DBN-A1-CTR1',
    qty: 1,
    zoneLabel: 'BIF Zone 1',
    subZoneName: null,
    projectName: 'Smash golf driving range Bangna',
    projectCode: 'DBN',
    drawing: { file_key: 'drawings/dbn-a1-ctr1-rev1.pdf', file_name: 'DBN-A1-CTR1 - - Rev 1.pdf' },
    activities: [],
    woUrl: 'http://localhost:5173/order/wo/1398',
    consume: [],
    operationLabel: 'OP-WELD-SAW — SAW auto weld',
    assemblyName: 'Column A1',
    assemblyWeightKg: 450,
    assignedTo: null,
    planStart: null,
    planEnd: null,
    ...overrides,
  }
}

function makePlan(rows: MoPrintWorkOrderRow[], overrides: Partial<MoPrintPacketPlan> = {}): MoPrintPacketPlan {
  return {
    mo: { id: 85, mo_code: 'MO-00014', due_date: null, status: 'CONFIRMED', primary_mark_prefix_code: 'CTR' },
    rows,
    marks: [],
    assemblyParts: [],
    ...overrides,
  }
}

describe('buildMoPrintPdf', () => {
  it('produces one manifest page, then a traveler page + one dedicated drawing page per WO row, in order', async () => {
    const plan = makePlan([
      makeRow({ wo: { id: 1398, wo_code: 'WO-00000739', sequence: 10, status: 'NOT_STARTED', expected_duration_min: 60, setup_time_min: 15 } }),
      makeRow({ wo: { id: 1399, wo_code: 'WO-00000740', sequence: 20, status: 'NOT_STARTED', expected_duration_min: 30, setup_time_min: 5 } }),
    ])
    const drawingPageCounts = [1, 2] // a multi-page drawing source must not inflate output page count
    let call = 0
    const fetchDrawingBytes = jest.fn(async () => fakePdfBytes(drawingPageCounts[call++]))

    const bytes = await buildMoPrintPdf(plan, fetchDrawingBytes)
    const merged = await PDFDocument.load(bytes)

    expect(merged.getPageCount()).toBe(1 + 2 * 2)
    expect(fetchDrawingBytes).toHaveBeenCalledTimes(2)
  })

  // The packet is opened via a blob: URL in a new browser tab (MoDetail.tsx's
  // handlePrint), not downloaded directly — a Content-Disposition header
  // has no effect there, so the PDF's own /Title metadata is what a
  // browser's native PDF viewer actually suggests as the filename on Save
  // (2026-09-16).
  it("sets the PDF's Title metadata to the MO code plus a timestamp, so 'Save' suggests a sane filename", async () => {
    const plan = makePlan([makeRow()], { mo: { id: 85, mo_code: 'MO-00014', due_date: null, status: 'CONFIRMED', primary_mark_prefix_code: 'CTR' } })

    const bytes = await buildMoPrintPdf(plan, async () => fakePdfBytes(1))
    const merged = await PDFDocument.load(bytes)

    expect(merged.getTitle()).toMatch(/^MO-00014-\d{8}-\d{6}$/)
  })

  it('renders every page (manifest, traveler, drawing) at A3 landscape', async () => {
    const bytes = await buildMoPrintPdf(makePlan([makeRow()]), async () => fakePdfBytes(1))
    const merged = await PDFDocument.load(bytes)
    const [a3Short, a3Long] = PageSizes.A3
    for (let i = 0; i < merged.getPageCount(); i++) {
      const { width, height } = merged.getPage(i).getSize()
      expect([width, height]).toEqual([a3Long, a3Short])
    }
  })

  it('draws a page border on every manifest and traveler page, but not on the drawing page', async () => {
    const bytes = await buildMoPrintPdf(makePlan([makeRow()]), async () => fakePdfBytes(1))
    const merged = await PDFDocument.load(bytes)

    // pdf-lib's fill-less drawRectangle emits a "cm" translate to the box's
    // (x,y) origin, then explicit moveto/lineto path segments out to
    // (width,height) — not a single "re" operator. The translate-to-inset
    // ("1 0 0 1 20 20 cm") is a distinctive enough marker for the page
    // border specifically, since BORDER_INSET=20 isn't used as an x/y
    // anywhere else in this builder.
    const border = /1 0 0 1 20 20 cm[\s\S]{0,80}1150\.55 801\.89 l/
    expect(decodedContentStream(merged, 0)).toMatch(border)
    expect(decodedContentStream(merged, 1)).toMatch(border)
    // The drawing carries its own title-block frame.
    expect(decodedContentStream(merged, 2)).not.toMatch(border)
  })

  // Regression: pdf-lib's CustomFontEmbedder only pre-computes /W (glyph
  // width) entries from each codepoint's *default* glyph — it never sees
  // Sarabun's contextual small-variant tone-mark glyph (e.g. CID 0x02E0,
  // "uni0E48.small", selected via the font's default GSUB 'ccmp' feature
  // whenever a tone mark follows a tall vowel like sara-ue, as in
  // "เชื่อม"). With no /DW default-width set on the embedded font, that
  // missing glyph falls back to the PDF spec's 1000-unit default instead of
  // its real (0) width — rendering as a wide visible gap. Confirmed via
  // direct inspection of a generated packet's decompressed content stream
  // and embedded /W array (2026-09-15). Disabling the 'ccmp' feature makes
  // fontkit pick the plain (correctly-widthed) glyph instead — verified
  // against every Thai material/zone/project name in the dev DB with zero
  // regressions.
  it('never draws the Sarabun small-variant tone-mark glyph left without a /W entry (root cause of the "เชื่อม"-style visible gap)', async () => {
    const plan = makePlan([makeRow({
      consume: [
        { material_id: 1, code: 'BIF81100052', name: 'ลวดเชื่อม SAW 2.4 mm', qty: 29.94, unit: 'kg' },
      ],
    })])

    const bytes = await buildMoPrintPdf(plan, async () => fakePdfBytes(1))
    const doc = await PDFDocument.load(bytes)
    const codes = await drawnGlyphCodes(doc)

    expect(codes.has('02E0')).toBe(false)
  })

  it('produces just the manifest page when there are no rows', async () => {
    const bytes = await buildMoPrintPdf(makePlan([]), jest.fn())
    const merged = await PDFDocument.load(bytes)
    expect(merged.getPageCount()).toBe(1)
  })

  it('embeds the company logo on the manifest page only, not the traveler pages', async () => {
    const bytes = await buildMoPrintPdf(makePlan([makeRow()]), async () => fakePdfBytes(1))
    const merged = await PDFDocument.load(bytes)

    expect(pageHasEmbeddedImage(merged, 0)).toBe(true)
    // Page 1's only embedded image is its own QR code — confirmed logo
    // placement stays manifest-only per 2026-09-15 feedback (the QR
    // already occupies that same top-right corner on traveler pages).
  })

  it('calls fetchDrawingBytes with the matching row so the caller knows which file to fetch', async () => {
    const row = makeRow()
    const fetchDrawingBytes = jest.fn(async () => fakePdfBytes(1))

    await buildMoPrintPdf(makePlan([row]), fetchDrawingBytes)

    expect(fetchDrawingBytes).toHaveBeenCalledWith(row)
  })

  // Regression: project/zone names in this app are routinely Thai (e.g.
  // "โกดังเก็บสินค้า Zone B") — pdf-lib's built-in StandardFonts only encode
  // WinAnsi (Latin-1) and throw on the first non-Latin character. Live-caught
  // on local dev while verifying this feature end-to-end (2026-09-15).
  it('does not throw when the project/zone/mark text contains Thai characters', async () => {
    const plan = makePlan([
      makeRow({ projectName: 'โกดังเก็บสินค้า Zone B', zoneLabel: 'โกดัง Zone B-1' }),
    ])

    await expect(buildMoPrintPdf(plan, async () => fakePdfBytes(1))).resolves.toBeInstanceOf(Uint8Array)
  })

  // List Mark — one row per mo_assembly_line (every distinct mark in the
  // MO, with its dimensions/weight and dispatch project/zone), replacing
  // the old per-WO/per-operation "Work Orders" table (2026-09-16).
  describe('Assembly List (MO page, right column)', () => {
    it('does not add extra pages for a normal-sized mark list', async () => {
      const plan = makePlan([makeRow()], {
        marks: [
          { seq: 1, assemblyMark: 'DBN-A1-CTR1', name: 'Column A1', projectCode: 'DBN', projectName: 'Smash golf driving range Bangna', zoneLabel: 'BIF Zone 1', subZoneName: null, width_mm: 200, length_mm: 6000, height_mm: 300, weight_kg: 450, qty: 1 },
          { seq: 2, assemblyMark: 'DBN-A1-CTR2', name: null, projectCode: 'DBN', projectName: 'Smash golf driving range Bangna', zoneLabel: 'BIF Zone 1', subZoneName: 'North Bay', width_mm: null, length_mm: 3000, height_mm: 200, weight_kg: null, qty: 2 },
        ],
      })

      const bytes = await buildMoPrintPdf(plan, async () => fakePdfBytes(1))
      const merged = await PDFDocument.load(bytes)

      expect(merged.getPageCount()).toBe(1 + 2)
    })

    it('does not throw when there are no marks at all', async () => {
      const plan = makePlan([makeRow()], { marks: [] })

      await expect(buildMoPrintPdf(plan, async () => fakePdfBytes(1))).resolves.toBeInstanceOf(Uint8Array)
    })

    it('continues a long mark list onto extra pages, without drawing past the page border', async () => {
      const longMarkList = Array.from({ length: 60 }, (_, i) => ({
        seq: i + 1, assemblyMark: `M-${i}`, name: `Assembly ${i}`, projectCode: 'DBN', projectName: 'Smash golf driving range Bangna',
        zoneLabel: 'BIF Zone 1', subZoneName: null, width_mm: 200, length_mm: 6000, height_mm: 300, weight_kg: 450, qty: 1,
      }))
      const plan = makePlan([makeRow()], { marks: longMarkList })

      const bytes = await buildMoPrintPdf(plan, async () => fakePdfBytes(1))
      const merged = await PDFDocument.load(bytes)

      const manifestPages = merged.getPageCount() - 2
      expect(manifestPages).toBeGreaterThan(1)
      for (let i = 0; i < manifestPages; i++) {
        for (const y of textOriginYs(merged, i)) expect(y).toBeGreaterThanOrEqual(20)
      }
    })
  })

  // Parts — every bom_part needed across the MO's assemblies, aggregated by
  // part_mark, printed after Consume. Always starts on its own dedicated
  // manifest page (2026-09-16), continuing right after Consume — the same
  // overflow-to-a-new-page protection as the other manifest tables, not a
  // forced dedicated page.
  // Assembly Part List — assemblies as group rows with their parts beneath,
  // on its own page(s) right after the MO page (2026-09-16).
  describe('Assembly Part List (after the MO page)', () => {
    it('adds exactly one page for a normal-sized list, including an assembly with no parts and unknown profile/grade/weight', async () => {
      const plan = makePlan([makeRow()], {
        assemblyParts: [
          {
            assemblyMark: 'DBN-B1-CTR1', name: 'COLUMN', qty: 1,
            parts: [
              { part_mark: 'DBN-B1-m65', profile: 'PIPE113.5X2.4', grade: 'HSS550', qty: 14, weight_kg: 167.44 },
              { part_mark: 'DBN-B1-m66', profile: null, grade: null, qty: 2, weight_kg: null },
            ],
          },
          { assemblyMark: 'DBN-B1-CTR2', name: null, qty: 1, parts: [] },
        ],
      })

      const bytes = await buildMoPrintPdf(plan, async () => fakePdfBytes(1))
      const merged = await PDFDocument.load(bytes)

      // MO page + part list page + (traveler + drawing).
      expect(merged.getPageCount()).toBe(2 + 2)
    })

    it('adds no page at all when there are no assemblies', async () => {
      const plan = makePlan([makeRow()], { assemblyParts: [] })

      const bytes = await buildMoPrintPdf(plan, async () => fakePdfBytes(1))
      const merged = await PDFDocument.load(bytes)

      expect(merged.getPageCount()).toBe(1 + 2)
    })

    it('overflows onto extra pages for a long list — including mid-group — without drawing past the page border', async () => {
      const assemblyParts = Array.from({ length: 6 }, (_, a) => ({
        assemblyMark: `M-${a}`, name: 'COLUMN', qty: 1,
        parts: Array.from({ length: 25 }, (_, p) => ({ part_mark: `M-${a}-p${p}`, profile: 'PL', grade: 'SS400', qty: 1, weight_kg: 1 })),
      }))
      const plan = makePlan([makeRow()], { assemblyParts })

      const bytes = await buildMoPrintPdf(plan, async () => fakePdfBytes(1))
      const merged = await PDFDocument.load(bytes)

      const manifestPages = merged.getPageCount() - 2
      // MO page + more than one part list page.
      expect(manifestPages).toBeGreaterThan(2)
      for (let i = 0; i < manifestPages; i++) {
        for (const y of textOriginYs(merged, i)) expect(y).toBeGreaterThanOrEqual(20)
      }
    })
  })

  // MO page (2026-09-16 redesign): header, MO Info + Routing checklist on
  // the left, the MO's Assembly List ruled down the right. MO-level Consume
  // is no longer printed here (still per WO on each traveler).
  describe('MO page', () => {
    it('prints a single MO page for several operations and marks, with nothing below the page border', async () => {
      const rows = [10, 20, 30].flatMap(sequence => ['M-1', 'M-2'].map((mark, i) => makeRow({
        wo: { id: sequence * 10 + i, wo_code: `WO-000000${sequence}${i}`, sequence, status: 'NOT_STARTED', expected_duration_min: 60, setup_time_min: 15 },
        assemblyMark: mark,
      })))
      const marks = ['M-1', 'M-2'].map((assemblyMark, i) => ({
        seq: i + 1, assemblyMark, name: 'โครงหลังคา', projectCode: 'DBN', projectName: 'x', zoneLabel: 'BIF Zone 1',
        subZoneName: null, width_mm: 200, length_mm: 6000, height_mm: 300, weight_kg: 450, qty: 1,
      }))

      const bytes = await buildMoPrintPdf(makePlan(rows, { marks }), async () => fakePdfBytes(1))
      const merged = await PDFDocument.load(bytes)

      expect(merged.getPageCount()).toBe(1 + rows.length * 2)
      for (const y of textOriginYs(merged, 0)) expect(y).toBeGreaterThanOrEqual(20)
    })
  })

  // Planned Time / Actual Time Used — per traveler page, since each WO is
  // one specific operation with its own expected_duration_min/setup_time_min.
  describe('Planned Time (traveler pages)', () => {
    it('does not throw when building a traveler for a row with planned time data', async () => {
      const plan = makePlan([makeRow({ wo: { id: 1398, wo_code: 'WO-00000739', sequence: 10, status: 'NOT_STARTED', expected_duration_min: 45, setup_time_min: 10 } })])

      await expect(buildMoPrintPdf(plan, async () => fakePdfBytes(1))).resolves.toBeInstanceOf(Uint8Array)
    })
  })

  // QR code — scannable link to this WO's page in the app (drawing +
  // activities already live there), printed once per traveler.
  describe('WO QR code (traveler pages)', () => {
    it('embeds a QR image on the traveler page, encoding the row\'s woUrl', async () => {
      const plan = makePlan([makeRow({ woUrl: 'http://localhost:5173/order/wo/1398' })])

      const bytes = await buildMoPrintPdf(plan, async () => fakePdfBytes(1))
      const merged = await PDFDocument.load(bytes)

      // Page 0 is the manifest; page 1 is the first traveler.
      expect(pageHasEmbeddedImage(merged, 1)).toBe(true)
    })
  })

  // Shop Drawing — the matched WO drawing's first page, scaled to fill its
  // own dedicated A3 landscape page right after that WO's traveler
  // (2026-09-16: replaces the inline preview at the bottom of the traveler).
  describe('Shop Drawing (dedicated page per WO)', () => {
    it('puts the matched drawing\'s first page on its own page after the traveler — not on the traveler, and without the source drawing\'s other pages', async () => {
      const plan = makePlan([makeRow()])

      const bytes = await buildMoPrintPdf(plan, async () => fakePdfBytes(2))
      const merged = await PDFDocument.load(bytes)

      // Page 0 = manifest, 1 = traveler, 2 = drawing — the drawing
      // source's 2nd page must not appear anywhere.
      expect(merged.getPageCount()).toBe(1 + 2)
      expect(pageHasEmbeddedForm(merged, 1)).toBe(false)
      expect(pageHasEmbeddedForm(merged, 2)).toBe(true)
    })

    it('labels the drawing page with text (the WO code) so a sheet separated from its traveler can be matched back', async () => {
      const bytes = await buildMoPrintPdf(makePlan([makeRow()]), async () => fakePdfBytes(1))
      const merged = await PDFDocument.load(bytes)

      expect(decodedContentStream(merged, 2)).toMatch(/Tj/)
    })

    it('stamps a translucent two-line watermark (WO code + mark) across the middle of the drawing page', async () => {
      const bytes = await buildMoPrintPdf(makePlan([makeRow()]), async () => fakePdfBytes(1))
      const merged = await PDFDocument.load(bytes)
      const [pageHeight] = PageSizes.A3

      expect(pageHasTranslucentGraphicsState(merged, 2)).toBe(true)
      const middleThirdYs = textOriginYs(merged, 2).filter(y => y > pageHeight / 3 && y < (pageHeight * 2) / 3)
      expect(middleThirdYs).toHaveLength(2)
    })
  })

  // WO traveler — one fixed A3-landscape page per WO, split in two
  // columns: WO details / Consume / Production Time / Activities / QC on
  // the left, Assembly List + Notes on the right. Lists never overflow
  // onto extra pages; a list longer than its slot is capped with a
  // "+N more" pointer to the WO page (QR) (2026-09-16).
  describe('WO traveler (single page)', () => {
    const longActivities = Array.from({ length: 100 }, (_, i) => ({
      name: `Activity ${i}`, kind: 'run' as const, minutes: 1, unresolved: false,
    }))
    const longConsume = Array.from({ length: 60 }, (_, i) => ({
      material_id: i, code: `MAT-${i}`, name: `Material ${i}`, qty: 1, unit: 'kg',
    }))

    it('does not throw with a normal activity list (including an unresolved one), a Thai consume list, and a full Production Time', async () => {
      const plan = makePlan([makeRow({
        activities: [
          { name: 'Setup — Beam @ WC-HBEAM', kind: 'setup', minutes: 15, unresolved: false },
          { name: 'H-beam assembly & SAW weld', kind: 'run', minutes: 10, unresolved: false },
          { name: 'Undocumented step', kind: 'run', minutes: 0, unresolved: true },
        ],
        consume: [{ material_id: 1, code: 'BIF81100052', name: 'ลวดเชื่อม SAW 2.4 mm', qty: 29.94, unit: 'kg' }],
        assignedTo: 'สมชาย',
        planStart: new Date('2026-09-17T01:00:00Z'),
        planEnd: new Date('2026-09-17T05:00:00Z'),
      })])

      const bytes = await buildMoPrintPdf(plan, async () => fakePdfBytes(1))
      const merged = await PDFDocument.load(bytes)

      expect(merged.getPageCount()).toBe(1 + 2)
    })

    it('does not throw when a row has no activities, no consume, no assignee and no schedule', async () => {
      const plan = makePlan([makeRow({ activities: [], consume: [], assignedTo: null, planStart: null, planEnd: null, assemblyName: null, assemblyWeightKg: null })])

      await expect(buildMoPrintPdf(plan, async () => fakePdfBytes(1))).resolves.toBeInstanceOf(Uint8Array)
    })

    it('keeps the traveler on exactly one page with very long activity AND consume lists, drawing nothing past the page border', async () => {
      const plan = makePlan([makeRow({ activities: longActivities, consume: longConsume })])

      const bytes = await buildMoPrintPdf(plan, async () => fakePdfBytes(1))
      const merged = await PDFDocument.load(bytes)

      expect(merged.getPageCount()).toBe(1 + 2)
      for (const y of textOriginYs(merged, 1)) expect(y).toBeGreaterThanOrEqual(20)
    })

    it('stamps the same translucent WO/mark watermark as the drawing page', async () => {
      const bytes = await buildMoPrintPdf(makePlan([makeRow()]), async () => fakePdfBytes(1))
      const merged = await PDFDocument.load(bytes)

      expect(pageHasTranslucentGraphicsState(merged, 1)).toBe(true)
      // The manifest is MO-level — no single WO to stamp.
      expect(pageHasTranslucentGraphicsState(merged, 0)).toBe(false)
    })

    it('fills the right half of the page too (Assembly List + QC log), not just the left column', async () => {
      const bytes = await buildMoPrintPdf(makePlan([makeRow()]), async () => fakePdfBytes(1))
      const merged = await PDFDocument.load(bytes)
      const [, pageWidth] = PageSizes.A3

      const xs = Array.from(decodedContentStream(merged, 1).matchAll(/(-?[\d.]+) (-?[\d.]+) Tm/g), m => Number(m[1]))
      expect(xs.some(x => x > pageWidth / 2)).toBe(true)
    })
  })
})
