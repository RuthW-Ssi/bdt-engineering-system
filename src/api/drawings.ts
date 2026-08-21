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
  const key = `drawings/${crypto.randomUUID()}-${file.name}`
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

export function drawingDownloadUrl(fileKey: string): string {
  return `/api/v1/file-storage/download?key=${encodeURIComponent(fileKey)}`
}
