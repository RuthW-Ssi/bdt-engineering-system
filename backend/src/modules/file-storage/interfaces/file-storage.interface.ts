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

  // For callers that already have the file fully buffered server-side
  // (e.g. bom-upload's multer memoryStorage) and just need it written —
  // doesn't fit the other methods' presigned-URL/browser-uploads-directly
  // model.
  putObject(key: string, buffer: Buffer, contentType?: string): Promise<void>
}
