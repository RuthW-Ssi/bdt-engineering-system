import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { WoDetail as WoDetailT, WoEvent, WoMark } from '../api/wo'
import type { ActualDatesValue } from '../components/ActualDatesModal'
import { WoDetail } from './WoDetail'

// Page-level wiring (fix wave 2026-10-05) — WoDetail.test.ts covers the pure
// helpers. The hooks, permission check and the dates modal are mocked, so no
// QueryClient / apiClient is involved (same precedent as ProductionSchedule.test.tsx).
let wo: WoDetailT
let events: WoEvent[]
let eventsLoading = false
const doneMutate = vi.fn()
const refetch = vi.fn()

// vi.mock factories are hoisted — top-level values are only read lazily, inside the hooks.
const mutation = () => ({ mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false })
vi.mock('../hooks/useWo', () => ({
  useWo: () => ({ data: wo, isLoading: false, refetch }),
  useWoEvents: () => ({ data: events, isLoading: eventsLoading }),
  useWoSchedule: () => ({ data: [], isLoading: false }),
  useBomVersionStatus: () => ({ data: [] }),
  useWoCancelSiblings: () => ({ data: undefined }),
  useWoDone: () => ({ mutate: doneMutate, isPending: false }),
  useWoTransition: () => mutation(),
  useWoCancel: () => mutation(),
  useRemoveWoMark: () => mutation(),
  useAcceptNewVersion: () => mutation(),
  useUpdateWoActuals: () => mutation(),
  useUpdateMarkProgress: () => mutation(),
}))
vi.mock('../hooks/usePermission', () => ({ usePermission: () => true }))
vi.mock('../components/wo/WoVisualTab', () => ({ WoVisualTab: () => null }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
// The modal's own form is tested elsewhere — here it just confirms fixed actuals.
const ACTUALS: ActualDatesValue = { actual_start: '2026-10-05T01:00:00.000Z', actual_finish: '2026-10-05T09:00:00.000Z', timeliness: 'ON_PLAN', delay_note: '' }
vi.mock('../components/ActualDatesModal', () => ({
  ActualDatesModal: ({ onConfirm }: { onConfirm: (v: ActualDatesValue) => void }) => (
    <button onClick={() => onConfirm(ACTUALS)}>Confirm dates</button>
  ),
  EditActualDatesButton: () => null,
}))

afterEach(() => vi.clearAllMocks())

function makeMark(overrides: Partial<WoMark> = {}): WoMark {
  return {
    id: 1,
    bom_assembly_id: 1,
    bom_assembly: {
      id: 1, assembly_mark: 'A1', name: null, length_mm: null, surface_area_m2: null,
      weight_kg: null, width_mm: null, height_mm: null,
      dispatch: { id: 1, project_id: 1, project: null, zone: null, sub_zone: null },
    },
    bom_dispatch_id_snapshot: 1,
    snapshot_dispatch: null,
    qty_planned: 5,
    qty_not_started: 0,
    qty_in_progress: 0,
    qty_done: 5,
    qty_qc_passed: 5,
    qty_rework: 0,
    qty_renew: 0,
    removed_at: null,
    removed_by: null,
    removed_reason: null,
    created_at: '2026-10-01T00:00:00Z',
    created_by: 'tester',
    bom_version_status: null,
    duration_breakdown: [],
    ...overrides,
  }
}

function makeWo(overrides: Partial<WoDetailT> = {}): WoDetailT {
  return {
    id: 7, wo_code: 'WO-00000007', status: 'IN_PROGRESS', mo_id: 3,
    source_routing_op_id: null, sequence: 1, work_center_id: 1, expected_duration_min: 0, setup_time_min: 0, op_attributes: {},
    plan_start: null, plan_finish: null, actual_start: null, actual_finish: null, timeliness: null, delay_note: null, pre_hold_status: null,
    assigned_to: null, subcontractor: null, notes: null, released_at: null, released_by: null,
    created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', created_by: 'tester', updated_by: null,
    manufacturing_order: { id: 3, mo_code: 'MO-3', status: 'IN_PROGRESS', primary_mark_prefix_code: 'CO', primary_mark_prefix: { code: 'CO' } },
    mrp_workcenter: { id: 1, code: 'WC', name: 'Weld', machine: null },
    mark_prefix: { code: 'CO' },
    marks: [makeMark()],
    source_routing_op: null,
    consumes: [],
    parts: [],
    ...overrides,
  } as unknown as WoDetailT
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/wo/7']}>
      <Routes><Route path="/wo/:id" element={<WoDetail />} /></Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  wo = makeWo()
  events = []
  eventsLoading = false
  refetch.mockImplementation(async () => ({ data: wo }))
})

describe('WoDetail — Complete', () => {
  it('submits the typed actuals WITHOUT marks — progress is already saved per mark', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Complete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm dates' }))

    expect(doneMutate).toHaveBeenCalledTimes(1)
    const [body] = doneMutate.mock.calls[0]
    expect(body).toEqual({ actual_start: ACTUALS.actual_start, actual_finish: ACTUALS.actual_finish, timeliness: 'ON_PLAN', delay_note: '' })
    expect(body).not.toHaveProperty('marks')
    expect(body).not.toHaveProperty('notes')
  })

  // User 2026-10-05: removed — the Complete modal is where completion details go.
  it('has no "Completion notes" field on the page', () => {
    renderPage()
    expect(screen.queryByText('Completion notes (optional)')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/Notes to record/)).not.toBeInTheDocument()
  })

  it('is not offered while a mark\'s saved QC Passed is blank, even against a Quantity of 0', () => {
    wo = makeWo({ marks: [makeMark({ qty_planned: 0, qty_done: null, qty_qc_passed: null })] })
    renderPage()
    expect(screen.queryByRole('button', { name: 'Complete' })).not.toBeInTheDocument()
  })
})

describe('WoDetail — Events tab', () => {
  it('labels a PROGRESS_UPDATE "Progress updated" with its mark and renders the changes', () => {
    events = [{
      id: 1, work_order_id: 7, work_order_mark_id: 1, event_type: 'PROGRESS_UPDATE', notes: null,
      changes: [{ field: 'qty_done', old: 5, new: 8 }, { field: 'qty_qc_passed', old: 4, new: 6 }],
      recorded_by: 'tao', recorded_at: '2026-10-05T08:00:00Z',
    }]
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Events' }))

    expect(screen.getByText('Progress updated')).toBeInTheDocument()
    expect(screen.getByText('· A1')).toBeInTheDocument()
    expect(screen.getByText('Done 5 → 8, QC Passed 4 → 6')).toBeInTheDocument()
  })
})

describe('WoDetail — mark edit panel wiring', () => {
  it('✎ reloads with throwOnError (so a failed reload reaches the table) and the panel shows the events loading state', async () => {
    eventsLoading = true
    renderPage()
    fireEvent.click(screen.getByTitle('Edit qty'))
    // History starts hidden — open it to see the loading state.
    fireEvent.click(await screen.findByRole('button', { name: /show history/i }))

    const region = await screen.findByRole('region', { name: 'History' })
    expect(within(region).getByText('Loading history…')).toBeInTheDocument()
    expect(refetch).toHaveBeenCalledWith({ throwOnError: true })
  })
})
