export interface FileStorageDriver {
  getUploadUrl(
    key: string,
    contentType: string,
  ): Promise<{ url: string; method: 'PUT' | 'POST'; fields?: Record<string, string> }>

  getDownloadUrl(key: string): Promise<string>

  getMetadata(
    key: string,
  ): Promise<{ size: number; contentType: string; checksumSha256?: string } | null>

  delete(key: string): Promise<void>
}
