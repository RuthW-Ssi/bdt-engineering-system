import { apiClient } from './client'

// ── Types ──────────────────────────────────────────────────────

export interface WorkcenterDTO {
  id: number
  code: string
  name: string
  machine: string | null
  sequence: number
  active: boolean
  oee_target: number
  availability: number
  performance: number
  quality: number
  labor_mix: { operator: number; skilled: number; group_head: number }
  labor_cost_per_min: number
  electricity_cost_per_min: number
  consumable_cost_per_min: number
  overhead_cost_per_min: number
  capacity_per_period: { kg_per_month?: number; m_per_month?: number; pc_per_month?: number } | null
}

interface StepActivityDTO {
  id: number
  routing_workcenter_id: number
  activity_template_id: number
  sequence: number
  per_minute_override: number | null
  std_measure_override: number | null
  manpower_override: number | null
  last_cycle_time_min: number | null
  last_input_snapshot: { inputValue: number; formulaExpr: string } | null
  activity_template: {
    id: number
    op_code: string
    description: string
    per_minute: number
    std_measure: number
    unit: string
    formula_param_code: string
    manpower: number
  }
}

export interface RoutingOpDTO {
  id: number
  product_id: number | null
  routing_template_id: number | null
  routing_template: string | null
  op_code: string
  name: string
  sequence: number
  state: string
  time_cycle: number
  last_computed_at: string | null
  workcenter: { id: number; code: string; name: string }
  activities: StepActivityDTO[]
}

export interface CycleTimeResult {
  product_id: number
  operations: {
    routing_workcenter_id: number
    op_code: string
    workcenter_code: string
    workcenter_name: string
    activities: {
      activity_template_id: number
      description: string
      formula_param_code: string
      formula_expression: string
      input_value: number
      cycle_time_min: number
      manpower: number
      per_minute: number
      std_measure: number
    }[]
    total_cycle_time_min: number
  }[]
  total_cycle_time_min: number
  computed_at: string
}

// ── Routing API ────────────────────────────────────────────────

export const getRouting = (productCode: string): Promise<RoutingOpDTO[]> =>
  apiClient.get(`/products/${productCode}/routing`).then(r => r.data)

export const createRouting = (
  productCode: string,
  body: { from_template?: string; operations?: { op_code: string; workcenter_id: number; name?: string; sequence?: number }[] },
): Promise<RoutingOpDTO[]> =>
  apiClient.post(`/products/${productCode}/routing`, body).then(r => r.data)

export const activateRouting = (productCode: string): Promise<RoutingOpDTO[]> =>
  apiClient.post(`/products/${productCode}/routing/action_activate`).then(r => r.data)

export const obsoleteRouting = (productCode: string): Promise<RoutingOpDTO[]> =>
  apiClient.post(`/products/${productCode}/routing/action_obsolete`).then(r => r.data)

export const recomputeCycleTime = (productCode: string): Promise<CycleTimeResult> =>
  apiClient.post(`/products/${productCode}/routing/recompute?force=true`).then(r => r.data)

export const deleteRoutingOp = (productCode: string, opId: number): Promise<{ deleted: boolean }> =>
  apiClient.delete(`/products/${productCode}/routing/operations/${opId}`).then(r => r.data)

export const reorderRoutingOps = (
  productCode: string,
  items: { id: number; sequence: number }[],
): Promise<RoutingOpDTO[]> =>
  apiClient.post(`/products/${productCode}/routing/reorder`, { items }).then(r => r.data)

// ── Workcenters API ────────────────────────────────────────────

export const getWorkcenters = (active?: boolean): Promise<WorkcenterDTO[]> =>
  apiClient.get('/workcenters', { params: active === undefined ? {} : { active } }).then(r => r.data)

export const getWorkcenter = (id: number): Promise<WorkcenterDTO> =>
  apiClient.get(`/workcenters/${id}`).then(r => r.data)

export const updateWorkcenter = (id: number, body: Partial<WorkcenterDTO>): Promise<WorkcenterDTO> =>
  apiClient.patch(`/workcenters/${id}`, body).then(r => r.data)

export const createWorkcenter = (body: { code: string; name: string } & Partial<WorkcenterDTO>): Promise<WorkcenterDTO> =>
  apiClient.post('/workcenters', body).then(r => r.data)

// ── Routing Templates ─────────────────────────────────────────

export interface RoutingTemplateDTO {
  id: number
  code: string
  name: string
  state: string
  active: boolean
  applies_to_product_type: string | null
}

export const getRoutingTemplates = (): Promise<RoutingTemplateDTO[]> =>
  apiClient.get('/routing-templates').then(r => r.data)

// ── Sprint 4.2: Binding Rules ──────────────────────────────────

export interface BindingRuleDTO {
  id: number
  priority: number
  description: string | null
  match_product_type: string | null
  match_mark_prefix: string | null
  match_categ_id: number | null
  routing_template_id: number
  routing_template: { id: number; code: string; name: string }
  active: boolean
}

export const getBindingRules = (): Promise<BindingRuleDTO[]> =>
  apiClient.get('/routing-template-binding-rules').then(r => r.data)

export const createBindingRule = (body: Partial<BindingRuleDTO> & { routing_template_id: number; priority: number }): Promise<BindingRuleDTO> =>
  apiClient.post('/routing-template-binding-rules', body).then(r => r.data)

export const deleteBindingRule = (id: number): Promise<void> =>
  apiClient.delete(`/routing-template-binding-rules/${id}`).then(r => r.data)
