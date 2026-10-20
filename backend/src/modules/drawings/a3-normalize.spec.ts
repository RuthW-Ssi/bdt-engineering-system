import { PDFArray, PDFDocument, PDFDict, PDFName, PageSizes, degrees } from 'pdf-lib'
import { A3_LANDSCAPE_HEIGHT, A3_LANDSCAPE_WIDTH, fitToA3Landscape, toA3Landscape, MAX_DRAWING_PAGES, TooManyPagesError } from './a3-normalize'

// Reproduces pdf-lib's own composition order for PDFPage.drawPage — the
// content stream emits translate, then rotate, then scale as SEPARATE `cm`
// operators (see node_modules/pdf-lib/cjs/api/operations.js `drawPage`), which
// PDF composes as translate∘rotate∘scale applied to the embedded page's own
// (unrotated) local coordinates. Re-deriving that composition here (instead
// of trusting the implementation's internal numbers) is what makes the
// rotation-direction assertions below meaningful.
function transformCorner([px, py]: [number, number], fit: { scale: number; x: number; y: number; rotate: number }): [number, number] {
  const sx = px * fit.scale
  const sy = py * fit.scale
  const rad = (fit.rotate * Math.PI) / 180
  const rx = sx * Math.cos(rad) - sy * Math.sin(rad)
  const ry = sx * Math.sin(rad) + sy * Math.cos(rad)
  return [rx + fit.x, ry + fit.y]
}

function boundingBoxOf(rawWidth: number, rawHeight: number, rotation: number) {
  const fit = fitToA3Landscape(rawWidth, rawHeight, rotation)
  const corners: [number, number][] = [[0, 0], [rawWidth, 0], [rawWidth, rawHeight], [0, rawHeight]]
  const transformed = corners.map(c => transformCorner(c, fit))
  const xs = transformed.map(p => p[0])
  const ys = transformed.map(p => p[1])
  return {
    fit,
    minX: Math.min(...xs), maxX: Math.max(...xs),
    minY: Math.min(...ys), maxY: Math.max(...ys),
  }
}

describe('fitToA3Landscape (pure geometry)', () => {
  const [A1_W, A1_H] = PageSizes.A1 // [1683.78, 2383.94] portrait
  const [A4_W, A4_H] = PageSizes.A4 // [595.28, 841.89] portrait

  it('A1 landscape fills the A3 landscape page almost exactly (same A-series aspect ratio; sub-point margin from ISO216 mm rounding, not cropped)', () => {
    const { fit, minX, maxX, minY, maxY } = boundingBoxOf(A1_H, A1_W, 0) // A1 landscape = [A1_H, A1_W]
    expect(fit.scale).toBeCloseTo(Math.min(A3_LANDSCAPE_WIDTH / A1_H, A3_LANDSCAPE_HEIGHT / A1_W), 6)
    // pdf-lib's PageSizes constants are each independently rounded to the
    // nearest 1/100 pt from ISO216's whole-mm sizes, so two A-series sizes
    // two steps apart (A1 → A3) don't share an EXACT aspect ratio (e.g.
    // 841.89/1683.78 = 0.5 exactly, but 1190.55/2383.94 = 0.499404…) — the
    // fit is still bound by the tighter axis (never crops), leaving under a
    // point of margin on the other axis, not the zero this would be with
    // perfectly proportional inputs.
    expect(Math.abs(minX)).toBeLessThan(1)
    expect(Math.abs(minY)).toBeLessThan(1)
    expect(Math.abs(A3_LANDSCAPE_WIDTH - maxX)).toBeLessThan(1)
    expect(Math.abs(A3_LANDSCAPE_HEIGHT - maxY)).toBeLessThan(1)
  })

  it('A1 portrait is scaled by height (841.89 / 2383.94) and centred horizontally', () => {
    const { fit, minX, maxX, minY, maxY } = boundingBoxOf(A1_W, A1_H, 0)
    expect(fit.scale).toBeCloseTo(A3_LANDSCAPE_HEIGHT / A1_H, 6) // = 841.89 / 2383.94
    expect(minY).toBeCloseTo(0, 4)
    expect(maxY).toBeCloseTo(A3_LANDSCAPE_HEIGHT, 4)
    // centred horizontally: equal left/right margin, narrower than the page
    expect(minX).toBeGreaterThan(0)
    expect(A3_LANDSCAPE_WIDTH - maxX).toBeCloseTo(minX, 4)
  })

  it('A4 portrait fits via min(A3w/w, A3h/h) and is centred (height-bound: A4’s long side == A3’s short side)', () => {
    const { fit, minX, maxX, minY, maxY } = boundingBoxOf(A4_W, A4_H, 0)
    expect(fit.scale).toBeCloseTo(Math.min(A3_LANDSCAPE_WIDTH / A4_W, A3_LANDSCAPE_HEIGHT / A4_H), 6)
    expect(minY).toBeCloseTo(0, 4)
    expect(maxY).toBeCloseTo(A3_LANDSCAPE_HEIGHT, 4)
    expect(minX).toBeGreaterThan(0) // centred horizontally
    expect(A3_LANDSCAPE_WIDTH - maxX).toBeCloseTo(minX, 4)
  })

  it.each([0, 90, 180, 270])('rotation %i°: lands upright, axis-aligned, centred, with the visual (post-rotation) box used for the fit', (rotation) => {
    const rawW = 400
    const rawH = 700
    const swapped = rotation === 90 || rotation === 270
    const visualW = swapped ? rawH : rawW
    const visualH = swapped ? rawW : rawH

    const { fit, minX, maxX, minY, maxY } = boundingBoxOf(rawW, rawH, rotation)

    expect(fit.scale).toBeCloseTo(Math.min(A3_LANDSCAPE_WIDTH / visualW, A3_LANDSCAPE_HEIGHT / visualH), 6)
    expect(maxX - minX).toBeCloseTo(visualW * fit.scale, 4)
    expect(maxY - minY).toBeCloseTo(visualH * fit.scale, 4)
    expect(minX).toBeCloseTo((A3_LANDSCAPE_WIDTH - visualW * fit.scale) / 2, 4)
    expect(minY).toBeCloseTo((A3_LANDSCAPE_HEIGHT - visualH * fit.scale) / 2, 4)
  })

  // Fix round 1, finding 3: the bounding-box checks above are direction-blind
  // — a wrong-signed (CCW instead of CW) rotation would produce the IDENTICAL
  // bounding box, just with content mirrored/transposed. Pin the direction by
  // tracking a NAMED corner: the PDF spec's /Rotate is degrees to rotate the
  // raw content CLOCKWISE when displaying it. Physically spinning a sheet of
  // paper clockwise by 90°/180°/270° sends its raw top-left corner to the
  // visual top-right / bottom-right / bottom-left respectively (90° CW: the
  // edge that was on the LEFT swings to the TOP, so the TOP-LEFT corner —
  // top∩left — ends up where top-edge's new home (the RIGHT side) meets the
  // left-edge's new home (the TOP) = TOP-RIGHT; 180° is the opposite corner;
  // 270° CW = 90° CCW, landing at BOTTOM-LEFT).
  it.each([
    { rotation: 0, expectedCorner: 'TL' as const },
    { rotation: 90, expectedCorner: 'TR' as const },
    { rotation: 180, expectedCorner: 'BR' as const },
    { rotation: 270, expectedCorner: 'BL' as const },
  ])('rotation $rotation°: the raw top-left corner lands at the visual $expectedCorner (pins CW vs CCW)', ({ rotation, expectedCorner }) => {
    const rawW = 400
    const rawH = 700
    const fit = fitToA3Landscape(rawW, rawH, rotation)
    const [tlX, tlY] = transformCorner([0, rawH], fit) // raw top-left: local (0, rawH)
    const { minX, maxX, minY, maxY } = boundingBoxOf(rawW, rawH, rotation)

    const expected = {
      TL: [minX, maxY], TR: [maxX, maxY], BR: [maxX, minY], BL: [minX, minY],
    }[expectedCorner]

    expect(tlX).toBeCloseTo(expected[0], 4)
    expect(tlY).toBeCloseTo(expected[1], 4)
  })

  it('normalises an out-of-range rotation (e.g. 360, -90) the same as its 0-359 equivalent', () => {
    const a = fitToA3Landscape(400, 700, 90)
    const b = fitToA3Landscape(400, 700, 450) // 450 mod 360 = 90
    const c = fitToA3Landscape(400, 700, -270) // -270 mod 360 = 90
    expect(b).toEqual(a)
    expect(c).toEqual(a)
  })
})

// pdf-lib can't embed a page with an empty/missing content stream — a real
// upload always has drawn content, so every source page here gets a trivial
// marker rectangle just so embedPages() has something to embed.
function markPage(page: import('pdf-lib').PDFPage) {
  page.drawRectangle({ x: 0, y: 0, width: 1, height: 1 })
}

// Fix round 1, finding 2: reads back the ACTUAL /BBox of the output page's
// embedded Form XObject — the ground truth for what box toA3Landscape used
// to embed the page, read from the real saved-and-reloaded PDF object graph
// (not a re-derivation of the implementation's own math) — proving it used
// the CropBox, not the MediaBox, when they differ.
async function embeddedXObjectBBox(pdfBytes: Buffer): Promise<number[]> {
  const doc = await PDFDocument.load(pdfBytes)
  const page = doc.getPage(0)
  const resources = page.node.Resources()!
  const xObjectDict = resources.lookup(PDFName.of('XObject'), PDFDict)
  const [firstKey] = xObjectDict.keys()
  const ref = xObjectDict.get(firstKey)!
  const xObject = doc.context.lookup(ref) as unknown as { dict: PDFDict }
  const bbox = xObject.dict.lookup(PDFName.of('BBox'), PDFArray)
  return bbox.asArray().map((n: any) => n.asNumber())
}

describe('toA3Landscape (pdf-lib integration)', () => {
  it('an A1 landscape page → 1 page of 1190.55 × 841.89', async () => {
    const src = await PDFDocument.create()
    const [a1w, a1h] = PageSizes.A1
    markPage(src.addPage([a1h, a1w])) // landscape
    const out = await toA3Landscape(Buffer.from(await src.save()))

    const doc = await PDFDocument.load(out)
    expect(doc.getPageCount()).toBe(1)
    const page = doc.getPage(0)
    expect(page.getWidth()).toBeCloseTo(A3_LANDSCAPE_WIDTH, 2)
    expect(page.getHeight()).toBeCloseTo(A3_LANDSCAPE_HEIGHT, 2)
    expect(page.getRotation().angle).toBe(0)
  })

  it('an A1 portrait page → A3 landscape page (content scaled to fit, no crop)', async () => {
    const src = await PDFDocument.create()
    const [a1w, a1h] = PageSizes.A1
    markPage(src.addPage([a1w, a1h])) // portrait
    const out = await toA3Landscape(Buffer.from(await src.save()))

    const doc = await PDFDocument.load(out)
    expect(doc.getPageCount()).toBe(1)
    const page = doc.getPage(0)
    expect(page.getWidth()).toBeCloseTo(A3_LANDSCAPE_WIDTH, 2)
    expect(page.getHeight()).toBeCloseTo(A3_LANDSCAPE_HEIGHT, 2)
  })

  it('a 2-page PDF → 2 A3 pages', async () => {
    const src = await PDFDocument.create()
    markPage(src.addPage([595.28, 841.89]))
    markPage(src.addPage([420, 595]))
    const out = await toA3Landscape(Buffer.from(await src.save()))

    const doc = await PDFDocument.load(out)
    expect(doc.getPageCount()).toBe(2)
    for (const page of doc.getPages()) {
      expect(page.getWidth()).toBeCloseTo(A3_LANDSCAPE_WIDTH, 2)
      expect(page.getHeight()).toBeCloseTo(A3_LANDSCAPE_HEIGHT, 2)
      expect(page.getRotation().angle).toBe(0)
    }
  })

  it('a /Rotate 90 page → 1 upright A3 landscape page (the A3 page itself carries no rotation)', async () => {
    const src = await PDFDocument.create()
    const page = src.addPage([400, 700])
    markPage(page)
    page.setRotation(degrees(90))
    const out = await toA3Landscape(Buffer.from(await src.save()))

    const doc = await PDFDocument.load(out)
    expect(doc.getPageCount()).toBe(1)
    const outPage = doc.getPage(0)
    expect(outPage.getWidth()).toBeCloseTo(A3_LANDSCAPE_WIDTH, 2)
    expect(outPage.getHeight()).toBeCloseTo(A3_LANDSCAPE_HEIGHT, 2)
    expect(outPage.getRotation().angle).toBe(0)
  })

  it('more than MAX_DRAWING_PAGES pages → TooManyPagesError', async () => {
    const doc = await PDFDocument.create()
    for (let i = 0; i < MAX_DRAWING_PAGES + 1; i++) doc.addPage([595, 842])
    const buf = Buffer.from(await doc.save())
    await expect(toA3Landscape(buf)).rejects.toBeInstanceOf(TooManyPagesError)
  })

  it('garbage bytes → throws', async () => {
    await expect(toA3Landscape(Buffer.from('not a pdf at all'))).rejects.toThrow()
  })

  // Fix round 1, finding 2.
  it('a page with a non-zero-origin MediaBox and no explicit CropBox is embedded with the MediaBox itself (CropBox falls back to it)', async () => {
    const src = await PDFDocument.create()
    const page = src.addPage([400, 700])
    page.setMediaBox(100, 100, 400, 700)
    markPage(page)
    const out = await toA3Landscape(Buffer.from(await src.save()))

    expect(await embeddedXObjectBBox(out)).toEqual([100, 100, 500, 800])
  })

  it('a CropBox smaller than the MediaBox is used for the embed (and the fit), not the full MediaBox', async () => {
    const src = await PDFDocument.create()
    const page = src.addPage([1000, 1000])
    page.setMediaBox(0, 0, 1000, 1000)
    page.setCropBox(100, 100, 400, 700)
    markPage(page)
    const out = await toA3Landscape(Buffer.from(await src.save()))

    expect(await embeddedXObjectBBox(out)).toEqual([100, 100, 500, 800])
  })

  // Fix round 1, finding 4.
  it('a page with no /Contents at all becomes a blank A3 page instead of failing the whole document', async () => {
    const src = await PDFDocument.create()
    markPage(src.addPage([595.28, 841.89])) // page 0: normal content
    src.addPage([420, 595]) // page 1: nothing drawn on it at all — no /Contents

    const out = await toA3Landscape(Buffer.from(await src.save()))

    const doc = await PDFDocument.load(out)
    expect(doc.getPageCount()).toBe(2)
    for (const page of doc.getPages()) {
      expect(page.getWidth()).toBeCloseTo(A3_LANDSCAPE_WIDTH, 2)
      expect(page.getHeight()).toBeCloseTo(A3_LANDSCAPE_HEIGHT, 2)
      expect(page.getRotation().angle).toBe(0)
    }
  })
})
