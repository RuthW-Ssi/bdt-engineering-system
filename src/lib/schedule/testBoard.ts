// Test-only builders for ScheduleBoard fixtures (imported by the *.test.ts files here).
import type { BoardLine, BoardMo, BoardOp, BoardTeam, BoardVersion, BoardWorkCenter, BoardWorkOrder, ScheduleBoard } from '../../api/schedule'

/** Bangkok wall-clock 'YYYY-MM-DDTHH:mm' → epoch ms. */
export const bkk = (local: string): number => Date.parse(`${local}:00+07:00`)
/** Bangkok wall-clock → ISO string as the API would send it. */
export const iso = (local: string): string => new Date(bkk(local)).toISOString()

export const wc = (id: number, code: string, over: Partial<BoardWorkCenter> = {}): BoardWorkCenter => ({
  id, code, name: `${code} name`, active: true, availability: null, performance: null, quality: null, oee_target: null, ...over,
})

export const line = (id: number, workcenter_id: number, line_no: number, over: Partial<BoardLine> = {}): BoardLine => ({
  id, workcenter_id, line_no, name: null, active: true, ...over,
})

export const mo = (id: number, plan_finish: string | null, over: Partial<BoardMo> = {}): BoardMo => ({
  id, mo_code: `MO-${id}`, primary_mark_prefix_code: null, plan_start: null, plan_finish: plan_finish && iso(plan_finish), ...over,
})

export const wo = (id: number, mo_id: number, over: Partial<BoardWorkOrder> = {}): BoardWorkOrder => ({
  id, wo_code: `WO-${id}`, mo_id, sequence: 10, status: 'RELEASED', expected_duration_min: 60, setup_time_min: null,
  plan_start: null, plan_finish: null, op_label: null, team_id: null, team_headcount: null, marks: [], weight_kg: null, ...over,
})

export const op = (work_order_id: number, workcenter_line_id: number | null, start: string, end: string): BoardOp => ({
  work_order_id, workcenter_line_id, start: iso(start), end: iso(end),
})

export const team = (id: number, code: string, over: Partial<BoardTeam> = {}): BoardTeam => ({
  id, code, name: `${code} team`, team_type: 'internal', active: true, ...over,
})

export const version = (id: number, over: Partial<BoardVersion> = {}): BoardVersion => ({
  id, version_code: `V${id}`, description: null, scheduler_source: 'python-aps', is_active: false,
  created_at: '2026-10-01T00:00:00.000Z', created_by: 'admin', row_count: 1, ...over,
})

export function makeBoard(over: Partial<ScheduleBoard> = {}): ScheduleBoard {
  return {
    versions: [version(1, { is_active: true })],
    version_id: 1,
    generated_at: '2026-10-03T00:00:00.000Z',
    ops: [],
    work_orders: [],
    mos: [],
    work_centers: [],
    lines: [],
    teams: [],
    holidays: [],
    ...over,
  }
}
