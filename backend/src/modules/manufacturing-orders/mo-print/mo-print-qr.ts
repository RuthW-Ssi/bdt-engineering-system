import * as QRCode from 'qrcode'

// Encodes a WO's web-app URL as a scannable PNG for the traveler page.
// Points at the existing /order/wo/:id page (drawing + activities already
// live there) rather than a dedicated mobile endpoint — there is no
// scan-to-complete flow yet, so this targets something real today; that
// flow can be added to the same page later without changing what the QR
// on already-printed packets points to.
export async function generateWoQrPng(url: string): Promise<Buffer> {
  return QRCode.toBuffer(url, { type: 'png', margin: 1, width: 200 })
}
