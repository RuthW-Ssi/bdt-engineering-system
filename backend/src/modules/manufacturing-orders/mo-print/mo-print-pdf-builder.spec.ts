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

// Every drawn glyph whose CID has no entry in its own font's /W array — the
// PDF then falls back to a 1000-unit default width, which is exactly the
// wide-gap bug in Thai text ("เชื่อม"). Walks each page's content stream in
// order, tracking the current font (`/Name size Tf`) so each `<hex> Tj` is
// checked against the right font's /W, not a union of all fonts.
function glyphsWithoutWidth(doc: PDFDocument): string[] {
  const missing: string[] = []
  for (let i = 0; i < doc.getPageCount(); i++) {
    const fonts = doc.getPage(i).node.Resources()?.lookupMaybe(PDFName.of('Font'), PDFDict)
    const coverage = new Map<string, Set<number>>()
    const covered = (name: string): Set<number> => {
      if (!coverage.has(name)) {
        const set = new Set<number>()
        const type0 = fonts?.lookupMaybe(PDFName.of(name), PDFDict)
        const cid = type0?.lookupMaybe(PDFName.of('DescendantFonts'), PDFArray)?.lookup(0, PDFDict)
        const w = cid?.lookupMaybe(PDFName.of('W'), PDFArray)
        for (let j = 0; w && j < w.size();) {
          const first = w.lookup(j, PDFNumber).asNumber()
          const next = w.lookup(j + 1)
          if (next instanceof PDFArray) {
            for (let k = 0; k < next.size(); k++) set.add(first + k)
            j += 2
          } else {
            for (let c = first; c <= (next as PDFNumber).asNumber(); c++) set.add(c)
            j += 3
          }
        }
        coverage.set(name, set)
      }
      return coverage.get(name)!
    }
    let font = ''
    for (const m of decodedContentStream(doc, i).matchAll(/\/([^\s/]+) [\d.]+ Tf|<([0-9A-Fa-f]+)> Tj/g)) {
      if (m[1]) { font = m[1]; continue }
      for (let j = 0; j < m[2].length; j += 4) {
        const code = m[2].slice(j, j + 4)
        if (!covered(font).has(parseInt(code, 16))) missing.push(`page ${i + 1} ${font} <${code}>`)
      }
    }
  }
  return missing
}

// True if any embedded font's ToUnicode map carries a Thai codepoint — i.e.
// Thai text was actually drawn. (Subset fonts renumber glyph ids per
// document, so comparing raw glyph codes across two PDFs means nothing.)
function drewThai(doc: PDFDocument): boolean {
  return doc.context.enumerateIndirectObjects().some(([, obj]) => {
    if (!(obj instanceof PDFDict) || obj.get(PDFName.of('Subtype'))?.toString() !== '/Type0') return false
    const toUnicode = doc.context.lookup(obj.get(PDFName.of('ToUnicode')))
    if (!(toUnicode instanceof PDFRawStream)) return false
    const raw = Buffer.from(toUnicode.contents)
    const cmap = (toUnicode.dict.get(PDFName.of('Filter'))?.toString() === '/FlateDecode' ? zlib.inflateSync(raw) : raw).toString('latin1')
    return /<0E[0-7][0-9A-Fa-f]>/.test(cmap)
  })
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

async function fakePdfBytes(pageCount: number, size: [number, number] = [200, 200]): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pageCount; i++) {
    // A real shop drawing always has drawn content — a page with zero draw
    // calls has no /Contents stream at all, which doc.embedPage() (used
    // for the Shop Drawing page) rejects with MissingPageContentsEmbeddingError.
    doc.addPage(size).drawLine({ start: { x: 0, y: 0 }, end: { x: size[0], y: size[1] } })
  }
  return doc.save()
}

function makeRow(overrides: Partial<MoPrintWorkOrderRow> = {}): MoPrintWorkOrderRow {
  return {
    wo: { id: 1398, wo_code: 'WO-00000739', sequence: 10, status: 'NOT_STARTED', expected_duration_min: 60, setup_time_min: 15, created_at: new Date('2026-09-20T00:00:00Z') },
    workCenterName: 'Cutting',
    projectName: 'Smash golf driving range Bangna',
    projectCode: 'DBN',
    zoneLabel: 'BIF Zone 1',
    subZoneName: null,
    activities: [],
    woUrl: 'http://localhost:5173/order/wo/1398',
    consume: [],
    operationLabel: 'OP-WELD-SAW — SAW auto weld',
    marks: [{
      assemblyMark: 'DBN-A1-CTR1', sourceLabel: 'BOM rev 1', renamedFrom: null, name: 'Column A1', qty: 1, weight_kg: 450,
      drawing: { file_key: 'drawings/dbn-a1-ctr1-rev1.pdf', file_name: 'DBN-A1-CTR1 - - Rev 1.pdf', version: 1, uploaded_at: new Date('2026-09-14T00:00:00Z') },
    }],
    assignedTo: null,
    teamHeadcount: 1,
    icon: null,
    planStart: null,
    planEnd: null,
    ...overrides,
  }
}

function makePlan(rows: MoPrintWorkOrderRow[], overrides: Partial<MoPrintPacketPlan> = {}): MoPrintPacketPlan {
  return {
    mo: { id: 85, mo_code: 'MO-00014', plan_start: null, plan_finish: null, actual_start: null, actual_finish: null, status: 'CONFIRMED', primary_mark_prefix_code: 'CTR', shop_type: 'FULL_SHOP' as const, revision: 0, preshopRemaining: false, projectCode: null, projectName: null, zoneLabel: null, subZoneName: null },
    rows,
    routingOps: [],
    marks: [],
    assemblyParts: [],
    ...overrides,
  }
}

// PDF/font rendering is genuinely slow; the default 5000ms has no headroom
// once CPU is shared across a full parallel test run (confirmed 2026-09-24:
// 16.3s solo vs. a timeout embedded in a 56-suite run).
jest.setTimeout(20000)

describe('buildMoPrintPdf', () => {
  it('produces one manifest page, then a traveler page + one dedicated drawing page per WO row, in order', async () => {
    const plan = makePlan([
      makeRow({ wo: { id: 1398, wo_code: 'WO-00000739', sequence: 10, status: 'NOT_STARTED', expected_duration_min: 60, setup_time_min: 15, created_at: new Date('2026-09-20T00:00:00Z') } }),
      makeRow({ wo: { id: 1399, wo_code: 'WO-00000740', sequence: 20, status: 'NOT_STARTED', expected_duration_min: 30, setup_time_min: 5, created_at: new Date('2026-09-20T00:00:00Z') } }),
    ])
    const drawingPageCounts = [1, 2] // a multi-page drawing source must not inflate output page count
    let call = 0
    const fetchDrawingBytes = jest.fn(async () => fakePdfBytes(drawingPageCounts[call++]))

    const bytes = await buildMoPrintPdf(plan, fetchDrawingBytes)
    const merged = await PDFDocument.load(bytes)

    expect(merged.getPageCount()).toBe(1 + 2 * 2)
    expect(fetchDrawingBytes).toHaveBeenCalledTimes(2)
  })

  it('2026-10-07: a mark with no drawing keeps its traveler page but gets no drawing page (nothing fetched)', async () => {
    const plan = makePlan([makeRow({ marks: [{ assemblyMark: 'BUH1-3', sourceLabel: 'BOM rev 1', renamedFrom: null, name: null, qty: 2, weight_kg: 3561.15, drawing: null }] })])
    const fetchDrawingBytes = jest.fn(async () => fakePdfBytes(1))
    const merged = await PDFDocument.load(await buildMoPrintPdf(plan, fetchDrawingBytes))
    expect(merged.getPageCount()).toBe(1 + 1)
    expect(fetchDrawingBytes).not.toHaveBeenCalled()
  })

  // The packet is opened via a blob: URL in a new browser tab (MoDetail.tsx's
  // handlePrint), not downloaded directly — a Content-Disposition header
  // has no effect there, so the PDF's own /Title metadata is what a
  // browser's native PDF viewer actually suggests as the filename on Save
  // (2026-09-16).
  it("sets the PDF's Title metadata to the MO code plus a timestamp, so 'Save' suggests a sane filename", async () => {
    const plan = makePlan([makeRow()], { mo: { id: 85, mo_code: 'MO-00014', plan_start: null, plan_finish: null, actual_start: null, actual_finish: null, status: 'CONFIRMED', primary_mark_prefix_code: 'CTR', shop_type: 'FULL_SHOP' as const, revision: 0, preshopRemaining: false, projectCode: null, projectName: null, zoneLabel: null, subZoneName: null } })

    const bytes = await buildMoPrintPdf(plan, async () => fakePdfBytes(1))
    const merged = await PDFDocument.load(bytes)

    expect(merged.getTitle()).toMatch(/^MO-00014-\d{8}-\d{6}$/)
  })

  it('renders the manifest and traveler pages at A3 landscape', async () => {
    const bytes = await buildMoPrintPdf(makePlan([makeRow()]), async () => fakePdfBytes(1))
    const merged = await PDFDocument.load(bytes)
    const [a3Short, a3Long] = PageSizes.A3
    for (const i of [0, 1]) { // manifest, traveler — the drawing page (2) is covered below, it's deliberately NOT A3
      const { width, height } = merged.getPage(i).getSize()
      expect([width, height]).toEqual([a3Long, a3Short])
    }
  })

  // 2026-09-23: "drawing ต้องเต็มแผ่นตามของจริง" — full-bleed, so the
  // drawing page's own size must match its embedded drawing's native size
  // exactly (not the packet's fixed A3-landscape), otherwise it's scaled/
  // letterboxed rather than "the real thing".
  it('sizes the drawing page to match its embedded drawing\'s own dimensions, not the fixed A3-landscape packet size', async () => {
    const bytes = await buildMoPrintPdf(makePlan([makeRow()]), async () => fakePdfBytes(1)) // fakePdfBytes pages are 200x200
    const merged = await PDFDocument.load(bytes)

    const { width, height } = merged.getPage(2).getSize()
    expect([width, height]).toEqual([200, 200])
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

  // Regression, two bugs in one (2026-09-15 / 2026-09-29): pdf-lib's
  // non-subset embedder left Sarabun's contextual tone-mark alternates (GSUB
  // 'ccmp', e.g. after sara-ue in "เชื่อม") without a /W entry → a wide gap;
  // the first fix turned 'ccmp' off, which instead dropped every tone mark
  // onto its upper vowel ("วันที่" → "วันที"). Subset embedding with ccmp on
  // fixes both — this guards the gap half (every drawn glyph has a width);
  // the stacking half was verified by rendering.
  it('gives every drawn glyph a /W width entry, including Thai tone-mark alternates ("เชื่อม", "วันที่", "สั่ง")', async () => {
    const plan = makePlan([makeRow({
      consume: [
        { material_id: 1, code: 'BIF81100052', name: 'ลวดเชื่อม SAW 2.4 mm', qty: 29.94, unit: 'kg' },
        { material_id: 2, code: 'BIF81100053', name: 'วันที่ เริ่มจริง ใบสั่งผลิต ครั้งที่ น้ำหนัก', qty: 1, unit: 'kg' },
      ],
    })])

    for (const lang of ['en', 'th'] as const) {
      const doc = await PDFDocument.load(await buildMoPrintPdf(plan, async () => fakePdfBytes(1), true, lang))
      expect(glyphsWithoutWidth(doc)).toEqual([])
    }
  })

  it('produces just the manifest page when there are no rows', async () => {
    const bytes = await buildMoPrintPdf(makePlan([]), jest.fn())
    const merged = await PDFDocument.load(bytes)
    expect(merged.getPageCount()).toBe(1)
  })

  // Selective print (2026-09-21) — includeManifest is its own toggle,
  // independent of which WO rows are in the plan.
  it('2026-09-21: omits the manifest page entirely when includeManifest is false, printing only the WO rows', async () => {
    const plan = makePlan([makeRow(), makeRow({ wo: { id: 1399, wo_code: 'WO-00000740', sequence: 20, status: 'NOT_STARTED', expected_duration_min: 30, setup_time_min: 5, created_at: new Date('2026-09-20T00:00:00Z') } })])
    const bytes = await buildMoPrintPdf(plan, async () => fakePdfBytes(1), false)
    const merged = await PDFDocument.load(bytes)
    expect(merged.getPageCount()).toBe(2 * 2) // 2 rows × (traveler + drawing), no manifest page
  })

  it('embeds the company logo on the manifest page only, not the traveler pages', async () => {
    const bytes = await buildMoPrintPdf(makePlan([makeRow()]), async () => fakePdfBytes(1))
    const merged = await PDFDocument.load(bytes)

    expect(pageHasEmbeddedImage(merged, 0)).toBe(true)
    // Page 1's only embedded image is its own QR code — confirmed logo
    // placement stays manifest-only per 2026-09-15 feedback (the QR
    // already occupies that same top-right corner on traveler pages).
  })

  it('calls fetchDrawingBytes with the matching row and mark so the caller knows which file to fetch', async () => {
    const row = makeRow()
    const fetchDrawingBytes = jest.fn(async () => fakePdfBytes(1))

    await buildMoPrintPdf(makePlan([row]), fetchDrawingBytes)

    expect(fetchDrawingBytes).toHaveBeenCalledWith(row, row.marks[0])
  })

  // Regression: mark/team names in this app are routinely Thai (e.g. a
  // Thai assembly name or assignee) — pdf-lib's built-in StandardFonts only
  // encode WinAnsi (Latin-1) and throw on the first non-Latin character.
  // Live-caught on local dev while verifying this feature end-to-end
  // (2026-09-15).
  it('does not throw when the mark/team text contains Thai characters', async () => {
    const plan = makePlan([
      makeRow({
        marks: [{
          assemblyMark: 'DBN-A1-CTR1', sourceLabel: 'BOM rev 1', renamedFrom: null, name: 'เสาเหล็ก Column A1', qty: 1, weight_kg: 450,
          drawing: { file_key: 'drawings/dbn-a1-ctr1-rev1.pdf', file_name: 'DBN-A1-CTR1 - - Rev 1.pdf', version: 1, uploaded_at: new Date('2026-09-14T00:00:00Z') },
        }],
        assignedTo: 'ทีมช่างเชื่อม',
      }),
    ])

    await expect(buildMoPrintPdf(plan, async () => fakePdfBytes(1))).resolves.toBeInstanceOf(Uint8Array)
  })

  // Language toggle (2026-09-29) — a plan exercising every labelled section
  // (manifest + routing + assembly list + part list + traveler with consume
  // overflow and an unresolved activity), so every label in the dictionary
  // actually gets drawn.
  describe('lang (printed form labels)', () => {
    const fullPlan = () => makePlan([
      makeRow({
        consume: Array.from({ length: 10 }, (_, i) => ({ material_id: i, code: `MAT-${i}`, name: `Material ${i}`, qty: 1, unit: 'kg' })),
        activities: [
          { name: 'Setup', kind: 'setup', minutes: 15, unresolved: false },
          { name: 'Undocumented step', kind: 'run', minutes: 0, unresolved: true },
        ],
      }),
    ], {
      routingOps: [{ sequence: 10, operationLabel: 'SAW auto weld', workCenterName: 'Cutting', woCodes: ['WO-00000739'] }],
      marks: [{ seq: 1, assemblyMark: 'DBN-A1-CTR1', sourceLabel: 'BOM rev 1', renamedFrom: null, name: 'Column A1', width_mm: 200, length_mm: 6000, height_mm: 300, weight_kg: 450, qty: 1 }],
      assemblyParts: [{ assemblyMark: 'DBN-A1-CTR1', name: 'COLUMN', qty: 1, parts: [{ part_mark: 'DBN-A1-m1', profile: 'PIPE', grade: 'SS400', qty: 1, weight_kg: 10 }] }],
    })

    it('renders a Thai packet with the same page layout as the English one', async () => {
      const en = await PDFDocument.load(await buildMoPrintPdf(fullPlan(), async () => fakePdfBytes(1), true, 'en'))
      const th = await PDFDocument.load(await buildMoPrintPdf(fullPlan(), async () => fakePdfBytes(1), true, 'th'))
      expect(th.getPageCount()).toBe(en.getPageCount())
    })

    it('draws the labels in Thai only when lang is th', async () => {
      // fullPlan() carries no Thai data, so any Thai drawn comes from labels.
      expect(drewThai(await PDFDocument.load(await buildMoPrintPdf(fullPlan(), async () => fakePdfBytes(1), true, 'th')))).toBe(true)
      expect(drewThai(await PDFDocument.load(await buildMoPrintPdf(fullPlan(), async () => fakePdfBytes(1), true, 'en')))).toBe(false)
    })

    it('defaults to English when lang is omitted', async () => {
      expect(drewThai(await PDFDocument.load(await buildMoPrintPdf(fullPlan(), async () => fakePdfBytes(1))))).toBe(false)
    })

    it('gives every glyph of the Thai labels a /W width entry', async () => {
      const th = await PDFDocument.load(await buildMoPrintPdf(fullPlan(), async () => fakePdfBytes(1), true, 'th'))
      expect(glyphsWithoutWidth(th)).toEqual([])
    })
  })

  // List Mark — one row per mo_assembly_line (every distinct mark in the
  // MO, with its dimensions/weight and dispatch project/zone), replacing
  // the old per-WO/per-operation "Work Orders" table (2026-09-16).
  describe('Assembly List (MO page, right column)', () => {
    it('does not add extra pages for a normal-sized mark list', async () => {
      const plan = makePlan([makeRow()], {
        marks: [
          { seq: 1, assemblyMark: 'DBN-A1-CTR1', sourceLabel: 'BOM rev 1', renamedFrom: null, name: 'Column A1', width_mm: 200, length_mm: 6000, height_mm: 300, weight_kg: 450, qty: 1 },
          { seq: 2, assemblyMark: 'DBN-A1-CTR2', sourceLabel: 'BOM rev 1', renamedFrom: null, name: null, width_mm: null, length_mm: 3000, height_mm: 200, weight_kg: null, qty: 2 },
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

    // 2026-09-22: "เอา project zone ออกจาก assembly แล้วเอาไปไว้ตรง mo info
    // แทน" — Project/Zone moved off this table onto plan.mo instead (both
    // with and without a sub-zone). Just a rendering smoke test (no
    // structural page-count change expected) — the PDF library's text is
    // CID-encoded, so exact string assertions aren't feasible here; see
    // the file's other tests for that established limitation.
    it('renders MO Info with a project/zone (and sub-zone) on plan.mo without throwing', async () => {
      const plan = makePlan([makeRow()], {
        mo: { id: 85, mo_code: 'MO-00014', plan_start: null, plan_finish: null, actual_start: null, actual_finish: null, status: 'CONFIRMED', primary_mark_prefix_code: 'CTR', shop_type: 'FULL_SHOP' as const, revision: 0, preshopRemaining: false, projectCode: 'DBN', projectName: 'Smash golf driving range Bangna', zoneLabel: 'BIF Zone 1', subZoneName: 'North Bay' },
        marks: [{ seq: 1, assemblyMark: 'DBN-A1-CTR1', sourceLabel: 'BOM rev 1', renamedFrom: null, name: 'Column A1', width_mm: 200, length_mm: 6000, height_mm: 300, weight_kg: 450, qty: 1 }],
      })

      const bytes = await buildMoPrintPdf(plan, async () => fakePdfBytes(1))
      const merged = await PDFDocument.load(bytes)

      expect(merged.getPageCount()).toBe(1 + 2)
    })

    it('continues a long mark list onto extra pages, without drawing past the page border', async () => {
      const longMarkList = Array.from({ length: 60 }, (_, i) => ({
        seq: i + 1, assemblyMark: `M-${i}`, sourceLabel: 'BOM rev 1', renamedFrom: null, name: `Assembly ${i}`, projectCode: 'DBN', projectName: 'Smash golf driving range Bangna',
        zoneLabel: 'BIF Zone 1', subZoneName: null, width_mm: 200, length_mm: 6000, height_mm: 300, weight_kg: 450, qty: 1,
      }))
      const plan = makePlan([makeRow()], { marks: longMarkList })

      const bytes = await buildMoPrintPdf(plan, async () => fakePdfBytes(1))
      const merged = await PDFDocument.load(bytes)

      const manifestPages = merged.getPageCount() - 2
      expect(manifestPages).toBeGreaterThan(1)
      for (let i = 0; i < manifestPages; i++) {
        for (const y of textOriginYs(merged, i)) expect(y).toBeGreaterThanOrEqual(20)
        // 2026-09-23: every MO-section page gets the MO watermark, including
        // "Assembly List (cont.)" pages, not just the first manifest page.
        expect(pageHasTranslucentGraphicsState(merged, i)).toBe(true)
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

    // 2026-09-22: "ด้านบนอยากให้มีเพิ่ม 1 table...รอบเบิก, date/time,
    // ผู้เบิก, ผู้ควบคุม store...row ก็จะมี ครั้งที่ 1, 2, 3" — a small
    // 4-column/3-row Withdrawal Log sits above the Assembly Part List table
    // on its first page.
    it('puts a 4-column, 3-round Withdrawal Log above the Assembly Part List table, without drawing past the page border', async () => {
      const plan = makePlan([makeRow()], {
        assemblyParts: [{ assemblyMark: 'DBN-B1-CTR1', name: 'COLUMN', qty: 1, parts: [{ part_mark: 'DBN-B1-m65', profile: 'PIPE', grade: 'SS400', qty: 1, weight_kg: 10 }] }],
      })

      const bytes = await buildMoPrintPdf(plan, async () => fakePdfBytes(1))
      const merged = await PDFDocument.load(bytes)

      // MO page(0) + Assembly Part List page(1) + traveler(2) + drawing(3).
      expect(decodedContentStream(merged, 1)).toMatch(/Tj/)
      for (const y of textOriginYs(merged, 1)) expect(y).toBeGreaterThanOrEqual(20)
    })

    it('overflows onto extra pages for a long list — including mid-group — without drawing past the page border', async () => {
      const assemblyParts = Array.from({ length: 6 }, (_, a) => ({
        assemblyMark: `M-${a}`, sourceLabel: 'BOM rev 1', renamedFrom: null, name: 'COLUMN', qty: 1,
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
        // 2026-09-23: every MO-section page gets the MO watermark, including
        // every Assembly Part List overflow page, not just the first one.
        expect(pageHasTranslucentGraphicsState(merged, i)).toBe(true)
      }
    })
  })

  // MO page (2026-09-16 redesign): header, MO Info + Routing checklist on
  // the left, the MO's Assembly List ruled down the right. MO-level Consume
  // is no longer printed here (still per WO on each traveler).
  describe('MO page', () => {
    it('prints a single MO page for several operations and marks, with nothing below the page border', async () => {
      const rows = [10, 20, 30].flatMap(sequence => [0, 1].map(i => makeRow({
        wo: { id: sequence * 10 + i, wo_code: `WO-000000${sequence}${i}`, sequence, status: 'NOT_STARTED', expected_duration_min: 60, setup_time_min: 15, created_at: new Date('2026-09-20T00:00:00Z') },
      })))
      const marks = ['M-1', 'M-2'].map((assemblyMark, i) => ({
        seq: i + 1, assemblyMark, sourceLabel: 'BOM rev 1', renamedFrom: null, name: 'โครงหลังคา', projectCode: 'DBN', projectName: 'x', zoneLabel: 'BIF Zone 1',
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
      const plan = makePlan([makeRow({ wo: { id: 1398, wo_code: 'WO-00000739', sequence: 10, status: 'NOT_STARTED', expected_duration_min: 45, setup_time_min: 10, created_at: new Date('2026-09-20T00:00:00Z') } })])

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

  // Shop Drawing — each mark's matched drawing's first page, scaled to fill
  // its own dedicated A3 landscape page right after that WO's traveler
  // (2026-09-16: replaces the inline preview at the bottom of the
  // traveler; 2026-09-22: one such page per mark, not one per WO — see the
  // multi-mark describe block below for that specifically).
  describe('Shop Drawing (dedicated page per mark)', () => {
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

    it('labels the drawing page with text (WO code + mark) so a sheet separated from its traveler can be matched back', async () => {
      const bytes = await buildMoPrintPdf(makePlan([makeRow()]), async () => fakePdfBytes(1))
      const merged = await PDFDocument.load(bytes)

      expect(decodedContentStream(merged, 2)).toMatch(/Tj/)
    })

    // 2026-09-23: "ย้าย WO-00000165 · DBN-B1-STR1 ไปไว้มุมขวาล่าง" — moved
    // from top-left to bottom-right, clear of the drawing's own content.
    it('positions the corner label in the bottom-right of the drawing page, not top-left', async () => {
      // A realistic (large, landscape) engineering-sheet size — the shared
      // 200x200 fixture is too narrow for a "WO-code · mark" label at 12pt
      // to visibly land right of center; real shop drawings are far larger
      // than a print-packet page, not smaller.
      const bytes = await buildMoPrintPdf(makePlan([makeRow()]), async () => fakePdfBytes(1, [1600, 1000]))
      const merged = await PDFDocument.load(bytes)
      const { width: pageWidth, height: pageHeight } = merged.getPage(2).getSize()

      const positions = Array.from(
        decodedContentStream(merged, 2).matchAll(/(-?[\d.]+) (-?[\d.]+) Tm/g),
        m => ({ x: Number(m[1]), y: Number(m[2]) }),
      )
      // 3 text runs on the drawing page: the corner label + the watermark's
      // 2 lines. The watermark sits centered mid-page (see the middle-third
      // test above) — the label is whichever run ISN'T in that middle band.
      const label = positions.find(p => !(p.y > pageHeight / 3 && p.y < (pageHeight * 2) / 3))
      expect(label).toBeDefined()
      expect(label!.y).toBeLessThan(pageHeight / 3)
      expect(label!.x).toBeGreaterThan(pageWidth / 2)
    })

    // 2026-10-05 (print option A; the user moved it twice, settling on the end
    // of the corner label: "เอามาอยู่ต่อท้าย DBN-B1-CTR10") — one bottom-right
    // run "WO · mark · Drawing vN · date"; the top-right page number stays plain.
    it('appends "Drawing vN · date" to the bottom-right WO · mark label and leaves the page number plain', async () => {
      const bytes = await buildMoPrintPdf(makePlan([makeRow()]), async () => fakePdfBytes(1, [1600, 1000]))
      const merged = await PDFDocument.load(bytes)
      const { width: pageWidth, height: pageHeight } = merged.getPage(2).getSize()
      const runs = Array.from(decodedContentStream(merged, 2).matchAll(/(-?[\d.]+) (-?[\d.]+) Tm/g), m => ({ x: Number(m[1]), y: Number(m[2]) }))

      const corner = runs.filter(p => p.y < pageHeight / 3)
      expect(corner).toHaveLength(1)
      // "WO-00000739 · DBN-A1-CTR1" alone at 12pt bold is ~170pt wide; with the stamp it reaches well further left.
      expect(corner[0].x).toBeLessThan(pageWidth - 250)
      const top = runs.filter(p => p.y > pageHeight - 20)
      expect(top).toHaveLength(1)
      expect(top[0].x).toBeGreaterThan(pageWidth - 40) // bare "3 / 3"
    })

    it('keeps a plain page number (no stamp) on the traveler page', async () => {
      const bytes = await buildMoPrintPdf(makePlan([makeRow()]), async () => fakePdfBytes(1, [1600, 1000]))
      const merged = await PDFDocument.load(bytes)
      const { width, height } = merged.getPage(1).getSize()
      const top = Array.from(decodedContentStream(merged, 1).matchAll(/(-?[\d.]+) (-?[\d.]+) Tm/g), m => ({ x: Number(m[1]), y: Number(m[2]) }))
        .filter(p => p.y > height - 20)
      expect(top).toHaveLength(1)
      expect(top[0].x).toBeGreaterThan(width - 40)
    })

    // 2026-09-22: "ตรงลายน้ำบน Drawing ต้องใส่ mark ลงไปด้วย" — the drawing
    // page's watermark carries the mark too (two lines), unlike the
    // traveler's (WO code only) — a WO now contributes one drawing page per
    // mark, so the mark is what tells otherwise-identical sheets apart.
    // + the drawing revision as a third line (2026-10-05: "เอาไปใส่ตรงลายน้ำด้วย").
    it('stamps a translucent three-line WO-code + mark + drawing-revision watermark across the middle of the drawing page', async () => {
      const bytes = await buildMoPrintPdf(makePlan([makeRow()]), async () => fakePdfBytes(1))
      const merged = await PDFDocument.load(bytes)
      // The drawing page's own height (2026-09-23: no longer the fixed A3
      // constant — it's sized to match the embedded drawing, see the
      // dedicated sizing test above), read back from the actual page so this
      // stays correct regardless of what size fakePdfBytes produces.
      const { height: pageHeight } = merged.getPage(2).getSize()

      expect(pageHasTranslucentGraphicsState(merged, 2)).toBe(true)
      const middleThirdYs = textOriginYs(merged, 2).filter(y => y > pageHeight / 3 && y < (pageHeight * 2) / 3)
      expect(middleThirdYs).toHaveLength(3)
    })

    // 2026-09-22: "wo มีหลายมาก mark ทำไมถึงแสดงแค่ print แค่ 1 drawing
    // ต้อง print ทุก drawing ที่มี mark" — a multi-mark WO used to embed
    // only its primary mark's drawing once; now every mark gets its own
    // drawing page, fetched and labeled separately.
    it('embeds one drawing page per mark on a multi-mark WO, not just the primary mark, each fetched and labeled separately', async () => {
      const plan = makePlan([makeRow({
        marks: [
          { assemblyMark: 'DBN-A1-CTR1', sourceLabel: 'BOM rev 1', renamedFrom: null, name: 'Column A1', qty: 1, weight_kg: 450, drawing: { file_key: 'd1.pdf', file_name: 'd1.pdf', version: 1, uploaded_at: new Date('2026-09-14T00:00:00Z') } },
          { assemblyMark: 'DBN-A1-CTR2', sourceLabel: 'BOM rev 1', renamedFrom: null, name: 'Column A2', qty: 1, weight_kg: 220, drawing: { file_key: 'd2.pdf', file_name: 'd2.pdf', version: 1, uploaded_at: new Date('2026-09-14T00:00:00Z') } },
        ],
      })])
      const fetchDrawingBytes = jest.fn(async () => fakePdfBytes(1))

      const bytes = await buildMoPrintPdf(plan, fetchDrawingBytes)
      const merged = await PDFDocument.load(bytes)

      // manifest(0) + traveler(1) + drawing for CTR1(2) + drawing for CTR2(3).
      expect(merged.getPageCount()).toBe(1 + 1 + 2)
      expect(fetchDrawingBytes).toHaveBeenCalledTimes(2)
      expect(fetchDrawingBytes).toHaveBeenCalledWith(plan.rows[0], plan.rows[0].marks[0])
      expect(fetchDrawingBytes).toHaveBeenCalledWith(plan.rows[0], plan.rows[0].marks[1])
      expect(decodedContentStream(merged, 2)).toMatch(/Tj/)
      expect(decodedContentStream(merged, 3)).toMatch(/Tj/)
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
    const longMarks = Array.from({ length: 30 }, (_, i) => ({
      assemblyMark: `DBN-A1-CTR${i}`, sourceLabel: 'BOM rev 1', renamedFrom: null, name: `Column ${i}`, qty: 1, weight_kg: 450,
      drawing: { file_key: `drawings/dbn-a1-ctr${i}-rev1.pdf`, file_name: `DBN-A1-CTR${i} - - Rev 1.pdf`, version: 1, uploaded_at: new Date('2026-09-14T00:00:00Z') },
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
      const plan = makePlan([makeRow({
        activities: [], consume: [], assignedTo: null, planStart: null, planEnd: null,
        marks: [{
          assemblyMark: 'DBN-A1-CTR1', sourceLabel: 'BOM rev 1', renamedFrom: null, name: null, qty: null, weight_kg: null,
          drawing: { file_key: 'drawings/dbn-a1-ctr1-rev1.pdf', file_name: 'DBN-A1-CTR1 - - Rev 1.pdf', version: 1, uploaded_at: new Date('2026-09-14T00:00:00Z') },
        }],
      })])

      await expect(buildMoPrintPdf(plan, async () => fakePdfBytes(1))).resolves.toBeInstanceOf(Uint8Array)
    })

    it('does not throw when a row has zero marks (Assembly List & QC table entirely blank)', async () => {
      const plan = makePlan([makeRow({ marks: [] })])

      await expect(buildMoPrintPdf(plan, async () => fakePdfBytes(1))).resolves.toBeInstanceOf(Uint8Array)
    })

    it('keeps the traveler on exactly one page with very long activity AND consume lists (left column stays capped), drawing nothing past the page border', async () => {
      const plan = makePlan([makeRow({ activities: longActivities, consume: longConsume })])

      const bytes = await buildMoPrintPdf(plan, async () => fakePdfBytes(1))
      const merged = await PDFDocument.load(bytes)

      expect(merged.getPageCount()).toBe(1 + 2)
      for (const y of textOriginYs(merged, 1)) expect(y).toBeGreaterThanOrEqual(20)
    })

    // 2026-09-21: "ต้องแสดง assembly list ทั้งหมด" — unlike the left
    // column's tables (capped, "+N more"), Assembly List & QC must show
    // every mark, however many there are, continuing onto full-width
    // "(cont.)" pages instead.
    it('shows every mark across as many continuation pages as it takes, never capping, drawing nothing past the page border', async () => {
      const plan = makePlan([makeRow({ marks: longMarks })])

      const bytes = await buildMoPrintPdf(plan, async () => fakePdfBytes(1))
      const merged = await PDFDocument.load(bytes)

      // One drawing page per mark trails the traveler pages (2026-09-22) —
      // isolate the manifest+traveler+"(cont.)" pages from those (their own
      // border-safety is covered by the dedicated Shop Drawing tests).
      const travelerPageCount = merged.getPageCount() - 1 - longMarks.length
      expect(travelerPageCount).toBeGreaterThan(1) // manifest + traveler + at least one "(cont.)" page.
      for (let i = 1; i <= travelerPageCount; i++) {
        for (const y of textOriginYs(merged, i)) expect(y).toBeGreaterThanOrEqual(20)
      }
    })

    it('stamps a translucent WO-code watermark on the traveler page', async () => {
      const bytes = await buildMoPrintPdf(makePlan([makeRow()]), async () => fakePdfBytes(1))
      const merged = await PDFDocument.load(bytes)

      expect(pageHasTranslucentGraphicsState(merged, 1)).toBe(true)
    })

    // 2026-09-23: "mo ทุกหน้าต้องมี ลายน้ำเป็น mo ด้วยทุกหน้า" — the manifest
    // (MO-level, no single WO to stamp) previously had none at all; now it
    // gets its own one-line MO-code watermark, same as every other
    // MO-section page (Assembly List continuation, Assembly Part List).
    it('stamps a translucent MO-code watermark on the manifest page too', async () => {
      const bytes = await buildMoPrintPdf(makePlan([makeRow()]), async () => fakePdfBytes(1))
      const merged = await PDFDocument.load(bytes)

      expect(pageHasTranslucentGraphicsState(merged, 0)).toBe(true)
    })

    it('fills the right half of the page too (Assembly List + QC log), not just the left column', async () => {
      const bytes = await buildMoPrintPdf(makePlan([makeRow()]), async () => fakePdfBytes(1))
      const merged = await PDFDocument.load(bytes)
      const [, pageWidth] = PageSizes.A3

      const xs = Array.from(decodedContentStream(merged, 1).matchAll(/(-?[\d.]+) (-?[\d.]+) Tm/g), m => Number(m[1]))
      expect(xs.some(x => x > pageWidth / 2)).toBe(true)
    })
  })

  // 2026-10-05 (print option A): a drawing uploaded after the WO was created
  // gets a note on the traveler, in the top margin above both columns.
  describe('drawing updated after the WO', () => {
    const topMarginRuns = (doc: PDFDocument, pageIndex: number) => {
      const { height } = doc.getPage(pageIndex).getSize()
      return textOriginYs(doc, pageIndex).filter(y => y > height - 40).length
    }
    const updatedRow = () => makeRow({
      marks: [{ ...makeRow().marks[0], drawing: { ...makeRow().marks[0].drawing!, version: 3, uploaded_at: new Date('2026-10-02T03:00:00Z') } }],
    })
    const traveler = async (row: MoPrintWorkOrderRow) => PDFDocument.load(await buildMoPrintPdf(makePlan([row]), async () => fakePdfBytes(1)))

    it('adds exactly one note in the traveler\'s top margin when a mark\'s drawing was uploaded after the WO was created', async () => {
      const baseline = topMarginRuns(await traveler(makeRow()), 1)
      expect(topMarginRuns(await traveler(updatedRow()), 1)).toBe(baseline + 1)
    })

    it('adds nothing when every drawing predates the WO', async () => {
      const baseline = topMarginRuns(await traveler(makeRow()), 1)
      const olderDrawing = makeRow({ wo: { ...makeRow().wo, created_at: new Date('2026-10-05T00:00:00Z') } })
      expect(topMarginRuns(await traveler(olderDrawing), 1)).toBe(baseline)
    })
  })
})
