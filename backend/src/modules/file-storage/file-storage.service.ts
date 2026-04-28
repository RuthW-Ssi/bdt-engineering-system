import { Injectable, OnModuleInit } from '@nestjs/common'
import * as fs from 'fs'
import * as path from 'path'
import { FileStorageDriver } from './interfaces/file-storage.interface'
import { LocalFileStorageDriver } from './drivers/local.driver'

const STORAGE_ROOT = process.env.FILE_STORAGE_LOCAL_PATH || './storage'

@Injectable()
export class FileStorageService implements OnModuleInit {
  private readonly driver: FileStorageDriver

  constructor() {
    const driverType = process.env.FILE_STORAGE_DRIVER ?? 'local'
    if (driverType === 'local') {
      this.driver = new LocalFileStorageDriver()
    } else {
      this.driver = new LocalFileStorageDriver()
    }
  }

  onModuleInit() {
    const drawingsDir = path.join(STORAGE_ROOT, 'drawings')
    if (!fs.existsSync(drawingsDir)) {
      fs.mkdirSync(drawingsDir, { recursive: true })
    }
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

  resolveLocalPath(key: string): string {
    return path.resolve(path.join(STORAGE_ROOT, key))
  }

  storageRoot(): string {
    return path.resolve(STORAGE_ROOT)
  }
}
