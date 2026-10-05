import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { AxiosError, type AxiosResponse } from 'axios'
import { toast } from 'sonner'
import { WoMarksTable } from './WoMarksTable'
import type { BomVersionStatus, WoEvent, WoMark } from '../../api/wo'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

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
    qty_planned: 10,
    qty_not_started: null,
    qty_in_progress: null,
    qty_done: null,
    qty_qc_passed: null,
    qty_rework: null,
    qty_renew: null,
    removed_at: null,
    removed_by: null,
    removed_reason: null,
    created_at: '2026-01-01T00:00:00Z',
    created_by: 'tester',
    bom_version_status: null,
    duration_breakdown: [],
    ...overrides,
  }
}

function makeBom(overrides: Partial<BomVersionStatus> = {}): BomVersionStatus {
  return {
    work_order_mark_id: 1,
    bom_assembly_id: 1,
    assembly_mark: 'A1',
    is_outdated: true,
    delta_types: ['SPEC_CHANGED'],
    delta_details: null,
    snapshot_dispatch_id: 1,
    latest_dispatch_id: 2,
    ...overrides,
  }
}

function makeEvent(overrides: Partial<WoEvent> = {}): WoEvent {
  return {
    id: 1,
    work_order_id: 1,
    work_order_mark_id: 1,
    event_type: 'PROGRESS_UPDATE',
    notes: null,
    changes: null,
    recorded_by: 'tester',
    recorded_at: '2026-10-01T08:00:00Z',
    ...overrides,
  }
}

function httpError(status: number, data: unknown) {
  return new AxiosError('Request failed', undefined, undefined, undefined, { status, data } as AxiosResponse)
}

function baseProps(overrides: Partial<React.ComponentProps<typeof WoMarksTable>> = {}) {
  const marks = overrides.marks ?? [makeMark()]
  return {
    marks,
    bomVersionStatus: [],
    events: [],
    // The reload resolves to the same marks by default — tests that need the
    // server to have moved on override it.
    onReloadMarks: vi.fn().mockResolvedValue(marks),
    onSaveProgress: vi.fn().mockResolvedValue(undefined),
    savePending: false,
    canEditQty: true,
    canModify: true,
    onRemove: vi.fn().mockResolvedValue(undefined),
    onAcceptVersion: vi.fn().mockResolvedValue(undefined),
    removePending: false,
    acceptPending: false,
    ...overrides,
  }
}

describe('WoMarksTable — rendering', () => {
  it('renders only non-removed marks, with a removed-count footer note', () => {
    const marks = [
      makeMark({ id: 1, bom_assembly_id: 1, bom_assembly: { ...makeMark().bom_assembly, assembly_mark: 'A1' } }),
      makeMark({ id: 2, bom_assembly_id: 2, bom_assembly: { ...makeMark().bom_assembly, assembly_mark: 'A2' }, removed_at: '2026-01-02T00:00:00Z' }),
    ]
    render(<WoMarksTable {...baseProps({ marks })} />)

    expect(screen.getByText('A1')).toBeInTheDocument()
    expect(screen.queryByText('A2')).not.toBeInTheDocument()
    expect(screen.getByText(/1 removed/)).toBeInTheDocument()
  })

  it('shows an outdated badge when the mark\'s bom-version-status is_outdated', () => {
    render(<WoMarksTable {...baseProps({ bomVersionStatus: [makeBom()] })} />)
    expect(screen.getByText('outdated')).toBeInTheDocument()
  })

  it('shows no outdated badge when up to date', () => {
    render(<WoMarksTable {...baseProps({ bomVersionStatus: [makeBom({ is_outdated: false, delta_types: [] })] })} />)
    expect(screen.queryByText('outdated')).not.toBeInTheDocument()
  })

  it('shows the footer aggregate totals across all active marks', () => {
    const marks = [
      makeMark({ id: 1, bom_assembly_id: 1, qty_planned: 10, qty_done: 4 }),
      makeMark({ id: 2, bom_assembly_id: 2, qty_planned: 5, qty_done: 5, bom_assembly: { ...makeMark().bom_assembly, assembly_mark: 'A2' } }),
    ]
    render(<WoMarksTable {...baseProps({ marks })} />)
    // Planned total 15, Done total 9 — both appear as table cells.
    expect(screen.getByText('15')).toBeInTheDocument()
    expect(screen.getByText('9')).toBeInTheDocument()
  })
})

describe('WoMarksTable — last-mark remove gating', () => {
  it('does not offer "remove" when this is the WO\'s only mark — shows a note instead', () => {
    render(<WoMarksTable {...baseProps()} />)
    expect(screen.queryByTitle('Remove this mark')).not.toBeInTheDocument()
    expect(screen.getByText('only mark')).toBeInTheDocument()
  })

  it('offers "remove" once there is more than one active mark', () => {
    const marks = [
      makeMark({ id: 1, bom_assembly_id: 1 }),
      makeMark({ id: 2, bom_assembly_id: 2, bom_assembly: { ...makeMark().bom_assembly, assembly_mark: 'A2' } }),
    ]
    render(<WoMarksTable {...baseProps({ marks })} />)
    expect(screen.getAllByTitle('Remove this mark')).toHaveLength(2)
  })

  it('hides remove entirely when canModify is false', () => {
    const marks = [
      makeMark({ id: 1, bom_assembly_id: 1 }),
      makeMark({ id: 2, bom_assembly_id: 2, bom_assembly: { ...makeMark().bom_assembly, assembly_mark: 'A2' } }),
    ]
    render(<WoMarksTable {...baseProps({ marks, canModify: false })} />)
    expect(screen.queryByTitle('Remove this mark')).not.toBeInTheDocument()
  })
})

describe('WoMarksTable — remove-mark modal', () => {
  function twoMarks() {
    return [
      makeMark({ id: 1, bom_assembly_id: 1 }),
      makeMark({ id: 2, bom_assembly_id: 2, bom_assembly: { ...makeMark().bom_assembly, assembly_mark: 'A2' } }),
    ]
  }

  it('submits { reason } with no QC breakdown when qty_done is 0', async () => {
    const onRemove = vi.fn().mockResolvedValue(undefined)
    render(<WoMarksTable {...baseProps({ marks: twoMarks(), onRemove })} />)

    fireEvent.click(screen.getAllByTitle('Remove this mark')[0])
    fireEvent.change(screen.getByPlaceholderText('Reason…'), { target: { value: 'wrong mark added' } })
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    expect(onRemove).toHaveBeenCalledWith(1, { reason: 'wrong mark added', qty_qc_passed: undefined, qty_rework: undefined, qty_renew: undefined })
  })

  it('requires a valid QC breakdown when the mark already has qty_done > 0', () => {
    const onRemove = vi.fn().mockResolvedValue(undefined)
    const marks = [
      makeMark({ id: 1, bom_assembly_id: 1, qty_done: 6 }),
      makeMark({ id: 2, bom_assembly_id: 2, bom_assembly: { ...makeMark().bom_assembly, assembly_mark: 'A2' } }),
    ]
    render(<WoMarksTable {...baseProps({ marks, onRemove })} />)

    fireEvent.click(screen.getAllByTitle('Remove this mark')[0])
    fireEvent.change(screen.getByPlaceholderText('Reason…'), { target: { value: 'scrap it' } })
    const removeButton = screen.getByRole('button', { name: 'Remove' })
    expect(removeButton).toBeDisabled()

    // QcBreakdownFields' NumField wraps its <input> inside its <label>
    // (unlike the retired single-field QtyReusableField), so getByLabelText
    // resolves each of the 3 fields unambiguously.
    fireEvent.change(screen.getByLabelText('QC Passed'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Rework'), { target: { value: '1' } })
    expect(removeButton).not.toBeDisabled()
    fireEvent.click(removeButton)
    expect(onRemove).toHaveBeenCalledWith(1, { reason: 'scrap it', qty_qc_passed: 3, qty_rework: 1, qty_renew: undefined })
  })

  it('accepts a deliberate all-zero breakdown (everything produced so far is worthless)', () => {
    const onRemove = vi.fn().mockResolvedValue(undefined)
    const marks = [
      makeMark({ id: 1, bom_assembly_id: 1, qty_done: 6 }),
      makeMark({ id: 2, bom_assembly_id: 2, bom_assembly: { ...makeMark().bom_assembly, assembly_mark: 'A2' } }),
    ]
    render(<WoMarksTable {...baseProps({ marks, onRemove })} />)

    fireEvent.click(screen.getAllByTitle('Remove this mark')[0])
    fireEvent.change(screen.getByPlaceholderText('Reason…'), { target: { value: 'total loss' } })
    fireEvent.change(screen.getByLabelText('Renew'), { target: { value: '0' } })
    const removeButton = screen.getByRole('button', { name: 'Remove' })
    expect(removeButton).not.toBeDisabled()
    fireEvent.click(removeButton)
    expect(onRemove).toHaveBeenCalledWith(1, { reason: 'total loss', qty_qc_passed: undefined, qty_rework: undefined, qty_renew: 0 })
  })
})

describe('WoMarksTable — accept-new-version modal', () => {
  it('is only offered when outdated and not REMOVED', () => {
    render(<WoMarksTable {...baseProps({ bomVersionStatus: [makeBom({ delta_types: ['REMOVED'] })] })} />)
    expect(screen.queryByTitle('Accept new BOM version')).not.toBeInTheDocument()
  })

  it('submits note/apply_to_other_wos, omitting the QC breakdown when not needed', async () => {
    const onAcceptVersion = vi.fn().mockResolvedValue(undefined)
    render(<WoMarksTable {...baseProps({ bomVersionStatus: [makeBom()], onAcceptVersion })} />)

    fireEvent.click(screen.getByTitle('Accept new BOM version'))
    fireEvent.change(screen.getByPlaceholderText('Optional note…'), { target: { value: 'ok to proceed' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /also apply to other work orders/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))

    expect(onAcceptVersion).toHaveBeenCalledWith(1, { note: 'ok to proceed', qty_qc_passed: undefined, qty_rework: undefined, qty_renew: undefined, apply_to_other_wos: true })
  })

  it('requires a valid QC breakdown when qty_done already exceeds the new target qty', () => {
    const onAcceptVersion = vi.fn().mockResolvedValue(undefined)
    const marks = [makeMark({ qty_done: 10 })]
    const bom = makeBom({ delta_types: ['QTY_CHANGED'], delta_details: { qty: { from: 12, to: 8 } } })
    render(<WoMarksTable {...baseProps({ marks, bomVersionStatus: [bom], onAcceptVersion })} />)

    fireEvent.click(screen.getByTitle('Accept new BOM version'))
    const acceptButton = screen.getByRole('button', { name: 'Accept' })
    expect(acceptButton).toBeDisabled()

    fireEvent.change(screen.getByLabelText('QC Passed'), { target: { value: '2' } })
    expect(acceptButton).not.toBeDisabled()
    fireEvent.click(acceptButton)
    expect(onAcceptVersion).toHaveBeenCalledWith(1, { note: undefined, qty_qc_passed: 2, qty_rework: undefined, qty_renew: undefined, apply_to_other_wos: false })
  })
})


// ✎ reloads first (await), so the expand-row inputs appear asynchronously.
async function openEditor(index = 0) {
  fireEvent.click(screen.getAllByTitle('Edit qty')[index])
  return screen.findAllByRole('spinbutton')
}

describe('WoMarksTable — qty editing (server-seeded, saved on Confirm)', () => {
  it('clicking ✎ reloads the WO first, then seeds the inputs from the reloaded values', async () => {
    const onReloadMarks = vi.fn().mockResolvedValue([makeMark({ qty_done: 4, qty_qc_passed: 3 })])
    render(<WoMarksTable {...baseProps({ marks: [makeMark({ qty_done: null })], onReloadMarks })} />)

    // Expand-row field order: Not Started, In Progress, Qty Done, QC Passed, Rework, Renew.
    const [, , doneInput, qcPassedInput] = await openEditor()
    expect(onReloadMarks).toHaveBeenCalledTimes(1)
    expect(doneInput).toHaveValue(4)
    expect(qcPassedInput).toHaveValue(3)
  })

  it('typing stages locally — onSaveProgress is NOT called until Confirm', async () => {
    const onSaveProgress = vi.fn().mockResolvedValue(undefined)
    render(<WoMarksTable {...baseProps({ onSaveProgress })} />)

    const [notStartedInput, inProgressInput, doneInput] = await openEditor()
    fireEvent.change(notStartedInput, { target: { value: '2' } })
    fireEvent.change(inProgressInput, { target: { value: '3' } })
    fireEvent.change(doneInput, { target: { value: '5' } })

    expect(onSaveProgress).not.toHaveBeenCalled()
    expect(notStartedInput).toHaveValue(2)
    expect(inProgressInput).toHaveValue(3)
    expect(doneInput).toHaveValue(5)
  })

  it('Confirm saves the six numbers (blank → 0) with expected = the values as loaded, toasts, then collapses', async () => {
    const onSaveProgress = vi.fn().mockResolvedValue(undefined)
    const loaded = makeMark({ qty_not_started: 10 })
    render(<WoMarksTable {...baseProps({ marks: [loaded], onReloadMarks: vi.fn().mockResolvedValue([loaded]), onSaveProgress })} />)

    const [notStartedInput, , doneInput] = await openEditor()
    fireEvent.change(notStartedInput, { target: { value: '3' } })
    fireEvent.change(doneInput, { target: { value: '7' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('A1 saved'))
    expect(onSaveProgress).toHaveBeenCalledWith(1, {
      qty_not_started: 3, qty_in_progress: 0, qty_done: 7, qty_qc_passed: 0, qty_rework: 0, qty_renew: 0,
      expected: { qty_not_started: 10, qty_in_progress: null, qty_done: null, qty_qc_passed: null, qty_rework: null, qty_renew: null },
    })
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
    expect(screen.getByTitle('Edit qty')).toBeInTheDocument()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('a 409 STALE_PROGRESS toasts "updated by someone else", reloads, re-seeds the inputs and keeps the row open', async () => {
    const onReloadMarks = vi.fn()
      .mockResolvedValueOnce([makeMark({ qty_done: 2 })])
      .mockResolvedValueOnce([makeMark({ qty_done: 5 })])
    const onSaveProgress = vi.fn()
      .mockRejectedValueOnce(httpError(409, { message: 'This mark was updated by someone else — latest values reloaded', code: 'STALE_PROGRESS' }))
      .mockResolvedValueOnce(undefined)
    render(<WoMarksTable {...baseProps({ onReloadMarks, onSaveProgress })} />)

    const [, , doneInput] = await openEditor()
    expect(doneInput).toHaveValue(2)
    fireEvent.change(doneInput, { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('updated by someone else')))
    await waitFor(() => expect(screen.getAllByRole('spinbutton')[2]).toHaveValue(5))
    expect(onReloadMarks).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
    expect(toast.success).not.toHaveBeenCalled()

    // The next save sends the RE-loaded values as `expected`.
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('A1 saved'))
    expect(onSaveProgress).toHaveBeenLastCalledWith(1, expect.objectContaining({
      qty_done: 5,
      expected: expect.objectContaining({ qty_done: 5 }),
    }))
  })

  it.each([
    ['a 400', 400, 'QC Passed + Rework + Renew exceeds Done'],
    ['a non-stale 409 (status gate)', 409, 'Progress can only be recorded while the work order is in progress or paused (status ON_HOLD)'],
  ])('%s toasts the server message and keeps the row open without reloading', async (_label, status, message) => {
    const onReloadMarks = vi.fn().mockResolvedValue([makeMark()])
    const onSaveProgress = vi.fn().mockRejectedValue(httpError(status, { message }))
    render(<WoMarksTable {...baseProps({ onReloadMarks, onSaveProgress })} />)

    const [, , doneInput] = await openEditor()
    fireEvent.change(doneInput, { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message))
    expect(onReloadMarks).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
    expect(doneInput).toHaveValue(4)
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('Confirm shows an error toast and does NOT save when Not Started + In Progress + Done exceeds Quantity', async () => {
    const onSaveProgress = vi.fn()
    render(<WoMarksTable {...baseProps({ marks: [makeMark({ qty_planned: 5 })], onSaveProgress })} />)

    const [notStartedInput, inProgressInput, doneInput] = await openEditor()
    fireEvent.change(notStartedInput, { target: { value: '2' } })
    fireEvent.change(inProgressInput, { target: { value: '2' } })
    fireEvent.change(doneInput, { target: { value: '2' } }) // 2+2+2=6 > 5
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Not Started + In Progress + Done exceeds Quantity'))
    expect(toast.success).not.toHaveBeenCalled()
    expect(onSaveProgress).not.toHaveBeenCalled()
    // Row stays open — the draft is preserved, not discarded.
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
    expect(notStartedInput).toHaveValue(2)
  })

  it('Confirm shows an error toast and does NOT save when QC Passed + Rework + Renew exceeds Qty Done', async () => {
    const onSaveProgress = vi.fn()
    render(<WoMarksTable {...baseProps({ marks: [makeMark({ qty_planned: 10 })], onSaveProgress })} />)

    const [, , doneInput, qcPassedInput, reworkInput] = await openEditor()
    fireEvent.change(doneInput, { target: { value: '5' } })
    fireEvent.change(qcPassedInput, { target: { value: '3' } })
    fireEvent.change(reworkInput, { target: { value: '3' } }) // 3+3=6 > 5
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('QC Passed + Rework + Renew exceeds Qty Done'))
    expect(toast.success).not.toHaveBeenCalled()
    expect(onSaveProgress).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
  })

  it('disables Confirm while a save is pending', async () => {
    render(<WoMarksTable {...baseProps({ savePending: true })} />)
    await openEditor()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
  })

  it('Cancel (the panel button) discards the staged draft — nothing is saved', async () => {
    const onSaveProgress = vi.fn()
    render(<WoMarksTable {...baseProps({ onSaveProgress })} />)

    const [, , doneInput] = await openEditor()
    fireEvent.change(doneInput, { target: { value: '7' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onSaveProgress).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    expect(screen.getByTitle('Edit qty')).toBeInTheDocument()
  })

  it('the row\'s own top-right icon also discards the draft while expanded (same as the panel\'s Cancel)', async () => {
    const onSaveProgress = vi.fn()
    render(<WoMarksTable {...baseProps({ onSaveProgress })} />)

    const [, , doneInput] = await openEditor()
    expect(screen.queryByTitle('Edit qty')).not.toBeInTheDocument()
    fireEvent.change(doneInput, { target: { value: '7' } })
    fireEvent.click(screen.getByTitle('Close (discards unconfirmed changes)'))

    expect(onSaveProgress).not.toHaveBeenCalled()
    expect(screen.getByTitle('Edit qty')).toBeInTheDocument()
  })

  it('clamps a staged value to [0, qty_planned] while typing, same as the max/min fix', async () => {
    render(<WoMarksTable {...baseProps({ marks: [makeMark({ qty_planned: 1 })] })} />)

    const [notStartedInput] = await openEditor()
    fireEvent.change(notStartedInput, { target: { value: '32' } })
    expect(notStartedInput).toHaveValue(1)
    fireEvent.change(notStartedInput, { target: { value: '-5' } })
    expect(notStartedInput).toHaveValue(0)
  })

  it('does not show the edit action when canEditQty is false', () => {
    render(<WoMarksTable {...baseProps({ canEditQty: false })} />)
    expect(screen.queryByTitle('Edit qty')).not.toBeInTheDocument()
  })

  // Fix wave 2026-10-05: reload guards.
  function deferred<T>() {
    let resolve!: (v: T) => void
    let reject!: (e: unknown) => void
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
    return { promise, resolve, reject }
  }
  const stale409 = () => httpError(409, { message: 'This mark was updated by someone else — latest values reloaded', code: 'STALE_PROGRESS' })

  it('disables every ✎ toggle while the ✎ reload is in flight, so it cannot be re-triggered', async () => {
    const marks = [
      makeMark({ id: 1, bom_assembly_id: 1 }),
      makeMark({ id: 2, bom_assembly_id: 2, bom_assembly: { ...makeMark().bom_assembly, assembly_mark: 'A2' } }),
    ]
    const reload = deferred<WoMark[]>()
    const onReloadMarks = vi.fn().mockReturnValue(reload.promise)
    render(<WoMarksTable {...baseProps({ marks, onReloadMarks })} />)

    fireEvent.click(screen.getAllByTitle('Edit qty')[0])
    await waitFor(() => screen.getAllByTitle('Edit qty').forEach(b => expect(b).toBeDisabled()))
    fireEvent.click(screen.getAllByTitle('Edit qty')[0])
    fireEvent.click(screen.getAllByTitle('Edit qty')[1])
    expect(onReloadMarks).toHaveBeenCalledTimes(1)

    reload.resolve(marks)
    expect(await screen.findByRole('button', { name: 'Confirm' })).not.toBeDisabled()
    expect(screen.getByTitle('Close (discards unconfirmed changes)')).not.toBeDisabled()
  })

  it('disables Confirm and the close toggle while the post-409 reload is in flight', async () => {
    const second = deferred<WoMark[]>()
    const onReloadMarks = vi.fn().mockResolvedValueOnce([makeMark({ qty_done: 2 })]).mockReturnValueOnce(second.promise)
    const onSaveProgress = vi.fn().mockRejectedValueOnce(stale409())
    render(<WoMarksTable {...baseProps({ onReloadMarks, onSaveProgress })} />)

    await openEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled())
    expect(screen.getByTitle('Close (discards unconfirmed changes)')).toBeDisabled()

    second.resolve([makeMark({ qty_done: 5 })])
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm' })).not.toBeDisabled())
    expect(screen.getAllByRole('spinbutton')[2]).toHaveValue(5)
  })

  it('a failed ✎ reload toasts "Couldn\'t load the latest values — try again" and leaves the row closed', async () => {
    const onReloadMarks = vi.fn().mockRejectedValue(new Error('Network Error'))
    render(<WoMarksTable {...baseProps({ onReloadMarks })} />)

    fireEvent.click(screen.getByTitle('Edit qty'))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't load the latest values — try again"))
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
    expect(screen.getByTitle('Edit qty')).not.toBeDisabled()
  })

  it('a failed post-409 reload toasts the same error and closes the row (its `expected` is stale)', async () => {
    const onReloadMarks = vi.fn().mockResolvedValueOnce([makeMark()]).mockRejectedValueOnce(new Error('Network Error'))
    const onSaveProgress = vi.fn().mockRejectedValueOnce(stale409())
    render(<WoMarksTable {...baseProps({ onReloadMarks, onSaveProgress })} />)

    await openEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't load the latest values — try again"))
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
    expect(screen.getByTitle('Edit qty')).not.toBeDisabled()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('Cancel during the post-409 reload wins — the row stays closed when the reload lands', async () => {
    const second = deferred<WoMark[]>()
    const onReloadMarks = vi.fn().mockResolvedValueOnce([makeMark()]).mockReturnValueOnce(second.promise)
    const onSaveProgress = vi.fn().mockRejectedValueOnce(stale409())
    render(<WoMarksTable {...baseProps({ onReloadMarks, onSaveProgress })} />)

    await openEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled())
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    second.resolve([makeMark({ qty_done: 5 })])

    await waitFor(() => expect(screen.getByTitle('Edit qty')).not.toBeDisabled())
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
  })

  it('has no bulk-select checkboxes', () => {
    const marks = [
      makeMark({ id: 1, bom_assembly_id: 1 }),
      makeMark({ id: 2, bom_assembly_id: 2, bom_assembly: { ...makeMark().bom_assembly, assembly_mark: 'A2' } }),
    ]
    render(<WoMarksTable {...baseProps({ marks })} />)
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  })
})

// Amended D2 (user, 2026-10-05): "ไม่ต้องมีปุ่มดู history แยก เวลากดแก้ไขแล้ว
// แสดง history ด้านล่างเลย" — no History button/modal; the open ✎ panel lists
// the mark's history below the inputs.
describe('WoMarksTable — history inside the edit panel', () => {
  const twoMarks = () => [
    makeMark({ id: 1, bom_assembly_id: 1 }),
    makeMark({ id: 2, bom_assembly_id: 2, bom_assembly: { ...makeMark().bom_assembly, assembly_mark: 'A2' } }),
  ]
  // Header row first, then one row per event: six change cells aligned under
  // the inputs (Not Started … Renew), then "When · By", then "Note".
  const historyRows = () =>
    within(screen.getByRole('region', { name: 'History' }))
      .queryAllByRole('row').slice(1)
      .map(r => within(r).getAllByRole('cell').map(c => c.textContent ?? ''))
  const WHEN_BY = (who: string) => new RegExp(String.raw`^\d\d/\d\d \d\d:\d\d${who}$`)
  // History starts hidden (user 2026-10-05: "default เป็น hide ไว้ก่อนอยากดูค่อยเปิด").
  const showHistory = () => fireEvent.click(screen.getByRole('button', { name: /show history/i }))

  it('has no History button — for editors or read-only viewers', () => {
    const { unmount } = render(<WoMarksTable {...baseProps()} />)
    expect(screen.queryByTitle('History')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /history/i })).not.toBeInTheDocument()
    unmount()
    render(<WoMarksTable {...baseProps({ canEditQty: false, canModify: false })} />)
    expect(screen.queryByTitle('History')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'History' })).not.toBeInTheDocument()
  })

  it('shows nothing until ✎ opens the panel', () => {
    render(<WoMarksTable {...baseProps({ events: [makeEvent()] })} />)
    expect(screen.queryByRole('region', { name: 'History' })).not.toBeInTheDocument()
  })

  it('renders the history as a table aligned with the inputs — only this mark, newest first, noise hidden', async () => {
    const events = [
      makeEvent({ id: 1, work_order_mark_id: 1, recorded_at: '2026-10-01T08:00:00Z', recorded_by: 'alice', notes: 'Start', changes: [{ field: 'qty_not_started', old: null, new: 10 }] }),
      makeEvent({ id: 2, work_order_mark_id: 2, recorded_at: '2026-10-01T09:00:00Z', recorded_by: 'bob', changes: [{ field: 'qty_done', old: 0, new: 3 }] }),
      makeEvent({ id: 3, work_order_mark_id: 1, recorded_at: '2026-10-02T08:00:00Z', recorded_by: 'carol', event_type: 'ACCEPT_VERSION', notes: 'Accepted BOM version → dispatch 2' }),
      makeEvent({ id: 4, work_order_mark_id: 1, recorded_at: '2026-10-03T08:00:00Z', recorded_by: 'dave', changes: [{ field: 'qty_done', old: 5, new: 8 }, { field: 'qty_qc_passed', old: 4, new: 6 }] }),
      makeEvent({ id: 5, work_order_mark_id: null, recorded_at: '2026-10-01T07:00:00Z', recorded_by: 'erin', event_type: 'START' }),
      makeEvent({ id: 6, work_order_mark_id: 1, recorded_at: '2026-10-04T08:00:00Z', recorded_by: 'frank', notes: 'Cancel disposition', changes: [{ field: 'qty_qc_passed', old: 3, new: 5 }] }),
      makeEvent({ id: 7, work_order_mark_id: 1, recorded_at: '2026-10-02T12:00:00Z', recorded_by: 'gina', event_type: 'ACCEPT_VERSION', notes: 'Accepted BOM version → dispatch 3', changes: [{ field: 'qty_planned', old: 10, new: 8 }] }),
      // Recorded before blank→0 stopped being logged: the — → 0 parts are noise.
      makeEvent({ id: 8, work_order_mark_id: 1, recorded_at: '2026-10-01T09:30:00Z', recorded_by: 'henry', changes: [{ field: 'qty_in_progress', old: null, new: 1 }, { field: 'qty_done', old: null, new: 0 }, { field: 'qty_qc_passed', old: null, new: 0 }] }),
      // Nothing but noise and no note → no row at all.
      makeEvent({ id: 9, work_order_mark_id: 1, recorded_at: '2026-10-01T09:45:00Z', recorded_by: 'ivan', changes: [{ field: 'qty_rework', old: null, new: 0 }] }),
    ]
    render(<WoMarksTable {...baseProps({ marks: twoMarks(), events })} />)
    await openEditor(0)
    showHistory()

    const region = screen.getByRole('region', { name: 'History' })
    expect(within(region).getAllByRole('columnheader').map(h => h.textContent)).toEqual(
      ['Not Started', 'In Progress', 'Qty Done', 'QC Passed', 'Rework', 'Renew', 'When · By', 'Note'],
    )
    const rows = historyRows()
    //            Not St    In Prog   Done      QC        Rework  Renew
    const expected: [string[], string, string][] = [
      [['', '', '', '3 → 5', '', ''], 'frank', 'Cancel disposition'],
      [['', '', '5 → 8', '4 → 6', '', ''], 'dave', ''],
      [['', '', '', '', '', ''], 'gina', 'BOM version accepted · Quantity 10 → 8'],
      [['', '', '', '', '', ''], 'carol', 'BOM version accepted'],
      [['', '– → 1', '', '', '', ''], 'henry', ''],
      [['– → 10', '', '', '', '', ''], 'alice', 'Start'],
    ]
    expect(rows).toHaveLength(expected.length) // bob (other mark), erin (WO-level), ivan (noise only) left out
    rows.forEach((cells, i) => {
      const [changeCells, who, note] = expected[i]
      expect(cells.slice(0, 6)).toEqual(changeCells)
      expect(cells[6]).toMatch(WHEN_BY(who))
      expect(cells[7]).toBe(note)
    })

    for (const control of [screen.getAllByRole('spinbutton')[5], screen.getByRole('button', { name: 'Confirm' }), screen.getByRole('button', { name: 'Cancel' })]) {
      expect(control.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it('follows the panel to the other mark', async () => {
    const events = [
      makeEvent({ id: 1, work_order_mark_id: 1, recorded_by: 'alice', changes: [{ field: 'qty_done', old: 1, new: 2 }] }),
      makeEvent({ id: 2, work_order_mark_id: 2, recorded_by: 'bob', changes: [{ field: 'qty_done', old: 0, new: 3 }] }),
    ]
    render(<WoMarksTable {...baseProps({ marks: twoMarks(), events })} />)
    await openEditor(1)
    showHistory()
    const rows = historyRows()
    expect(rows).toHaveLength(1)
    expect(rows[0][2]).toBe('0 → 3')
    expect(rows[0][6]).toMatch(WHEN_BY('bob'))
  })

  it('shows "Loading history…" while the events load', async () => {
    render(<WoMarksTable {...baseProps({ events: [], eventsLoading: true })} />)
    await openEditor()
    showHistory()
    const region = screen.getByRole('region', { name: 'History' })
    expect(within(region).getByText('Loading history…')).toBeInTheDocument()
    expect(within(region).queryByText('No progress recorded yet')).not.toBeInTheDocument()
  })

  it('shows "No progress recorded yet" when the mark has no events', async () => {
    render(<WoMarksTable {...baseProps({ events: [makeEvent({ work_order_mark_id: 99 })] })} />)
    await openEditor()
    showHistory()
    const region = screen.getByRole('region', { name: 'History' })
    expect(within(region).getByText('No progress recorded yet')).toBeInTheDocument()
    expect(within(region).queryByRole('table')).not.toBeInTheDocument()
  })

  // User 2026-10-05: "เอามาทำเป็นข้างๆ Dispatch #13 changed this mark ... ไว้เปิดปิด history"
  // — a toggle on the same line as the outdated note; history starts open.
  describe('show/hide toggle', () => {
    const events = [
      makeEvent({ id: 1, work_order_mark_id: 1, recorded_by: 'alice', changes: [{ field: 'qty_done', old: 1, new: 2 }] }),
      makeEvent({ id: 2, work_order_mark_id: 1, recorded_by: 'bob', changes: [{ field: 'qty_done', old: 2, new: 3 }] }),
    ]

    it('starts hidden with the count; Show history opens it and Hide history folds it away again', async () => {
      render(<WoMarksTable {...baseProps({ events })} />)
      await openEditor()
      expect(screen.queryByRole('region', { name: 'History' })).not.toBeInTheDocument()
      const show = screen.getByRole('button', { name: 'Show history (2)' })
      expect(show).toHaveAttribute('aria-expanded', 'false')
      // Icon only (user 2026-10-05: "เอาให้เหลือ icon อย่างเดียวพอ") — the count lives in the tooltip.
      expect(show).toHaveTextContent('')
      expect(show).toHaveAttribute('title', 'Show history (2)')

      fireEvent.click(show)
      expect(screen.getByRole('region', { name: 'History' })).toBeInTheDocument()
      const hide = screen.getByRole('button', { name: /hide history/i })
      expect(hide).toHaveAttribute('aria-expanded', 'true')

      fireEvent.click(hide)
      expect(screen.queryByRole('region', { name: 'History' })).not.toBeInTheDocument()
    })

    // User 2026-10-05: "เอาไปไว้ข้างปุ่ม cancel" — right after Cancel, not on the outdated note's line.
    it('sits right after Cancel in the Confirm/Cancel row, apart from the outdated note', async () => {
      render(<WoMarksTable {...baseProps({ events, bomVersionStatus: [makeBom()] })} />)
      await openEditor()
      const toggle = screen.getByRole('button', { name: /show history/i })
      expect(toggle.previousElementSibling).toBe(screen.getByRole('button', { name: 'Cancel' }))
      expect(screen.getByText(/changed this mark/).parentElement).not.toBe(toggle.parentElement)
    })

    it('is still offered when the mark is up to date (no note)', async () => {
      render(<WoMarksTable {...baseProps({ events, bomVersionStatus: [makeBom({ is_outdated: false, delta_types: [] })] })} />)
      await openEditor()
      expect(screen.queryByText(/changed this mark/)).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /show history/i })).toBeInTheDocument()
    })
  })
})
