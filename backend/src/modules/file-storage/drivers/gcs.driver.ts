import { Bucket, Storage } from '@google-cloud/storage'
import { FileStorageDriver } from '../interfaces/file-storage.interface'

const SIGNED_URL_EXPIRY_MS = 15 * 60 * 1000

export class GcsFileStorageDriver implements FileStorageDriver {
  private readonly bucket: Bucket

  constructor() {
    const bucketName = process.env.FILE_STORAGE_GCS_BUCKET
    if (!bucketName) {
      throw new Error('FILE_STORAGE_GCS_BUCKET is required when FILE_STORAGE_DRIVER=gcs')
    }
    const credsJson = process.env.FILE_STORAGE_GCS_CREDENTIALS_JSON
    const storage = credsJson
      ? new Storage({ credentials: JSON.parse(credsJson) })
      : new Storage() // falls back to ADC (e.g. Cloud Run's attached service account)
    this.bucket = storage.bucket(bucketName)
  }

  async getUploadUrl(key: string, contentType: string) {
    const [url] = await this.bucket.file(key).getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + SIGNED_URL_EXPIRY_MS,
      contentType,
    })
    return { url, method: 'PUT' as const }
  }

  async getDownloadUrl(key: string): Promise<string> {
    const [url] = await this.bucket.file(key).getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + SIGNED_URL_EXPIRY_MS,
    })
    return url
  }

  async getMetadata(key: string) {
    try {
      const [meta] = await this.bucket.file(key).getMetadata()
      return {
        size: Number(meta.size),
        contentType: meta.contentType ?? 'application/octet-stream',
        checksumSha256: undefined,
      }
    } catch {
      return null
    }
  }

  async delete(key: string): Promise<void> {
    await this.bucket.file(key).delete({ ignoreNotFound: true })
  }

  async putObject(key: string, buffer: Buffer, contentType?: string): Promise<void> {
    // resumable: false — callers already hold the full buffer in memory
    // (BOM xlsx / Drawing files, both well under GCS's resumable threshold),
    // a resumable session is unneeded overhead here.
    await this.bucket.file(key).save(buffer, { contentType, resumable: false })
  }
}
