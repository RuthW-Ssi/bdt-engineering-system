/**
 * GET /schedule/board response (read-only Gantt payload). One round trip gives the
 * board everything it draws: the version picker, the chosen version's placed ops,
 * the WOs/MOs they belong to (plus every still-open WO, placed or not), and the
 * work-center / line / team / holiday lookups. Decimal -> number, Date -> ISO string.
 */
export interface ScheduleBoard {
  /** All prod_schedule_version, newest first. */
  versions: BoardVersion[]
  /** Version the ops come from (see ScheduleService.board for the pick order); null = no version has rows. */
  version_id: number | null
  /** Server now, ISO. */
  generated_at: string
  /** prod_schedule rows of version_id, start asc. */
  ops: BoardOp[]
  /** WOs referenced by ops ∪ all WOs in an open status (BOARD_OPEN_WO_STATUSES). */
  work_orders: BoardWorkOrder[]
  /** MOs referenced by work_orders. */
  mos: BoardMo[]
  work_centers: BoardWorkCenter[]
  lines: BoardLine[]
  teams: BoardTeam[]
  /** 'YYYY-MM-DD' of calendar_exception rows with is_working=false (distinct, ascending). */
  holidays: string[]
}

export interface BoardVersion {
  id: number
  version_code: string
  description: string | null
  scheduler_source: string | null
  is_active: boolean
  created_at: string
  created_by: string
  /** Number of prod_schedule rows in this version. */
  row_count: number
}

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
  /** source_routing_op_id -> mrp_routing_workcenter.op_type -> label || key (empty label falls back); null if any link is missing. */
  op_label: string | null
  /** work_order.subcontractor_id (the team). */
  team_id: number | null
  team_headcount: number | null
  /**
   * Distinct, sorted assembly marks of the WO's parts — only parts whose assembly is a live
   * (removed_at null) work_order_mark; parts left behind by a removed mark are ignored.
   */
  marks: string[]
  /** Σ work_order_part.weight_kg over the same live-mark parts; null when there are none. */
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
