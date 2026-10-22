import { useState } from 'react'
import { render, fireEvent } from '@testing-library/react'
import { toast } from 'sonner'
import { ProgressEditFields } from './ProgressEditForm'
import { rowToDraft } from './progressEditShared'
import type { ProgressZoneRow, UpdateAssemblyProgressPayload } from '../../api/projectProgress'
import { FAB_STAGES } from '../../api/projectProgress'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, login: 'admin', name: 'Admin', role: 'admin', job_title: null, permissions: {} } }),
}))
afterEach(() => vi.clearAllMocks())

// 2026-10-22 (dateInputGuard rollout): ProgressEditFields renders three
// date-pair sections (Fab / Transport / Erection). Fab and Erection both
// show the SAME on-screen column header ("Plan Finish" / "Actual Finish")
// — DATE_GUARD_LABEL in progressEditShared.ts exists specifically to keep
// their guard toasts distinguishable. This covers that disambiguation,
// not just "the guard fires somewhere".
function makeRow(): ProgressZoneRow {
  return {
    assembly_id: 1,
    mark: 'M1',
    is_placeholder: false,
    stale: false,
    weight_kg: 100,
    qty: 1,
    fab_plan_finish_date: null,
    fab_actual_finish_date: null,
    plan_load_date: null,
    actual_load_date: null,
    loaded_pcs: 0,
    erected_pcs: 0,
    erection_plan_finish_date: null,
    erection_actual_finish_date: null,
    payment_status: 'Not Disbursed',
    fab_pct: 0,
    load_pct: 0,
    erect_pct: 0,
    ...Object.fromEntries(FAB_STAGES.map(s => [s, 0])),
  } as ProgressZoneRow
}

function Harness({ row }: { row: ProgressZoneRow }) {
  const [draft, setDraft] = useState<UpdateAssemblyProgressPayload>(() => rowToDraft(row))
  return (
    <ProgressEditFields row={row} draft={draft} onChange={updater => setDraft(updater)} saving={false} onSave={() => {}} onCancel={() => {}} />
  )
}

describe('ProgressEditFields date inputs', () => {
  it('toasts "Fab Actual Finish" (not the ambiguous bare label) and clears it on an out-of-range year', () => {
    const row = makeRow()
    const { container } = render(<Harness row={row} />)
    const dateInputs = container.querySelectorAll('input[type="date"]')
    // Render order: Fab [plan, actual], Transport [plan, actual], Erection [plan, actual]
    const fabActual = dateInputs[1] as HTMLInputElement

    fireEvent.change(fabActual, { target: { value: '2101-05-20' } })
    fireEvent.blur(fabActual)

    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Fab Actual Finish'))
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('วันที่ไม่ถูกต้อง'))
    expect(fabActual.value).toBe('')
  })

  it('toasts "Erection Actual Finish" for the same out-of-range value on the Erection field — distinct from Fab', () => {
    const row = makeRow()
    const { container } = render(<Harness row={row} />)
    const dateInputs = container.querySelectorAll('input[type="date"]')
    const erectionActual = dateInputs[5] as HTMLInputElement

    fireEvent.change(erectionActual, { target: { value: '1999-01-01' } })
    fireEvent.blur(erectionActual)

    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Erection Actual Finish'))
    expect(erectionActual.value).toBe('')
  })

  it('accepts a valid in-range date without toasting', () => {
    const row = makeRow()
    const { container } = render(<Harness row={row} />)
    const dateInputs = container.querySelectorAll('input[type="date"]')
    const planLoad = dateInputs[2] as HTMLInputElement

    fireEvent.change(planLoad, { target: { value: '2026-10-22' } })
    fireEvent.blur(planLoad)

    expect(toast.error).not.toHaveBeenCalled()
    expect(planLoad.value).toBe('2026-10-22')
  })
})
