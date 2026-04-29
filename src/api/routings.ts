import { apiClient } from './client'

// ── Types ──────────────────────────────────────────────────────

export interface WorkcenterDTO {
  id: number
  code: string
  name: string
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

export interface FormulaParamDTO {
  code: string
  description: string
  formula_expression: string
  inputs_required: string[]
  return_unit: string
}

export interface ActivityTemplateDTO {
  id: number
  op_code: string
  description: string
  sequence: number
  per_minute: number
  std_measure: number
  unit: string
  manpower: number
  formula_param_code: string
  formula_param: FormulaParamDTO
  workcenter: { id: number; code: string; name: string }
}

export interface StepActivityDTO {
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

export interface StdCostResult {
  product_id: number
  cost_per_op: {
    workcenter_code: string
    workcenter_name: string
    cycle_time_min: number
    labor_cost: number
    electricity_cost: number
    consumable_cost: number
    overhead_cost: number
    total_cost: number
  }[]
  total_cycle_time_min: number
  total_production_cost: number
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

export const updateActivityOverride = (
  productCode: string,
  opId: number,
  stepId: number,
  body: { per_minute_override?: number | null; std_measure_override?: number | null; manpower_override?: number | null },
): Promise<StepActivityDTO> =>
  apiClient.patch(`/products/${productCode}/routing/operations/${opId}/activities/${stepId}`, body).then(r => r.data)

export const deleteStepActivity = (
  productCode: string,
  opId: number,
  stepId: number,
): Promise<{ deleted: boolean }> =>
  apiClient.delete(`/products/${productCode}/routing/operations/${opId}/activities/${stepId}`).then(r => r.data)

export const getStdCost = (productCode: string): Promise<StdCostResult> =>
  apiClient.get(`/products/${productCode}/std-cost`).then(r => r.data)

export const recomputeStdCost = (productCode: string): Promise<StdCostResult> =>
  apiClient.post(`/products/${productCode}/std-cost/recompute`).then(r => r.data)

// ── Workcenters API ────────────────────────────────────────────

export const getWorkcenters = (): Promise<WorkcenterDTO[]> =>
  apiClient.get('/workcenters').then(r => r.data)

export const getWorkcenter = (id: number): Promise<WorkcenterDTO> =>
  apiClient.get(`/workcenters/${id}`).then(r => r.data)

export const updateWorkcenter = (id: number, body: Partial<WorkcenterDTO>): Promise<WorkcenterDTO> =>
  apiClient.patch(`/workcenters/${id}`, body).then(r => r.data)

// ── Activity Templates API ─────────────────────────────────────

export const getActivityTemplates = (params?: {
  op_code?: string
  workcenter_id?: number
  page?: number
  limit?: number
}): Promise<{ items: ActivityTemplateDTO[]; meta: { total: number; page: number; limit: number; pages: number } }> =>
  apiClient.get('/activity-templates', { params }).then(r => r.data)

export const previewTemplate = (
  id: number,
  attributes: Record<string, number>,
): Promise<{
  activity_template_id: number
  description: string
  formula_expression: string
  input_attrs: Record<string, number>
  input_value: number
  std_measure: number
  per_minute: number
  manpower: number
  cycle_time_min: number
}> => apiClient.post(`/activity-templates/${id}/preview`, { attributes }).then(r => r.data)

// ── Formula Params API ─────────────────────────────────────────

export const getFormulaParams = (): Promise<FormulaParamDTO[]> =>
  apiClient.get('/formula-params').then(r => r.data)

// ── Sprint 4.2: Routing Overrides ─────────────────────────────

export interface ProductRoutingOverrideDTO {
  id: number
  product_id: number
  activity_template_id: number
  override_per_minute: number | null
  override_std_measure: number | null
  override_manpower: number | null
  override_workcenter_id: number | null
  reason: string | null
  activity_template: { id: number; op_code: string; description: string }
}

export const getRoutingOverrides = (productCode: string): Promise<ProductRoutingOverrideDTO[]> =>
  apiClient.get(`/products/${productCode}/routing-overrides`).then(r => r.data)

export const upsertRoutingOverride = (
  productCode: string,
  activityTemplateId: number,
  body: {
    override_per_minute?: number | null
    override_std_measure?: number | null
    override_manpower?: number | null
    reason?: string
  },
): Promise<ProductRoutingOverrideDTO> =>
  apiClient.post(`/products/${productCode}/routing-overrides/${activityTemplateId}`, body).then(r => r.data)

export const deleteRoutingOverride = (productCode: string, activityTemplateId: number): Promise<void> =>
  apiClient.delete(`/products/${productCode}/routing-overrides/${activityTemplateId}`).then(r => r.data)

// ── Sprint 4.2: Custom Routing ─────────────────────────────────

export interface CustomRoutingActivityDTO {
  id: number
  op_id: number
  sequence: number
  description: string
  per_minute: number
  formula_param_code: string
  std_measure: number
  unit: string
  manpower: number
  workcenter_id: number
}

export interface CustomRoutingOpDTO {
  id: number
  custom_routing_id: number
  sequence: number
  name: string
  op_code: string
  workcenter: { id: number; code: string; name: string }
  activities: CustomRoutingActivityDTO[]
}

export interface CustomRoutingDTO {
  id: number
  product_id: number
  name: string
  state: string
  version: string
  cloned_from_template_id: number | null
  ops: CustomRoutingOpDTO[]
}

export const getCustomRouting = (productCode: string): Promise<CustomRoutingDTO | null> =>
  apiClient.get(`/products/${productCode}/custom-routing`).then(r => r.data)

export const createCustomRouting = (
  productCode: string,
  body: { from_template_id?: number },
): Promise<CustomRoutingDTO> =>
  apiClient.post(`/products/${productCode}/custom-routing`, body).then(r => r.data)

export const restoreToTemplate = (productCode: string, templateId: number): Promise<void> =>
  apiClient.post(`/products/${productCode}/custom-routing/restore-to-template`, { template_id: templateId }).then(r => r.data)

export const addCustomRoutingOp = (
  productCode: string,
  body: { op_code: string; name: string; workcenter_id: number; sequence?: number },
): Promise<CustomRoutingOpDTO> =>
  apiClient.post(`/products/${productCode}/custom-routing/ops`, body).then(r => r.data)

export const deleteCustomRoutingOp = (productCode: string, opId: number): Promise<{ deleted: boolean }> =>
  apiClient.delete(`/products/${productCode}/custom-routing/ops/${opId}`).then(r => r.data)

export const addCustomRoutingActivity = (
  productCode: string,
  opId: number,
  body: {
    description: string
    per_minute: number
    formula_param_code: string
    std_measure: number
    unit: string
    manpower?: number
    workcenter_id: number
  },
): Promise<CustomRoutingActivityDTO> =>
  apiClient.post(`/products/${productCode}/custom-routing/ops/${opId}/activities`, body).then(r => r.data)

export const deleteCustomRoutingActivity = (
  productCode: string,
  opId: number,
  actId: number,
): Promise<{ deleted: boolean }> =>
  apiClient.delete(`/products/${productCode}/custom-routing/ops/${opId}/activities/${actId}`).then(r => r.data)

// ── Sprint 4.2: Routing Templates ─────────────────────────────

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

export const updateBindingRule = (id: number, body: Partial<BindingRuleDTO>): Promise<BindingRuleDTO> =>
  apiClient.patch(`/routing-template-binding-rules/${id}`, body).then(r => r.data)

export const deleteBindingRule = (id: number): Promise<void> =>
  apiClient.delete(`/routing-template-binding-rules/${id}`).then(r => r.data)

export const reorderBindingRules = (items: { id: number; priority: number }[]): Promise<BindingRuleDTO[]> =>
  apiClient.post('/routing-template-binding-rules/reorder', { items }).then(r => r.data)

export const rebindProduct = (productCode: string): Promise<number | null> =>
  apiClient.post(`/products/${productCode}/rebind`).then(r => r.data)
