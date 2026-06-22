import { apiClient } from './client'

export interface ConsumeFormula {
  id: number
  name: string
  expr: string
  result_unit: string | null
  variables: string[]
  category: string | null
  description: string | null
}

export type FormulaCategory = 'paint' | 'welding' | 'cutting' | 'abrasive' | 'fastener'

export const FORMULA_CATEGORY_LABELS: Record<string, string> = {
  paint:    'Paint & Coating',
  welding:  'Welding',
  cutting:  'Cutting',
  abrasive: 'Abrasive / Surface Prep',
  fastener: 'Fastener & Misc',
}

export const consumeFormulasApi = {
  list(): Promise<ConsumeFormula[]> {
    return apiClient.get('/machines/consume-formulas').then(r => r.data)
  },
  create(dto: Omit<ConsumeFormula, 'id'>): Promise<ConsumeFormula> {
    return apiClient.post('/machines/consume-formulas', dto).then(r => r.data)
  },
  update(id: number, dto: Partial<Omit<ConsumeFormula, 'id'>>): Promise<ConsumeFormula> {
    return apiClient.patch(`/machines/consume-formulas/${id}`, dto).then(r => r.data)
  },
  remove(id: number): Promise<void> {
    return apiClient.delete(`/machines/consume-formulas/${id}`).then(() => undefined)
  },
}
