import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { ApsClientService } from '../aps/aps-client.service'
import { FileStorageService } from '../file-storage/file-storage.service'

export interface DrawingApsStatusResult {
  id: number
  status: string | null
  error: string | null
}

// Pushes an already-GCS-uploaded .dwg file into APS OSS purely to power an
// in-browser 2D preview — GCS stays the canonical store (see wiki:
// features/drawing-aps-preview-plan.md). Mirrors BimBackupService's
// streaming-copy pattern but in the opposite direction (GCS -> APS instead
// of APS -> GCS), and mirrors BimService's translate/poll/viewer-token
// pattern but scoped to the much simpler 2D-preview-only use case — no
// element extraction, no bim_element-equivalent table.
@Injectable()
export class DrawingApsService {
  private readonly logger = new Logger(DrawingApsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly aps: ApsClientService,
    private readonly fileStorage: FileStorageService,
  ) {}

  // Fire-and-forget from DrawingsService.create() — must never throw out of
  // this method (a preview-generation failure must never fail the primary
  // GCS upload), so every failure path here only logs + persists a "failed"
  // status the frontend can show instead of leaving the row stuck silently.
  async pushToAps(drawingId: number, fileKey: string, fileName: string): Promise<void> {
    try {
      await this.prisma.drawing.update({
        where: { id: drawingId },
        data: { aps_translation_status: 'processing', aps_translation_error: null },
      })

      await this.aps.ensureBucket(this.aps.drawingBucketKey)

      // The file already exists in GCS (the primary upload already
      // succeeded) — fetch it back out via the same signed-URL mechanism
      // the download endpoint uses, not a second driver-specific code path.
      const downloadUrl = await this.fileStorage.getDownloadUrl(fileKey)
      const fetched = await fetch(downloadUrl)
      if (!fetched.ok || !fetched.body) {
        throw new Error(`GCS object fetch failed (${fetched.status})`)
      }

      const objectKey = `${Date.now()}-${fileName}`.replace(/[^\w.\-]/g, '_')
      const { uploadKey, url } = await this.aps.createSignedUpload(objectKey, this.aps.drawingBucketKey)

      // Buffered, not streamed. A streaming request body (`body: fetched.body`
      // + `duplex: 'half'`) has no known length up front, so Node's fetch
      // sends it as `Transfer-Encoding: chunked` — confirmed live 2026-08-26
      // that APS's signed S3-style upload URL rejects that outright with a
      // 501, unlike BIM's browser-direct PUT (a browser sends a File/Blob
      // with a definite Content-Length, never chunked). Drawing files are
      // capped at 50MB (DrawingUploadModal.tsx's MAX_DRAWING_SIZE) — small
      // enough to buffer safely, unlike BIM's IFC exports (up to 120MB),
      // which is why BimBackupService's GCS-direction copy stays streamed.
      const buffer = Buffer.from(await fetched.arrayBuffer())
      const putRes = await fetch(url, { method: 'PUT', body: buffer })
      if (!putRes.ok) {
        throw new Error(`APS object upload failed (${putRes.status})`)
      }

      const { urn } = await this.aps.completeUpload(objectKey, uploadKey, this.aps.drawingBucketKey)
      await this.aps.translate(urn, ['2d'])

      await this.prisma.drawing.update({
        where: { id: drawingId },
        data: { aps_urn: urn },
      })
    } catch (err) {
      this.logger.error(
        `Drawing APS preview push failed for drawing ${drawingId} (${fileKey})`,
        err instanceof Error ? err.stack : err,
      )
      // A DB failure while recording the earlier DB failure must not throw
      // out of a fire-and-forget path either.
      await this.prisma.drawing
        .update({
          where: { id: drawingId },
          data: {
            aps_translation_status: 'failed',
            aps_translation_error: err instanceof Error ? err.message : 'APS preview generation failed',
          },
        })
        .catch(() => {})
    }
  }

  // Called by the frontend's poll loop while aps_translation_status is
  // "processing" — mirrors BimService.checkStatus()'s manifest-polling
  // shape, without the element-extraction step (Drawing has no
  // bim_element-equivalent to populate).
  async checkStatus(drawingId: number): Promise<DrawingApsStatusResult> {
    const drawing = await this.prisma.drawing.findUniqueOrThrow({ where: { id: drawingId } })
    if (drawing.aps_translation_status === 'complete' || drawing.aps_translation_status === 'failed') {
      return { id: drawing.id, status: drawing.aps_translation_status, error: drawing.aps_translation_error }
    }
    if (!drawing.aps_urn) {
      // pushToAps() hasn't reached completeUpload() yet (still fetching from
      // GCS / uploading to APS) — report the row's current state rather than
      // erroring on a urn that doesn't exist yet.
      return { id: drawing.id, status: drawing.aps_translation_status, error: null }
    }

    const manifest = await this.aps.getManifest(drawing.aps_urn)
    const derivative = manifest.derivatives?.[0]

    if (manifest.status === 'success' || derivative?.status === 'success') {
      await this.prisma.drawing.update({ where: { id: drawingId }, data: { aps_translation_status: 'complete' } })
      return { id: drawing.id, status: 'complete', error: null }
    }

    if (manifest.status === 'failed' || manifest.status === 'timeout' || derivative?.status === 'failed') {
      const message =
        manifest.derivatives?.flatMap(d => d.messages ?? []).map(m => m.message).join('; ')
        || 'Model Derivative translation failed'
      await this.prisma.drawing.update({
        where: { id: drawingId },
        data: { aps_translation_status: 'failed', aps_translation_error: message },
      })
      return { id: drawing.id, status: 'failed', error: message }
    }

    return { id: drawing.id, status: 'processing', error: null }
  }

  async getViewerToken(drawingId: number) {
    const drawing = await this.prisma.drawing.findUniqueOrThrow({ where: { id: drawingId } })
    const token = await this.aps.getViewerAccessToken()
    return { urn: drawing.aps_urn, access_token: token }
  }
}
