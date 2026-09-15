export interface FileStorageDriver {
  getUploadUrl(
    key: string,
    contentType: string,
  ): Promise<{ url: string; method: 'PUT' | 'POST'; fields?: Record<string, string> }>

  getDownloadUrl(key: string): Promise<string>

  // For server-side callers that need the actual bytes (e.g. merging a
  // drawing PDF into a generated document) rather than a browser-facing
  // URL — getDownloadUrl's local-driver implementation points back at this
  // same JWT-guarded API, which a server-to-server fetch can't satisfy, and
  // even the GCS driver's presigned URL is unnecessary round-tripping when
  // the caller already runs inside this process.
  getObject(key: string): Promise<Buffer>

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
