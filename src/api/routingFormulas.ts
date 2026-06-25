import { apiClient } from './client'

export interface RoutingFormulaParam {
  code: string
  name: string
  description: string
  formula_expression: string
  inputs_required: string[]
  return_unit: string
}

export const routingFormulaParamsApi = {
  list: async (): Promise<RoutingFormulaParam[]> => {
    const r = await apiClient.get<RoutingFormulaParam[]>('/activities/routing-formula-params')
    return r.data
  },
}
