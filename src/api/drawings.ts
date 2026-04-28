import { apiClient } from './client'

export interface DrawingRevisionDTO {
  id: number
  drawing_id: number
  revision: string
  sequence: number
  change_summary: string | null
  file_url: string
  file_size_bytes: string | null
  file_mime_type: string | null
  is_current: boolean
  approved_date: string | null
  approver: { id: number; name: string } | null
  create_user: { id: number; name: string }
  create_date: string
}

export interface DrawingDTO {
  id: number
  drawing_number: string
  drawing_type: 'master' | 'project'
  state: string
  cad_source: string
  current_revision: string | null
  product: { id: number; product_code: string; name: string }
  project: { id: number; project_code: string; name: string } | null
  revisions: DrawingRevisionDTO[]
  create_user: { id: number; name: string } | null
  write_user: { id: number; name: string } | null
  create_date: string
  write_date: string
}

export async function getDrawingsByProduct(productCode: string): Promise<DrawingDTO[]> {
  const res = await apiClient.get('/drawings', { params: { product_code: productCode } })
  return res.data
}

export async function getDrawing(id: number): Promise<DrawingDTO> {
  const res = await apiClient.get(`/drawings/${id}`)
  return res.data
}
