import { apiClient } from './client'

// Production schedule (ADR-0015). The board is one read-only GET that carries
// everything the Production Schedule page draws (the 4M panel adds a second
// read-only GET, /schedule/board/fourm); the two POSTs trigger the
// prod-scheduler Cloud Run service / switch the active version
// (both @RequiresPermission('orders','update')). Decimal → number and
// Date → ISO string, as everywhere else in this app.

// ── GET /schedule/board ───────────────────────────────────────────────────────
export interface BoardVersion {
  id: number
  version_code: string
  description: string | null
  scheduler_source: string | null
  is_active: boolean
  created_at: string
  created_by: string
  row_count: number
}

/** One prod_schedule row of the selected version. */
export interface BoardOp {
  work_order_id: number
  workcenter_line_id: number | null
  start: string
  end: string
}

export interface BoardWorkOrder {
  id: number
  wo_code: string
  mo_id: number
  sequence: number
  status: string
  expected_duration_min: number | null
  setup_time_min: number | null
  plan_start: string | null
  plan_finish: string | null
  /** source routing op → mrp_op_type (label ?? key); null when any link is missing. */
  op_label: string | null
  /** work_order.subcontractor_id → team. */
  team_id: number | null
  team_headcount: number | null
  /** Distinct sorted bom_assembly.assembly_mark of the WO's parts. */
  marks: string[]
  /** Σ work_order_part.weight_kg; null when the WO has no parts. */
  weight_kg: number | null
}

export interface BoardMo {
  id: number
  mo_code: string
  primary_mark_prefix_code: string | null
  plan_start: string | null
  plan_finish: string | null
}

export interface BoardWorkCenter {
  id: number
  code: string
  name: string | null
  active: boolean
  availability: number | null
  performance: number | null
  quality: number | null
  oee_target: number | null
}

export interface BoardLine {
  id: number
  workcenter_id: number
  line_no: number
  name: string | null
  active: boolean
}

export interface BoardTeam {
  id: number
  code: string
  name: string | null
  team_type: string
  active: boolean
}

export interface ScheduleBoard {
  /** All prod_schedule_version, newest first. */
  versions: BoardVersion[]
  /** The version `ops` belong to (requested → active → newest with rows); null when no version has rows. */
  version_id: number | null
  generated_at: string
  /** prod_schedule rows of `version_id`, start asc. */
  ops: BoardOp[]
  /** WOs referenced by `ops` ∪ every NOT_STARTED/RELEASED/IN_PROGRESS/PAUSED/ON_HOLD WO. */
  work_orders: BoardWorkOrder[]
  /** MOs referenced by `work_orders`. */
  mos: BoardMo[]
  work_centers: BoardWorkCenter[]
  lines: BoardLine[]
  teams: BoardTeam[]
  /** 'YYYY-MM-DD' of non-working calendar_exception days. */
  holidays: string[]
}

export async function getScheduleBoard(versionId?: number | null): Promise<ScheduleBoard> {
  const params = versionId != null ? { version_id: versionId } : undefined
  return (await apiClient.get('/schedule/board', { params })).data
}

// ── GET /schedule/board/fourm ─────────────────────────────────────────────────
// The 4M + WIP panel's extra data, loaded after the board (larger queries).
// Same version rule as the board: requested → active → newest with rows.

/** Active operators of one team (operator.active = true, team_id not null). */
export interface FourMTeamOperators {
  team_id: number
  active_operators: number
}

export interface FourMStock {
  /** count(materials). */
  materials: number
  /** Distinct stock_quant.material_id with quantity > 0. */
  with_stock: number
  /** stock_quant rows with reserved_quantity > quantity. */
  short: number
}

/** One wip_balance view row of the version: a buffer's occupancy level from `t` on. */
export interface FourMWipRow {
  storage_code: string
  t: string
  area_pct: number | null
}

export interface FourMWip {
  /** 'view_missing' → wip_balance is not created yet (migration 20261003000000 not applied); rows are []. */
  status: 'ok' | 'view_missing'
  /** Ordered by storage_code, t. */
  rows: FourMWipRow[]
}

/** min(work_order.sequence) over an MO's non-CANCELLED WOs — DONE ones included. */
export interface FourMFirstSeq {
  mo_id: number
  first_seq: number
}

export interface ScheduleFourM {
  version_id: number | null
  operators_by_team: FourMTeamOperators[]
  stock: FourMStock
  wip: FourMWip
  /**
   * min(sequence) per MO over its non-CANCELLED WOs (DONE included). The board leaves
   * out DONE WOs that aren't scheduled, so only this knows an MO's cutting is
   * already done.
   */
  first_seq_by_mo: FourMFirstSeq[]
}

export async function getScheduleFourM(versionId?: number | null): Promise<ScheduleFourM> {
  const params = versionId != null ? { version_id: versionId } : undefined
  return (await apiClient.get('/schedule/board/fourm', { params })).data
}

// ── POST /schedule/runs ───────────────────────────────────────────────────────
// Mirrors backend/src/modules/work-orders/scheduler-api.client.ts.
export const SCHEDULE_DIRECTIONS = ['event', 'backward', 'forward', 'alap'] as const
export const DISPATCH_RULES = ['EDD', 'CR', 'SPT', 'FIFO'] as const
export type ScheduleDirection = (typeof SCHEDULE_DIRECTIONS)[number]
export type DispatchRule = (typeof DISPATCH_RULES)[number]

export interface RunScheduleInput {
  direction: ScheduleDirection
  dispatch_rule?: DispatchRule
  activate?: boolean
}

export interface ScheduleRunKpi {
  work_orders: number
  feasible: boolean
  line_overlaps: number
  span_start: string | null
  span_end: string | null
  makespan_days: number
  late_vs_due: number
  start_before_now: number
  total_tardiness_hours: number
}

export interface ScheduleRunResult {
  version_id: number | null
  version_code: string | null
  is_active: boolean
  kpi: ScheduleRunKpi
  /** Productive minutes per workcenter_line id (JSON keys are strings). */
  line_load_min: Record<string, number>
  direction: ScheduleDirection
  dispatch_rule: DispatchRule
  requested_by: string
}

/** 201 · 409 run_in_progress · 422 { message, reasons[] } data_not_ready · 500 · 504. */
export async function runSchedule(body: RunScheduleInput): Promise<ScheduleRunResult> {
  return (await apiClient.post('/schedule/runs', body)).data
}

// ── POST /schedule/versions/:id/activate ──────────────────────────────────────
/** The prod_schedule_version row after activation. */
export interface ScheduleVersionRow {
  id: number
  version_code: string
  description: string | null
  is_active: boolean
  scheduler_source: string | null
  created_at: string
  created_by: string
}

/** 201 · 404 missing version · 409 a scheduler run holds the lock. */
export async function activateScheduleVersion(id: number): Promise<ScheduleVersionRow> {
  return (await apiClient.post(`/schedule/versions/${id}/activate`)).data
}
