import { BadRequestException } from '@nestjs/common'
import { FileStorageController } from './file-storage.controller'

function makeSvc() {
  return { getUploadUrl: jest.fn().mockResolvedValue({ url: 'https://signed', method: 'PUT' }) }
}

describe('FileStorageController', () => {
  describe('presignedUpload', () => {
    it('accepts application/pdf', async () => {
      const svc = makeSvc()
      const ctrl = new FileStorageController(svc as any)

      const result = await ctrl.presignedUpload({ key: 'drawings/x/v1/a.pdf', contentType: 'application/pdf' })

      expect(svc.getUploadUrl).toHaveBeenCalledWith('drawings/x/v1/a.pdf', 'application/pdf')
      expect(result.url).toBe('https://signed')
    })

    it('accepts application/octet-stream (the .dwg fallback content type)', async () => {
      const svc = makeSvc()
      const ctrl = new FileStorageController(svc as any)

      await ctrl.presignedUpload({ key: 'drawings/x/v1/a.dwg', contentType: 'application/octet-stream' })

      expect(svc.getUploadUrl).toHaveBeenCalledWith('drawings/x/v1/a.dwg', 'application/octet-stream')
    })

    // Security finding F-001 (docs/security/findings/2026-09-14-drawing-pdf-upload.md):
    // an unvalidated client-supplied contentType round-trips through GCS
    // metadata and is served back verbatim on download. Since drawings are
    // now previewed in-page via an <iframe src="blob:...">, a spoofed
    // text/html contentType made the resulting blob same-origin HTML —
    // stored XSS. Root cause fix: only ever accept the content types this
    // endpoint's one real caller (drawing upload) legitimately sends.
    it('rejects text/html — the content-type spoofing vector behind security finding F-001', async () => {
      const svc = makeSvc()
      const ctrl = new FileStorageController(svc as any)

      await expect(
        ctrl.presignedUpload({ key: 'drawings/x/v1/evil.pdf', contentType: 'text/html' }),
      ).rejects.toThrow(BadRequestException)
      expect(svc.getUploadUrl).not.toHaveBeenCalled()
    })

    it('rejects image/svg+xml (SVG can carry embedded <script>, same class of risk)', async () => {
      const svc = makeSvc()
      const ctrl = new FileStorageController(svc as any)

      await expect(
        ctrl.presignedUpload({ key: 'drawings/x/v1/evil.svg', contentType: 'image/svg+xml' }),
      ).rejects.toThrow(BadRequestException)
    })

    it('still requires key and contentType (pre-existing behavior, unchanged)', async () => {
      const svc = makeSvc()
      const ctrl = new FileStorageController(svc as any)

      await expect(ctrl.presignedUpload({ key: '', contentType: 'application/pdf' })).rejects.toThrow(BadRequestException)
      await expect(ctrl.presignedUpload({ key: 'k', contentType: '' })).rejects.toThrow(BadRequestException)
    })
  })
})
