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

  async getObject(key: string): Promise<Buffer> {
    return fs.readFileSync(this.resolvePath(key))
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
    this.pruneEmptyDirs(path.dirname(filePath))
  }

  // An object store has no folders, so neither should this driver keep one that holds nothing:
  // when the last file of a cutting-plan upload goes, its plate/<project>/<zone>/<id>/ folder goes
  // too (2026-11-10). Walks up from the file's folder and stops at the first non-empty one, never
  // touching the storage root itself.
  private pruneEmptyDirs(dir: string) {
    const root = path.resolve(STORAGE_ROOT)
    for (let d = path.resolve(dir); d !== root && d.startsWith(root + path.sep); d = path.dirname(d)) {
      try { fs.rmdirSync(d) } catch { return } // not empty, or already gone
    }
  }

  async putObject(key: string, buffer: Buffer, _contentType?: string): Promise<void> {
    const filePath = this.resolvePath(key)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, buffer)
  }

  async copy(fromKey: string, toKey: string): Promise<void> {
    const to = this.resolvePath(toKey)
    fs.mkdirSync(path.dirname(to), { recursive: true })
    fs.copyFileSync(this.resolvePath(fromKey), to)
  }

  async list(prefix: string): Promise<{ key: string; updatedAt: Date }[]> {
    const root = path.resolve(STORAGE_ROOT)
    const dir = path.resolve(root, prefix)
    if (!dir.startsWith(root + path.sep) || !fs.existsSync(dir)) return []
    return fs.readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter(d => d.isFile())
      .map(d => {
        const file = path.join(d.parentPath, d.name)
        return { key: path.relative(root, file).split(path.sep).join('/'), updatedAt: fs.statSync(file).mtime }
      })
  }
}
