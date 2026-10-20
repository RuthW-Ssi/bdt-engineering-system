import { PDFDocument, degrees, type PDFPage } from 'pdf-lib'

// Tao's 2026-10-20 rule: every uploaded drawing, whatever its native size, is
// normalised to ONE A3 landscape page before it is stored (see
// .superpowers/sdd/drawing-revision-impl-plan/task-11-brief.md). pdf-lib's own
// PageSizes.A3 is portrait ([841.89, 1190.55]), hence the swap here.
export const A3_LANDSCAPE_WIDTH = 1190.55
export const A3_LANDSCAPE_HEIGHT = 841.89

export interface A3Fit {
  /** uniform scale applied to the RAW (un-rotated) page before rotating/placing it */
  scale: number
  /** x/y passed to PDFPage.drawPage — where the raw page's own (0,0) corner, after
   *  scale+rotate, must land so the final VISUAL content sits centred on the A3 page */
  x: number
  y: number
  /** degrees, pdf-lib's drawPage `rotate` option (its rotateRadians is CCW-positive) */
  rotate: number
}

// Pure geometry — no pdf-lib here — so every scale/centring number the brief
// pins down (e.g. "content scale = 841.89 / 2383.94, centred horizontally")
// can be asserted exactly, and the rotation handling can be verified by
// re-deriving pdf-lib's own transform composition independently (see
// a3-normalize.spec.ts), rather than only checking output page dimensions.
//
// `rotationDeg` is the source page's /Rotate value: per the PDF spec this is
// degrees to rotate the raw content CLOCKWISE when displaying it. pdf-lib's
// `rotate` drawPage option is counter-clockwise-positive (its rotateRadians
// builds a standard CCW rotation matrix), so the angle passed to drawPage
// below is negated.
export function fitToA3Landscape(rawWidth: number, rawHeight: number, rotationDeg: number): A3Fit {
  const rotation = ((Math.round(rotationDeg) % 360) + 360) % 360
  const swapped = rotation === 90 || rotation === 270
  const visualWidth = swapped ? rawHeight : rawWidth
  const visualHeight = swapped ? rawWidth : rawHeight

  // min(), not max(): never crops. Scales UP small pages (e.g. A4) too, same
  // as it scales down larger ones (e.g. A1/A0) — never distorts the aspect
  // ratio since both axes share one factor. An A-series page already in
  // landscape A3's own aspect ratio (A1/A2/A0 landscape) hits this ALMOST
  // exactly — fix round 1, finding 5: pdf-lib's PageSizes constants are each
  // independently rounded to 1/100 pt from ISO216's whole-mm sizes, so two
  // sizes two steps apart (e.g. A1 landscape → A3 landscape) don't share a
  // bit-exact aspect ratio; there's a sub-point margin on one axis, not
  // literally zero on both (see the "almost exactly" test in
  // a3-normalize.spec.ts).
  const scale = Math.min(A3_LANDSCAPE_WIDTH / visualWidth, A3_LANDSCAPE_HEIGHT / visualHeight)
  const scaledRawWidth = rawWidth * scale
  const scaledRawHeight = rawHeight * scale
  const offsetX = (A3_LANDSCAPE_WIDTH - visualWidth * scale) / 2
  const offsetY = (A3_LANDSCAPE_HEIGHT - visualHeight * scale) / 2

  // PDFPage.drawPage emits translate(x,y) ∘ rotate(rotate) ∘ scale(xScale,yScale)
  // as separate `cm` operators, which PDF composes (on the embedded page's own
  // local, un-rotated coordinates) as: scale first, then rotate about the
  // local origin, then translate. Per rotation case below, the raw
  // (0,0)-(scaledRawWidth,scaledRawHeight) box, after that rotation, has its
  // own new bottom-left corner — `x`/`y` here is the translate that moves
  // THAT corner to (offsetX, offsetY), so the resulting visual box is
  // axis-aligned and centred. (Derivation + a corner-transform check live in
  // a3-normalize.spec.ts.)
  switch (rotation) {
    case 90: return { scale, rotate: -90, x: offsetX, y: offsetY + scaledRawWidth }
    case 180: return { scale, rotate: 180, x: offsetX + scaledRawWidth, y: offsetY + scaledRawHeight }
    case 270: return { scale, rotate: -270, x: offsetX + scaledRawHeight, y: offsetY }
    default: return { scale, rotate: 0, x: offsetX, y: offsetY }
  }
}

// Fix round 1, finding 2: embed each page by its own CropBox, not its full
// MediaBox — the CropBox is what a viewer actually shows (and what the fit
// must size against); it falls back to the MediaBox when a page sets no
// CropBox of its own (pdf-lib's own getCropBox() default), so this is a
// strict refinement, not a behaviour change for the common case.
function cropBoundingBox(page: PDFPage) {
  const b = page.getCropBox()
  return { left: b.x, bottom: b.y, right: b.x + b.width, top: b.y + b.height }
}

// Fix round 1, finding 4: a page with no /Contents at all (Tekla sometimes
// emits one as a trailing blank sheet) can't be embedded — pdf-lib's own
// PDFPageEmbedder throws MissingPageContentsEmbeddingError for exactly this.
// That error can't be caught reliably by `instanceof` or even
// `.constructor.name` here, though: pdf-lib 1.17.1's CJS build subclasses
// Error through tslib's ES5 `__extends`, and `Error.call(this, msg)` in V8
// returns a brand-new plain Error rather than initialising `this` — so the
// thrown value ends up a genuine `Error`, not a `MissingPageContentsEmbeddingError`
// (confirmed by probing node_modules/pdf-lib/cjs/core/errors.js directly).
// Worse, the failure doesn't even surface at embedPage() — PDFEmbeddedPage
// embedding is LAZY (deferred to PDFDocument.save()'s embedAll()), so by the
// time it throws it's too late to skip just that one page. Pre-checking
// Contents via the same public accessor PDFPageEmbedder itself uses
// (`page.node.normalizedEntries().Contents`) sidesteps both problems: never
// attempt the embed at all for a contentless page, so the page it would have
// filled is simply left blank. Any OTHER embedding failure still throws
// normally out of embedPage() below (→ 400 upstream, via
// DrawingsService.create's catch).
function hasContents(page: PDFPage): boolean {
  return page.node.normalizedEntries().Contents != null
}

// Normalises every page of the given PDF to one A3-landscape page each,
// honouring /Rotate so content lands upright (the OUTPUT page itself carries
// no /Rotate — the content is physically transformed instead). Throws for
// anything PDFDocument.load rejects: garbage bytes, a truncated/corrupt file,
// or an encrypted PDF (load() throws EncryptedPDFError unless told to ignore
// encryption, which this never does) — the caller (DrawingsService.create)
// turns that into a 400 with the Thai "ไฟล์ PDF เสียหรือเปิดไม่ได้" message.
// Server-side caps (security review F-1, 2026-10-20): the 50 MB limit used to
// live only in the upload modal, and pdf-lib has no page limit of its own.
export const MAX_DRAWING_BYTES = 50_000_000
export const MAX_DRAWING_PAGES = 50

export class TooManyPagesError extends Error {
  constructor(readonly pages: number) {
    super(`PDF has ${pages} pages (max ${MAX_DRAWING_PAGES})`)
  }
}

export async function toA3Landscape(buf: Buffer): Promise<Buffer> {
  const src = await PDFDocument.load(buf)
  if (src.getPageCount() > MAX_DRAWING_PAGES) throw new TooManyPagesError(src.getPageCount())
  const out = await PDFDocument.create()

  for (const srcPage of src.getPages()) {
    const page = out.addPage([A3_LANDSCAPE_WIDTH, A3_LANDSCAPE_HEIGHT])
    if (!hasContents(srcPage)) continue // intentionally blank A3 page

    const embedded = await out.embedPage(srcPage, cropBoundingBox(srcPage))
    const rotation = srcPage.getRotation().angle
    const fit = fitToA3Landscape(embedded.width, embedded.height, rotation)
    page.drawPage(embedded, { x: fit.x, y: fit.y, xScale: fit.scale, yScale: fit.scale, rotate: degrees(fit.rotate) })
  }

  return Buffer.from(await out.save())
}
