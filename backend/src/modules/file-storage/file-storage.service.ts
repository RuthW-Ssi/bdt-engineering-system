import { Injectable, OnModuleInit } from '@nestjs/common'
import * as fs from 'fs'
import * as path from 'path'
import { FileStorageDriver } from './interfaces/file-storage.interface'
import { LocalFileStorageDriver } from './drivers/local.driver'
import { GcsFileStorageDriver } from './drivers/gcs.driver'

const STORAGE_ROOT = process.env.FILE_STORAGE_LOCAL_PATH || './storage'

@Injectable()
export class FileStorageService implements OnModuleInit {
  private readonly driver: FileStorageDriver
  private readonly type: 'local' | 'gcs'

  constructor() {
    this.type = process.env.FILE_STORAGE_DRIVER === 'gcs' ? 'gcs' : 'local'
    this.driver = this.type === 'gcs' ? new GcsFileStorageDriver() : new LocalFileStorageDriver()
  }

  onModuleInit() {
    // Local-disk-only bootstrap — meaningless (and would needlessly touch
    // Cloud Run's ephemeral disk) once GCS is primary.
    if (this.type !== 'local') return
    const drawingsDir = path.join(STORAGE_ROOT, 'drawings')
    if (!fs.existsSync(drawingsDir)) {
      fs.mkdirSync(drawingsDir, { recursive: true })
    }
  }

  driverType(): 'local' | 'gcs' {
    return this.type
  }

  getUploadUrl(key: string, contentType: string) {
    return this.driver.getUploadUrl(key, contentType)
  }

  getDownloadUrl(key: string) {
    return this.driver.getDownloadUrl(key)
  }

  getMetadata(key: string) {
    return this.driver.getMetadata(key)
  }

  delete(key: string) {
    return this.driver.delete(key)
  }

  putObject(key: string, buffer: Buffer, contentType?: string) {
    return this.driver.putObject(key, buffer, contentType)
  }

  resolveLocalPath(key: string): string {
    return path.resolve(path.join(STORAGE_ROOT, key))
  }

  storageRoot(): string {
    return path.resolve(STORAGE_ROOT)
  }
}
