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

/**
 * GET /schedule/board/fourm response — the 4M panel's inputs the board payload
 * doesn't carry (Man: operator headcount, Material: stock counts, WIP: buffer levels).
 * Machine and Method come from the board itself. Decimal -> number, Date -> ISO string.
 */
export interface ScheduleFourM {
  /** Same pick as ScheduleBoard.version_id (pickBoardVersionId). */
  version_id: number | null
  /** active operators per team, team_id ascending; unassigned (team_id null) operators are left out. */
  operators_by_team: FourMTeamOperators[]
  stock: FourMStock
  wip: FourMWip
  /**
   * min(work_order.sequence) per MO over its non-CANCELLED WOs — DONE ones included, which
   * the board leaves out — so Material counts intake only at an MO's real first op.
   */
  first_seq_by_mo: FourMFirstSeq[]
}

export interface FourMFirstSeq {
  mo_id: number
  first_seq: number
}

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

export interface FourMWip {
  /** 'view_missing' = the wip_balance view isn't in the DB (migration 20261003000000 not applied); rows is then []. */
  status: 'ok' | 'view_missing'
  /** wip_balance rows of version_id, storage_code then t ascending; [] when version_id is null. */
  rows: FourMWipRow[]
}

export interface FourMWipRow {
  storage_code: string
  /** ISO instant the buffer level changes. */
  t: string
  /** Area used ÷ area_cap_m2 × 100 after t (1 decimal); null when the buffer has no area cap. */
  area_pct: number | null
}
