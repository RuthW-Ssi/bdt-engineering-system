import { apiClient } from './client'

export interface Drawing {
  id: number
  product_id: number
  file_key: string
  file_name: string
  mime_type: string | null
  uploaded_by_id: number
  create_date: string
}

export async function getDrawingsByProduct(productId: number): Promise<Drawing[]> {
  return (await apiClient.get('/drawings', { params: { product_id: productId } })).data
}

export async function uploadDrawing(productId: number, file: File): Promise<Drawing> {
  // Sanitize the filename portion — the backend's CreateDrawingDto validates
  // file_key against /^drawings\/[^/\\]+$/ (Task 3's path-traversal fix), so
  // any '/' or '\' in the original filename must not survive into the key.
  const safeName = file.name.replace(/[/\\]/g, '_')
  const key = `drawings/${crypto.randomUUID()}-${safeName}`
  const form = new FormData()
  form.append('file', file)
  await apiClient.post('/file-storage/upload', form, {
    params: { key },
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return (
    await apiClient.post('/drawings', {
      product_id: productId,
      file_key: key,
      file_name: file.name,
      mime_type: file.type || undefined,
    })
  ).data
}

export async function deleteDrawing(id: number): Promise<void> {
  await apiClient.delete(`/drawings/${id}`)
}

// GET /file-storage/download is JWT-guarded — a bare <a href> can't attach
// the Authorization header, so this fetches the file as an authenticated
// blob and triggers a synthetic download, matching the exact pattern
// ProjectProgress.tsx's handleExport already uses for the same problem
// (see backend/../file-storage.controller.ts's download() + apiClient's
// request interceptor for why: the endpoint requires a Bearer token).
export async function downloadDrawing(fileKey: string, fileName: string): Promise<void> {
  const res = await apiClient.get('/file-storage/download', {
    params: { key: fileKey },
    responseType: 'blob',
  })
  const url = URL.createObjectURL(res.data as Blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}
