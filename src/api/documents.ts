import { apiClient } from './client'

export type DocumentAudience = 'employee' | 'customer' | 'all'

export interface DocumentItem {
  id: number
  title: string
  category: string
  audience: DocumentAudience
  version: string
  description: string | null
  file_name: string
  file_size: number
  // Stripped for customer accounts (no dates for customers)
  write_date?: string
  uploaded_by?: { id: number; name: string }
}

export interface DocumentFields {
  title: string
  version: string
  category: string
  audience: DocumentAudience
  description: string
}

export async function listDocuments(): Promise<DocumentItem[]> {
  return (await apiClient.get('/documents')).data
}

function toForm(fields: Partial<DocumentFields>, file?: File | null): FormData {
  const form = new FormData()
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) form.append(k, v)
  if (file) form.append('file', file)
  return form
}

export async function createDocument(fields: DocumentFields, file: File): Promise<DocumentItem> {
  return (await apiClient.post('/documents', toForm(fields, file), { headers: { 'Content-Type': 'multipart/form-data' } })).data
}

export async function updateDocument(id: number, fields: Partial<DocumentFields>, file?: File | null): Promise<DocumentItem> {
  return (await apiClient.patch(`/documents/${id}`, toForm(fields, file), { headers: { 'Content-Type': 'multipart/form-data' } })).data
}

export async function deleteDocument(id: number): Promise<void> {
  await apiClient.delete(`/documents/${id}`)
}

// JWT-guarded, so fetched as a blob (a bare <a href> can't send the token).
// Re-typed to application/pdf whatever the response says — same XSS guard as
// the drawing preview (useDrawingPdfUrl).
async function fetchDocumentPdf(id: number): Promise<string> {
  const res = await apiClient.get(`/documents/${id}/file`, { responseType: 'blob' })
  return URL.createObjectURL(new Blob([res.data as Blob], { type: 'application/pdf' }))
}

// The tab is opened synchronously, before the await — opened afterwards it
// counts as a popup and phones/browsers block it.
export async function openDocument(id: number): Promise<void> {
  const tab = window.open('', '_blank')
  try {
    const url = await fetchDocumentPdf(id)
    if (tab) tab.location.href = url
    else window.location.href = url
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (e) {
    tab?.close()
    throw e
  }
}

export async function downloadDocument(doc: Pick<DocumentItem, 'id' | 'file_name'>): Promise<void> {
  const url = await fetchDocumentPdf(doc.id)
  const a = document.createElement('a')
  a.href = url
  a.download = doc.file_name
  a.click()
  URL.revokeObjectURL(url)
}
