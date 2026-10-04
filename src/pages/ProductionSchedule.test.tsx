import { vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ScheduleBoard, ScheduleFourM } from '../api/schedule'
import { FOURM_TEXT, RUN_IN_PROGRESS_MESSAGE, SCHEDULER_TIMEOUT_HINT, SCHEDULE_TEXT } from '../lib/schedule'
import { iso, line, makeBoard, mo, op, team, version, wc, wo } from '../lib/schedule/testBoard'
import { ProductionSchedule } from './ProductionSchedule'

// The page is driven entirely by the four schedule hooks + usePermission;
// mock them so no QueryClient / apiClient is involved.
let boardResult: Record<string, unknown>
let fourmResult: Record<string, unknown>
let runResult: Record<string, unknown>
let activateResult: Record<string, unknown>
let canUpdate = true
const boardCalls: Array<number | null | undefined> = []
const fourmCalls: Array<{ versionId: number | null | undefined; enabled: boolean | undefined }> = []

vi.mock('../hooks/useSchedule', () => ({
  useScheduleBoard: (versionId?: number | null) => {
    boardCalls.push(versionId)
    return boardResult
  },
  useScheduleFourM: (versionId?: number | null, opts?: { enabled?: boolean }) => {
    fourmCalls.push({ versionId, enabled: opts?.enabled })
    return fourmResult
  },
  useRunSchedule: () => runResult,
  useActivateVersion: () => activateResult,
}))
vi.mock('../hooks/usePermission', () => ({
  usePermission: (_module: string, action: string) => (action === 'update' ? canUpdate : true),
}))

// Mon 05 Oct 2026 (Bangkok). MO-100 is late: its weld op ends 18:30, after its 17:00 due.
// MO-200 is on time. MO-300 has one schedulable WO outside the version → backlog.
// WC-PAINT has no ops → collapsed on first draw.
const PLAN = { plan_start: iso('2026-10-05T08:00'), plan_finish: iso('2026-10-05T17:00') }

function fixtureBoard(over: Partial<ScheduleBoard> = {}): ScheduleBoard {
  return makeBoard({
    versions: [version(2, { version_code: 'V2', is_active: false, row_count: 3 }), version(1, { version_code: 'V1', is_active: true, row_count: 5 })],
    version_id: 2,
    generated_at: iso('2026-10-05T07:00'),
    work_centers: [wc(1, 'WC-CUT'), wc(2, 'WC-WELD'), wc(3, 'WC-PAINT')],
    lines: [line(11, 1, 1), line(21, 2, 1), line(22, 2, 2), line(31, 3, 1)],
    teams: [team(7, 'T-WELD', { name: 'Weld team A' })],
    mos: [
      mo(100, '2026-10-05T17:00'),
      mo(200, '2026-10-09T17:00'),
      mo(300, '2026-10-20T17:00', { primary_mark_prefix_code: 'CO' }),
    ],
    work_orders: [
      wo(1001, 100, { ...PLAN, sequence: 10, op_label: 'Cut', marks: ['A1'], expected_duration_min: 120 }),
      wo(1002, 100, { ...PLAN, sequence: 20, op_label: 'Weld', marks: ['A1'], expected_duration_min: 240, team_id: 7, team_headcount: 3, weight_kg: 1234 }),
      wo(2001, 200, { ...PLAN, sequence: 10, op_label: 'Cut', marks: ['B1', 'B2'], expected_duration_min: 120 }),
      wo(3001, 300, { op_label: 'Cut', expected_duration_min: 90, plan_start: iso('2026-10-10T08:00'), plan_finish: iso('2026-10-12T17:00') }),
    ],
    ops: [
      op(1001, 11, '2026-10-05T08:00', '2026-10-05T10:00'),
      op(2001, 11, '2026-10-05T10:00', '2026-10-05T12:00'),
      op(1002, 21, '2026-10-05T13:00', '2026-10-05T18:30'),
    ],
    ...over,
  })
}

// 4M of V2: T-WELD (internal) has 4 operators · 1 short stock row ·
// STG-A overflows (130 %) Mon morning, STG-B stays at 60 %.
function fixtureFourM(over: Partial<ScheduleFourM> = {}): ScheduleFourM {
  return {
    version_id: 2,
    operators_by_team: [{ team_id: 7, active_operators: 4 }],
    stock: { materials: 1200, with_stock: 3, short: 1 },
    first_seq_by_mo: [],
    wip: {
      status: 'ok',
      rows: [
        { storage_code: 'STG-A', t: iso('2026-10-05T09:00'), area_pct: 130 },
        { storage_code: 'STG-B', t: iso('2026-10-05T14:00'), area_pct: 60 },
      ],
    },
    ...over,
  }
}

function axiosError(status: number, data: unknown) {
  return Object.assign(new Error(`Request failed with status code ${status}`), { isAxiosError: true, response: { status, data } })
}

const runMutate = vi.fn()
const activateMutate = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  boardCalls.length = 0
  fourmCalls.length = 0
  canUpdate = true
  boardResult = { data: fixtureBoard(), isLoading: false, isError: false, error: null, refetch: vi.fn(), isFetching: false, isPlaceholderData: false }
  fourmResult = { data: fixtureFourM(), isError: false, error: null, refetch: vi.fn() }
  runResult = { mutate: runMutate, isPending: false, error: null, reset: vi.fn() }
  activateResult = { mutate: activateMutate, isPending: false, error: null, reset: vi.fn() }
})

describe('ProductionSchedule', () => {
  it('renders the KPI tiles per MO from the board', () => {
    render(<ProductionSchedule />)

    expect(screen.getByTestId('kpi-onTime')).toHaveTextContent('50%')
    expect(screen.getByTestId('kpi-onTime')).toHaveTextContent('ส่งทันกำหนด')
    expect(screen.getByTestId('kpi-late')).toHaveTextContent('1งานสาย')
    expect(screen.getByTestId('kpi-backlog')).toHaveTextContent('1Backlog (รอจัด)')
    expect(screen.getByTestId('kpi-finish')).toHaveTextContent('18:30')
  })

  it('draws the WC → line tree with idle WCs collapsed, and one bar per op', () => {
    render(<ProductionSchedule />)
    const gantt = screen.getByRole('region', { name: 'Resource Gantt' })

    expect(within(gantt).getByRole('button', { name: /^▾CUT/ })).toHaveAttribute('aria-expanded', 'true')
    expect(within(gantt).getByRole('button', { name: /^▾WELD/ })).toHaveAttribute('aria-expanded', 'true')
    expect(within(gantt).getByRole('button', { name: /^▸PAINT/ })).toHaveAttribute('aria-expanded', 'false')
    expect(within(gantt).getAllByText('L1')).toHaveLength(2) // CUT L1 + WELD L1 (PAINT collapsed)
    expect(within(gantt).getByText('L2')).toBeInTheDocument()

    // MO-100 is late → every open op of it is flagged, not just the one that ends after the due
    expect(within(gantt).getByRole('button', { name: 'A1 · Weld · สาย' })).toHaveAttribute('data-late', 'true')
    expect(within(gantt).getByRole('button', { name: 'A1 · Cut · สาย' })).toHaveAttribute('data-late', 'true')
    expect(within(gantt).getByRole('button', { name: 'B1 +1 · Cut' })).not.toHaveAttribute('data-late')

    // late = inset ring (box-shadow), so the outline stays free for the focus ring
    const weld = within(gantt).getByRole('button', { name: 'A1 · Weld · สาย' })
    expect(weld.style.boxShadow).toContain('inset')
    expect(weld.style.outline).toBe('')

    // expanding PAINT adds its line row
    fireEvent.click(within(gantt).getByRole('button', { name: /^▸PAINT/ }))
    expect(within(gantt).getAllByText('L1')).toHaveLength(3)
  })

  it('keeps the other bars mounted when a WC is collapsed (stable keys)', () => {
    render(<ProductionSchedule />)
    const gantt = screen.getByRole('region', { name: 'Resource Gantt' })
    const weld = within(gantt).getByRole('button', { name: 'A1 · Weld · สาย' })

    fireEvent.click(within(gantt).getByRole('button', { name: /^▾CUT/ }))
    expect(within(gantt).queryByRole('button', { name: 'A1 · Cut · สาย' })).not.toBeInTheDocument()
    expect(within(gantt).getByRole('button', { name: 'A1 · Weld · สาย' })).toBe(weld)
  })

  it('shows the backlog card and the WO detail of a clicked bar', () => {
    render(<ProductionSchedule />)

    const card = screen.getByTestId('backlog-card')
    expect(card).toHaveTextContent('MO-300')
    expect(card).toHaveTextContent('CO · 1 ops')
    expect(card).toHaveTextContent('Σ 1.5h')

    expect(screen.getByText(SCHEDULE_TEXT.detailEmpty)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'A1 · Weld · สาย' }))
    const detail = screen.getByTestId('op-detail')
    expect(detail).toHaveTextContent('สาย (LATE)')
    expect(detail).toHaveTextContent('Weld team A · internal · 3 คน')
    expect(detail).toHaveTextContent('1,234 kg')
    expect(detail).toHaveTextContent('WO-1002 · MO-100')
  })

  it('order list click selects the MO\'s first op', () => {
    render(<ProductionSchedule />)
    const panel = screen.getByRole('region', { name: 'รายละเอียด' })

    fireEvent.click(within(panel).getByRole('button', { name: /MO-200/ }))
    expect(screen.getByRole('button', { name: 'B1 +1 · Cut' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('op-detail')).toHaveTextContent('WO-2001 · MO-200')
  })

  it('switches version through the board hook', () => {
    render(<ProductionSchedule />)

    expect(screen.getByRole('button', { name: 'V2' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: '★ V1' }))
    expect(boardCalls.at(-1)).toBe(1)
  })

  it('hides Run and Activate without orders:update', () => {
    canUpdate = false
    render(<ProductionSchedule />)

    expect(screen.queryByRole('button', { name: /Run scheduler/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Activate/ })).not.toBeInTheDocument()
    expect(screen.getByTestId('kpi-onTime')).toBeInTheDocument() // the board itself still renders
  })

  it('offers Run, and Activate only for a non-active version, with orders:update', () => {
    const { unmount } = render(<ProductionSchedule />)
    expect(screen.getByRole('button', { name: /Run scheduler/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Activate/ })).toBeInTheDocument()
    unmount()

    boardResult = { ...boardResult, data: fixtureBoard({ version_id: 1 }) }
    render(<ProductionSchedule />)
    expect(screen.queryByRole('button', { name: /Activate/ })).not.toBeInTheDocument()
  })

  it('activates the shown version after an in-page confirm', () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    render(<ProductionSchedule />)

    fireEvent.click(screen.getByRole('button', { name: /Activate/ }))
    const box = screen.getByRole('group', { name: 'Confirm activate' })
    expect(box).toHaveTextContent('V2')
    expect(activateMutate).not.toHaveBeenCalled()

    fireEvent.click(within(box).getByRole('button', { name: 'ยืนยัน' }))
    expect(activateMutate).toHaveBeenCalledWith(2, expect.any(Object))
    expect(confirmSpy).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('moves focus into the confirm group and back to Activate on cancel', () => {
    render(<ProductionSchedule />)

    fireEvent.click(screen.getByRole('button', { name: /Activate/ }))
    const cancel = within(screen.getByRole('group', { name: 'Confirm activate' })).getByRole('button', { name: 'ยกเลิก' })
    expect(cancel).toHaveFocus()

    fireEvent.click(cancel)
    expect(screen.getByRole('button', { name: /Activate/ })).toHaveFocus()
  })

  it('cannot cancel an activation in flight', () => {
    const { rerender } = render(<ProductionSchedule />)
    fireEvent.click(screen.getByRole('button', { name: /Activate/ }))

    activateResult = { ...activateResult, isPending: true }
    rerender(<ProductionSchedule />)
    const box = screen.getByRole('group', { name: 'Confirm activate' })
    expect(within(box).getByRole('button', { name: 'ยกเลิก' })).toBeDisabled()
    fireEvent.click(within(box).getByRole('button', { name: 'ยกเลิก' }))
    expect(activateResult.reset).not.toHaveBeenCalled()
  })

  it('hides Activate while another version is loading (placeholder board)', () => {
    render(<ProductionSchedule />)
    expect(screen.getByRole('button', { name: /Activate/ })).toBeInTheDocument() // V2 shown, not active

    // pick V1: the hook keeps showing V2's board as placeholder until V1 arrives
    boardResult = { ...boardResult, isPlaceholderData: true }
    fireEvent.click(screen.getByRole('button', { name: '★ V1' }))
    expect(screen.queryByRole('button', { name: /Activate/ })).not.toBeInTheDocument()
  })

  it('submits the run form with direction, rule and activate', () => {
    render(<ProductionSchedule />)

    fireEvent.click(screen.getByRole('button', { name: /Run scheduler/ }))
    const form = screen.getByRole('form', { name: 'Run scheduler' })
    fireEvent.change(within(form).getByLabelText('Direction'), { target: { value: 'backward' } })
    fireEvent.change(within(form).getByLabelText('Rule'), { target: { value: 'CR' } })
    fireEvent.click(within(form).getByLabelText(/activate/))
    fireEvent.click(within(form).getByRole('button', { name: 'Run' }))

    expect(runMutate).toHaveBeenCalledWith({ direction: 'backward', dispatch_rule: 'CR', activate: true }, expect.any(Object))
  })

  it('cannot close the run form while a run is in flight', () => {
    const { rerender } = render(<ProductionSchedule />)
    fireEvent.click(screen.getByRole('button', { name: /Run scheduler/ }))

    runResult = { ...runResult, isPending: true }
    rerender(<ProductionSchedule />)
    const form = screen.getByRole('form', { name: 'Run scheduler' })
    expect(within(form).getByRole('button', { name: 'ยกเลิก' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Run scheduler/ })).toBeDisabled()
    fireEvent.click(within(form).getByRole('button', { name: 'ยกเลิก' }))
    expect(runResult.reset).not.toHaveBeenCalled()
    expect(screen.getByRole('form', { name: 'Run scheduler' })).toBeInTheDocument()
  })

  it('closes the run form on success and hands focus back to the toggle', () => {
    runMutate.mockImplementationOnce((_body, opts: { onSuccess: (r: unknown) => void }) =>
      opts.onSuccess({ version_id: 1, version_code: 'V1', is_active: true }),
    )
    render(<ProductionSchedule />)

    fireEvent.click(screen.getByRole('button', { name: /Run scheduler/ }))
    fireEvent.click(within(screen.getByRole('form', { name: 'Run scheduler' })).getByRole('button', { name: 'Run' }))

    expect(screen.queryByRole('form', { name: 'Run scheduler' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Run scheduler/ })).toHaveFocus()
    expect(boardCalls.at(-1)).toBe(1) // switched to the new version
  })

  it('shows a 504 with the "may still finish" hint', () => {
    runResult = { ...runResult, error: axiosError(504, { message: 'Scheduler timed out' }) }
    render(<ProductionSchedule />)

    fireEvent.click(screen.getByRole('button', { name: /Run scheduler/ }))
    expect(screen.getByRole('alert')).toHaveTextContent(`Scheduler timed out · ${SCHEDULER_TIMEOUT_HINT}`)
  })

  it('shows the 422 data_not_ready message with its reasons', () => {
    runResult = {
      ...runResult,
      error: axiosError(422, { message: 'Scheduler input data is not ready', reasons: ['12 WO ไม่มี plan_finish', 'WC-WELD ไม่มี line ที่ active'] }),
    }
    render(<ProductionSchedule />)

    fireEvent.click(screen.getByRole('button', { name: /Run scheduler/ }))
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Scheduler input data is not ready')
    const reasons = within(alert).getAllByRole('listitem').map((li) => li.textContent)
    expect(reasons).toEqual(['12 WO ไม่มี plan_finish', 'WC-WELD ไม่มี line ที่ active'])
  })

  it('shows a 409 as "run in progress"', () => {
    runResult = { ...runResult, error: axiosError(409, { message: 'run_in_progress' }) }
    render(<ProductionSchedule />)

    fireEvent.click(screen.getByRole('button', { name: /Run scheduler/ }))
    expect(screen.getByRole('alert')).toHaveTextContent(RUN_IN_PROGRESS_MESSAGE)
  })

  it('renders the empty states when no version has rows', () => {
    boardResult = { ...boardResult, data: makeBoard({ versions: [], version_id: null, generated_at: iso('2026-10-05T07:00') }) }
    render(<ProductionSchedule />)

    expect(screen.getByRole('button', { name: SCHEDULE_TEXT.noVersion })).toBeDisabled()
    expect(screen.getByText(SCHEDULE_TEXT.ganttEmpty)).toBeInTheDocument()
    expect(screen.getByText(SCHEDULE_TEXT.heatEmpty)).toBeInTheDocument()
    expect(screen.getByTestId('kpi-onTime')).toHaveTextContent('—')
  })

  it('shows the load error with a retry', () => {
    const refetch = vi.fn()
    boardResult = { data: undefined, isLoading: false, isError: true, error: axiosError(500, { message: 'boom' }), refetch, isFetching: false, isPlaceholderData: false }
    render(<ProductionSchedule />)

    expect(screen.getByRole('alert')).toHaveTextContent('boom')
    fireEvent.click(screen.getByRole('button', { name: /ลองใหม่/ }))
    expect(refetch).toHaveBeenCalled()
    // nothing picked yet → nothing to go back to
    expect(screen.queryByRole('button', { name: /กลับไป version/ })).not.toBeInTheDocument()
  })

  it('offers a way back when a picked version fails to load', () => {
    const { rerender } = render(<ProductionSchedule />)
    fireEvent.click(screen.getByRole('button', { name: '★ V1' }))
    expect(boardCalls.at(-1)).toBe(1)

    boardResult = { data: undefined, isLoading: false, isError: true, error: axiosError(500, { message: 'boom' }), refetch: vi.fn(), isFetching: false, isPlaceholderData: false }
    rerender(<ProductionSchedule />)
    fireEvent.click(screen.getByRole('button', { name: /กลับไป version/ }))
    expect(boardCalls.at(-1)).toBeNull()
  })

  describe('4M + WIP analysis', () => {
    // named without its 📊, like the SchedCard sections
    const fourmSection = () => screen.getByRole('region', { name: '4M + WIP analysis' })

    it('renders the five cards from the board + 4M data, below the grid', () => {
      render(<ProductionSchedule />)
      const section = fourmSection()

      expect(section).toHaveTextContent(FOURM_TEXT.sub)
      expect(within(section).getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual(['Man', 'Machine', 'Material', 'Method', 'WIP / Storage'])
      // asked for the version the board shows
      expect(fourmCalls.at(-1)).toEqual({ versionId: 2, enabled: true })

      const man = within(section).getByRole('region', { name: 'Man' })
      expect(man).toHaveTextContent('internal crew util %/shift')
      expect(within(man).getByText('4 internal operators')).toHaveAttribute('data-tone', 'ok')
      expect(within(man).getByText('2 WO ไม่มีทีม')).toHaveAttribute('data-tone', 'warn')

      // CUT: 210 busy min in the 210 min morning on its one line
      const machine = within(section).getByRole('region', { name: 'Machine' })
      expect(within(machine).getByText('bottleneck CUT 100%')).toHaveAttribute('data-tone', 'warn')

      const material = within(section).getByRole('region', { name: 'Material' })
      expect(within(material).getByText('1,200 materials')).toBeInTheDocument()
      expect(within(material).getByText('1 short')).toHaveAttribute('data-tone', 'bad')

      const method = within(section).getByRole('region', { name: 'Method' })
      expect(within(method).getByText('2 op-types')).toBeInTheDocument()
      expect(within(method).getByText('coverage 100%')).toHaveAttribute('data-tone', 'ok')

      // one working day (Mon) × three shift bars per chart, each with a tooltip
      const wip = within(section).getByRole('region', { name: 'WIP / Storage' })
      expect(within(wip).getAllByTestId('fm-day')).toHaveLength(1)
      expect(within(wip).getByText('1 overflow: A')).toHaveAttribute('data-tone', 'bad')
      expect(within(wip).getAllByTitle(/130% \(A\)/)).toHaveLength(3) // the level carries into บ่าย and โอที
      // each bar's value is also its accessible name, not only a hover tooltip
      expect(within(wip).getAllByRole('img', { name: /130% \(A\)/ })).toHaveLength(3)
    })

    it('shows the missing wip_balance view with the migration hint', () => {
      fourmResult = { ...fourmResult, data: fixtureFourM({ wip: { status: 'view_missing', rows: [] } }) }
      render(<ProductionSchedule />)

      const wip = within(fourmSection()).getByRole('region', { name: 'WIP / Storage' })
      expect(within(wip).getByText('ยังไม่มี view wip_balance')).toHaveAttribute('data-tone', 'bad')
      expect(wip).toHaveTextContent(FOURM_TEXT.wipMissing)
      expect(within(wip).queryByTestId('fm-day')).not.toBeInTheDocument()
      // the other four cards still draw
      expect(within(fourmSection()).getAllByRole('region')).toHaveLength(5)
    })

    it('shows the loading stub until 4M data of the shown version is in', () => {
      fourmResult = { ...fourmResult, data: undefined }
      const { rerender } = render(<ProductionSchedule />)
      expect(within(fourmSection()).getByText(FOURM_TEXT.loading)).toBeInTheDocument()
      expect(within(fourmSection()).queryByRole('region')).not.toBeInTheDocument()

      // the previous version's data (placeholder while switching) is not drawn against this board
      fourmResult = { ...fourmResult, data: fixtureFourM({ version_id: 1 }) }
      rerender(<ProductionSchedule />)
      expect(within(fourmSection()).getByText(FOURM_TEXT.loading)).toBeInTheDocument()
    })

    it('waits for the board before asking for 4M', () => {
      boardResult = { ...boardResult, data: undefined, isLoading: true }
      render(<ProductionSchedule />)

      expect(fourmCalls.at(-1)).toEqual({ versionId: undefined, enabled: false })
      expect(screen.queryByRole('region', { name: /4M \+ WIP analysis/ })).not.toBeInTheDocument()
    })

    it('shows a 4M load error with a retry, the board still on screen', () => {
      const refetch = vi.fn()
      fourmResult = { data: undefined, isError: true, error: axiosError(500, { message: '4M boom' }), refetch }
      render(<ProductionSchedule />)

      const section = fourmSection()
      expect(within(section).getByRole('alert')).toHaveTextContent(`${FOURM_TEXT.error}: 4M boom`)
      fireEvent.click(within(section).getByRole('button', { name: FOURM_TEXT.retry }))
      expect(refetch).toHaveBeenCalledTimes(1)
      expect(screen.getByTestId('kpi-onTime')).toBeInTheDocument()
    })

    it('Reload refetches the 4M data too', () => {
      const refetch = vi.fn()
      fourmResult = { ...fourmResult, refetch }
      render(<ProductionSchedule />)

      fireEvent.click(screen.getByRole('button', { name: /Reload/ }))
      expect(boardResult.refetch).toHaveBeenCalled()
      expect(refetch).toHaveBeenCalledTimes(1)
    })
  })
})
