import { Injectable, Logger } from '@nestjs/common'
import { Storage } from '@google-cloud/storage'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web'
import { ApsClientService } from './aps-client.service'

// Backup-copy-only — BIM's primary storage stays Autodesk OSS (the
// translation/viewer pipeline is hard-wired to it; the uploaded bytes never
// pass through our own backend in the first place, see aps-client.service.ts's
// createSignedUpload() comment). This can't reuse the `file-storage` module's
// driver abstraction at all, so it owns its own GCS client rather than going
// through FileStorageService. See wiki: features/file-storage-gcs-backup-plan.md.
@Injectable()
export class BimBackupService {
  private readonly logger = new Logger(BimBackupService.name)

  // null when GCS isn't configured (always true for local dev, per the
  // spec — only staging/production get a bucket) — backup silently no-ops
  // rather than erroring, since this must never affect the primary upload.
  private bucket() {
    const bucketName = process.env.FILE_STORAGE_GCS_BUCKET
    if (!bucketName) return null
    const credsJson = process.env.FILE_STORAGE_GCS_CREDENTIALS_JSON
    const storage = credsJson ? new Storage({ credentials: JSON.parse(credsJson) }) : new Storage()
    return storage.bucket(bucketName)
  }

  // Fire-and-forget from BimService.completeUpload() — must never throw out
  // of this method (a backup failure must never fail the primary upload or
  // delay translation), so every failure path here only logs.
  async backup(projectCode: string, major: number, minor: number, objectKey: string, aps: ApsClientService): Promise<void> {
    // `bucket()` itself can throw (e.g. malformed FILE_STORAGE_GCS_CREDENTIALS_JSON)
    // — since this whole method runs un-awaited (fire-and-forget), that throw
    // must be caught here too, not just the awaited calls below, or it
    // becomes an unhandled promise rejection instead of a logged failure.
    try {
      const bucket = this.bucket()
      if (!bucket) return

      const downloadUrl = await aps.getSignedDownloadUrl(objectKey)
      const res = await fetch(downloadUrl)
      if (!res.ok || !res.body) {
        throw new Error(`APS object fetch failed (${res.status})`)
      }
      const key = `bim/${projectCode}/${projectCode}-v${major}.${minor}.ifc`
      // True stream, not buffered — real IFC exports run up to 120MB (see
      // BimUploadModal.tsx's MAX_IFC_SIZE comment) and this backend already
      // runs close to its memory ceiling during BIM element extraction (see
      // bim.service.ts's extractAndPersist comment, ~140MB RSS for a
      // 50k-element model) — a buffered copy on top of that is exactly the
      // failure mode to avoid.
      await pipeline(
        Readable.fromWeb(res.body as unknown as NodeWebReadableStream<Uint8Array>),
        bucket.file(key).createWriteStream({ resumable: false }),
      )
      this.logger.log(`BIM backup complete: ${key}`)
    } catch (err) {
      this.logger.error(
        `BIM backup failed for project ${projectCode} v${major}.${minor} (objectKey=${objectKey})`,
        err instanceof Error ? err.stack : err,
      )
    }
  }
}
