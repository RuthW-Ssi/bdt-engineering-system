import { apiClient } from './client'

export interface PresignedUpload {
  url: string
  method: 'PUT' | 'POST'
}

export async function getPresignedUpload(key: string, contentType: string): Promise<PresignedUpload> {
  return (
    await apiClient.post('/file-storage/presigned-upload', { key, contentType })
  ).data
}

// Two shapes, driver-dependent:
// - `PUT` (gcs driver): the driver-returned URL points at storage.googleapis.com
//   with the signature baked in — must be a bare `fetch`, NOT the shared
//   `apiClient` axios instance, which has a same-origin baseURL and a Bearer-
//   token interceptor that would target the wrong host / send an unwanted
//   auth header to Google.
// - `POST` (local driver): mirrors this app's existing established fix for
//   drawings' original upload flow — the driver's returned URL is absolute
//   (`API_PUBLIC_URL`-based) and POSTing to it directly risks a host/CORS
//   mismatch in any deployment where the public frontend origin differs from
//   `API_PUBLIC_URL`. Goes through the same relative-baseURL `apiClient`
//   every other request uses instead, ignoring the driver's `url` field.
export async function uploadViaPresignedUrl(
  presigned: PresignedUpload,
  key: string,
  file: File,
): Promise<void> {
  if (presigned.method === 'PUT') {
    const res = await fetch(presigned.url, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
    })
    if (!res.ok) throw new Error(`Upload to storage failed (${res.status})`)
    return
  }

  const form = new FormData()
  form.append('file', file)
  await apiClient.post('/file-storage/upload', form, {
    params: { key },
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}
