import * as QRCode from 'qrcode'

// Encodes a WO's web-app URL as a scannable PNG for the traveler page.
// Points at the existing /order/wo/:id page (drawing + activities already
// live there) rather than a dedicated mobile endpoint — there is no
// scan-to-complete flow yet, so this targets something real today; that
// flow can be added to the same page later without changing what the QR
// on already-printed packets points to.
//
// errorCorrectionLevel 'H' (~30% of the code can be obscured and still
// decode, vs the default 'M' ~15%) — needed so mo-print-pdf-builder.ts can
// stamp the company logo over the middle of the code without breaking scans
// (2026-09-25: "อยากรู้ว่า qr-code ที่ gen มาจะสามารถแนบ icon ไว้ตรงกลาง
// ได้ไหม").
export async function generateWoQrPng(url: string): Promise<Buffer> {
  return QRCode.toBuffer(url, { type: 'png', margin: 1, width: 200, errorCorrectionLevel: 'H' })
}

// Module count (modules per side, margin excluded) for the SAME url +
// errorCorrectionLevel generateWoQrPng would encode — QRCode.create() is
// synchronous and does no I/O, so this is cheap to call just for the module
// count without generating a second PNG. Lets mo-print-pdf-builder.ts snap
// the center icon's backing square to whole module widths (2026-09-28:
// "ทำให้ผิว qrcode กลืนเข้าไปในกรอบได้ไหม") instead of a size picked purely
// as a fraction of qrSize, which cuts across modules at an arbitrary offset.
export function getWoQrModuleCount(url: string): number {
  return QRCode.create(url, { errorCorrectionLevel: 'H' }).modules.size
}
