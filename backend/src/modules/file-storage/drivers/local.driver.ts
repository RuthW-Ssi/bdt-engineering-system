import * as fs from 'fs'
import * as path from 'path'
import { FileStorageDriver } from '../interfaces/file-storage.interface'

const STORAGE_ROOT = process.env.FILE_STORAGE_LOCAL_PATH || './storage'
const API_PUBLIC_URL = process.env.API_PUBLIC_URL || 'http://localhost:3000'

export class LocalFileStorageDriver implements FileStorageDriver {
  private resolvePath(key: string): string {
    return path.join(STORAGE_ROOT, key)
  }

  async getUploadUrl(key: string, _contentType: string) {
    const url = `${API_PUBLIC_URL}/api/v1/file-storage/upload?key=${encodeURIComponent(key)}`
    return { url, method: 'POST' as const }
  }

  async getDownloadUrl(key: string): Promise<string> {
    return `${API_PUBLIC_URL}/api/v1/file-storage/download?key=${encodeURIComponent(key)}`
  }

  async getMetadata(key: string) {
    const filePath = this.resolvePath(key)
    try {
      const stat = fs.statSync(filePath)
      return {
        size: stat.size,
        contentType: 'application/octet-stream',
      }
    } catch {
      return null
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = this.resolvePath(key)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  }
}
