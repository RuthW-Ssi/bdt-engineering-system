import { generateWoQrPng } from './mo-print-qr'

describe('generateWoQrPng', () => {
  it('returns PNG-encoded bytes (starts with the PNG signature)', async () => {
    const bytes = await generateWoQrPng('http://localhost:5173/order/wo/1398')

    // PNG files always start with this 8-byte signature — cheap way to
    // confirm we actually get a PNG buffer back, without needing a QR
    // decoder just to test a thin wrapper over a well-tested library.
    expect(Array.from(bytes.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  })

  it('produces different bytes for different URLs', async () => {
    const a = await generateWoQrPng('http://localhost:5173/order/wo/1')
    const b = await generateWoQrPng('http://localhost:5173/order/wo/2')

    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false)
  })
})
