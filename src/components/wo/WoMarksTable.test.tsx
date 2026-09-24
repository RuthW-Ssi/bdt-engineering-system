import { render, screen, fireEvent } from '@testing-library/react'
import { toast } from 'sonner'
import { WoMarksTable } from './WoMarksTable'
import type { BomVersionStatus, WoMark } from '../../api/wo'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

afterEach(() => vi.clearAllMocks())

function makeMark(overrides: Partial<WoMark> = {}): WoMark {
  return {
    id: 1,
    bom_assembly_id: 1,
    bom_assembly: {
      id: 1, assembly_mark: 'A1', name: null, length_mm: null, surface_area_m2: null,
      weight_kg: null, width_mm: null, height_mm: null,
      dispatch: { id: 1, project: null, zone: null, sub_zone: null },
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

function baseProps(overrides: Partial<React.ComponentProps<typeof WoMarksTable>> = {}) {
  return {
    marks: [makeMark()],
    bomVersionStatus: [],
    edits: {},
    onEditChange: vi.fn(),
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

describe('WoMarksTable — qty editing (stage, then Confirm/Cancel)', () => {
  it('typing in the expand-row inputs stages locally — onEditChange is NOT called yet', () => {
    const onEditChange = vi.fn()
    render(<WoMarksTable {...baseProps({ onEditChange })} />)

    fireEvent.click(screen.getByTitle('Edit qty'))
    // Expand-row field order: Not Started, In Progress, Qty Done, QC Passed, Rework, Renew.
    const [notStartedInput, inProgressInput, doneInput] = screen.getAllByRole('spinbutton')
    fireEvent.change(notStartedInput, { target: { value: '2' } })
    fireEvent.change(inProgressInput, { target: { value: '3' } })
    fireEvent.change(doneInput, { target: { value: '7' } })

    expect(onEditChange).not.toHaveBeenCalled()
    expect(notStartedInput).toHaveValue(2)
    expect(inProgressInput).toHaveValue(3)
    expect(doneInput).toHaveValue(7)
  })

  it('Confirm commits every staged field via onEditChange, then collapses the row', () => {
    const onEditChange = vi.fn()
    render(<WoMarksTable {...baseProps({ onEditChange })} />)

    fireEvent.click(screen.getByTitle('Edit qty'))
    const [notStartedInput, , doneInput] = screen.getAllByRole('spinbutton')
    fireEvent.change(notStartedInput, { target: { value: '2' } })
    fireEvent.change(doneInput, { target: { value: '7' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(onEditChange).toHaveBeenCalledWith(1, 'qty_not_started', '2')
    expect(onEditChange).toHaveBeenCalledWith(1, 'qty_done', '7')
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
    expect(screen.getByTitle('Edit qty')).toBeInTheDocument()
    expect(toast.success).toHaveBeenCalledWith('A1 updated')
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('Confirm shows an error toast and does NOT commit when Not Started + In Progress + Done exceeds Quantity', () => {
    const onEditChange = vi.fn()
    render(<WoMarksTable {...baseProps({ marks: [makeMark({ qty_planned: 5 })], onEditChange })} />)

    fireEvent.click(screen.getByTitle('Edit qty'))
    const [notStartedInput, inProgressInput, doneInput] = screen.getAllByRole('spinbutton')
    fireEvent.change(notStartedInput, { target: { value: '2' } })
    fireEvent.change(inProgressInput, { target: { value: '2' } })
    fireEvent.change(doneInput, { target: { value: '2' } }) // 2+2+2=6 > 5
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Not Started + In Progress + Done exceeds Quantity'))
    expect(toast.success).not.toHaveBeenCalled()
    expect(onEditChange).not.toHaveBeenCalled()
    // Row stays open — the draft is preserved, not discarded.
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeInTheDocument()
    expect(notStartedInput).toHaveValue(2)
  })

  it('Confirm shows an error toast and does NOT commit when QC Passed + Rework + Renew exceeds Qty Done', () => {
    const onEditChange = vi.fn()
    render(<WoMarksTable {...baseProps({ marks: [makeMark({ qty_planned: 10 })], onEditChange })} />)

    fireEvent.click(screen.getByTitle('Edit qty'))
    const [, , doneInput, qcPassedInput, reworkInput] = screen.getAllByRole('spinbutton')
    fireEvent.change(doneInput, { target: { value: '5' } })
    fireEvent.change(qcPassedInput, { target: { value: '3' } })
    fireEvent.change(reworkInput, { target: { value: '3' } }) // 3+3=6 > 5
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('QC Passed + Rework + Renew exceeds Qty Done'))
    expect(toast.success).not.toHaveBeenCalled()
    expect(onEditChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeInTheDocument()
  })

  it('Cancel (the panel button) discards the staged draft — onEditChange is never called', () => {
    const onEditChange = vi.fn()
    render(<WoMarksTable {...baseProps({ onEditChange })} />)

    fireEvent.click(screen.getByTitle('Edit qty'))
    const [, , doneInput] = screen.getAllByRole('spinbutton')
    fireEvent.change(doneInput, { target: { value: '7' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onEditChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    expect(screen.getByTitle('Edit qty')).toBeInTheDocument()
  })

  it('the row\'s own top-right icon also discards the draft while expanded (same as the panel\'s Cancel)', () => {
    const onEditChange = vi.fn()
    render(<WoMarksTable {...baseProps({ onEditChange })} />)

    fireEvent.click(screen.getByTitle('Edit qty'))
    expect(screen.queryByTitle('Edit qty')).not.toBeInTheDocument()
    const [, , doneInput] = screen.getAllByRole('spinbutton')
    fireEvent.change(doneInput, { target: { value: '7' } })
    fireEvent.click(screen.getByTitle('Close (discards unconfirmed changes)'))

    expect(onEditChange).not.toHaveBeenCalled()
    expect(screen.getByTitle('Edit qty')).toBeInTheDocument()
  })

  it('seeds the draft from the current effective value (edit-layered-over-server) on open', () => {
    render(<WoMarksTable {...baseProps({ marks: [makeMark({ qty_done: 4 })], edits: { 1: { qty_qc_passed: '3' } } })} />)

    fireEvent.click(screen.getByTitle('Edit qty'))
    const [, , doneInput, qcPassedInput] = screen.getAllByRole('spinbutton')
    expect(doneInput).toHaveValue(4)
    expect(qcPassedInput).toHaveValue(3)
  })

  it('clamps a staged value to [0, qty_planned] while typing, same as the max/min fix', () => {
    render(<WoMarksTable {...baseProps({ marks: [makeMark({ qty_planned: 1 })] })} />)

    fireEvent.click(screen.getByTitle('Edit qty'))
    const [notStartedInput] = screen.getAllByRole('spinbutton')
    fireEvent.change(notStartedInput, { target: { value: '32' } })
    expect(notStartedInput).toHaveValue(1)
    fireEvent.change(notStartedInput, { target: { value: '-5' } })
    expect(notStartedInput).toHaveValue(0)
  })

  it('reflects an edited value back in the collapsed row', () => {
    // Two marks with distinct totals so the edited "7" can only be the row
    // cell — a single-mark WO would make the row value and the footer's
    // aggregate collide on the same text, which is what this test used to do.
    const marks = [
      makeMark({ id: 1, bom_assembly_id: 1, qty_planned: 10, qty_done: 4 }),
      makeMark({ id: 2, bom_assembly_id: 2, qty_planned: 5, qty_done: 2, bom_assembly: { ...makeMark().bom_assembly, assembly_mark: 'A2' } }),
    ]
    render(<WoMarksTable {...baseProps({ marks, edits: { 1: { qty_done: '7' } } })} />)
    expect(screen.getByText('7')).toBeInTheDocument()
  })

  it('does not show the edit action when canEditQty is false', () => {
    render(<WoMarksTable {...baseProps({ canEditQty: false })} />)
    expect(screen.queryByTitle('Edit qty')).not.toBeInTheDocument()
  })

  it('checking a row\'s own checkbox while its edit panel is open closes the panel and discards the draft', () => {
    const onEditChange = vi.fn()
    render(<WoMarksTable {...baseProps({ onEditChange })} />)

    fireEvent.click(screen.getByTitle('Edit qty'))
    const [, , doneInput] = screen.getAllByRole('spinbutton')
    fireEvent.change(doneInput, { target: { value: '7' } })

    const rowCheckbox = screen.getAllByRole('checkbox').find(cb => cb !== screen.getByTitle('Select all'))!
    fireEvent.click(rowCheckbox)

    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
    expect(screen.getByTitle('Edit qty')).toBeInTheDocument()
    expect(onEditChange).not.toHaveBeenCalled()
    expect(rowCheckbox).toBeChecked()
  })

  it('checking a DIFFERENT row\'s checkbox also closes an open edit panel elsewhere', () => {
    const marks = [
      makeMark({ id: 1, bom_assembly_id: 1 }),
      makeMark({ id: 2, bom_assembly_id: 2, bom_assembly: { ...makeMark().bom_assembly, assembly_mark: 'A2' } }),
    ]
    render(<WoMarksTable {...baseProps({ marks })} />)

    fireEvent.click(screen.getAllByTitle('Edit qty')[0])
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()

    const rowCheckboxes = screen.getAllByRole('checkbox').filter(cb => cb !== screen.getByTitle('Select all'))
    fireEvent.click(rowCheckboxes[1])

    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
    expect(screen.getAllByTitle('Edit qty')).toHaveLength(2)
  })

  it('"Select all" also closes an open edit panel', () => {
    render(<WoMarksTable {...baseProps()} />)

    fireEvent.click(screen.getByTitle('Edit qty'))
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()

    fireEvent.click(screen.getByTitle('Select all'))

    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
    expect(screen.getByText('1 selected')).toBeInTheDocument()
  })
})

describe('WoMarksTable — bulk select + apply', () => {
  it('applies only the touched field(s) to every selected mark', () => {
    const onEditChange = vi.fn()
    const marks = [
      makeMark({ id: 1, bom_assembly_id: 1 }),
      makeMark({ id: 2, bom_assembly_id: 2, bom_assembly: { ...makeMark().bom_assembly, assembly_mark: 'A2' } }),
    ]
    render(<WoMarksTable {...baseProps({ marks, onEditChange })} />)

    const rowCheckboxes = screen.getAllByRole('checkbox').filter(cb => cb !== screen.getByTitle('Select all'))
    fireEvent.click(rowCheckboxes[0])
    fireEvent.click(rowCheckboxes[1])

    fireEvent.change(screen.getByLabelText('Set Qty Done'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: /apply to 2/i }))

    expect(onEditChange).toHaveBeenCalledWith(1, 'qty_done', '10')
    expect(onEditChange).toHaveBeenCalledWith(2, 'qty_done', '10')
    expect(onEditChange).not.toHaveBeenCalledWith(expect.anything(), 'qty_qc_passed', expect.anything())
  })

  it('bulk-applies a QC breakdown field too', () => {
    const onEditChange = vi.fn()
    const marks = [
      makeMark({ id: 1, bom_assembly_id: 1 }),
      makeMark({ id: 2, bom_assembly_id: 2, bom_assembly: { ...makeMark().bom_assembly, assembly_mark: 'A2' } }),
    ]
    render(<WoMarksTable {...baseProps({ marks, onEditChange })} />)

    fireEvent.click(screen.getByTitle('Select all'))
    fireEvent.change(screen.getByLabelText('Set QC Passed'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: /apply to 2/i }))

    expect(onEditChange).toHaveBeenCalledWith(1, 'qty_qc_passed', '5')
    expect(onEditChange).toHaveBeenCalledWith(2, 'qty_qc_passed', '5')
  })

  it('bulk-applies Not Started and In Progress, same as Done/QC Passed/Rework/Renew', () => {
    const onEditChange = vi.fn()
    const marks = [
      makeMark({ id: 1, bom_assembly_id: 1 }),
      makeMark({ id: 2, bom_assembly_id: 2, bom_assembly: { ...makeMark().bom_assembly, assembly_mark: 'A2' } }),
    ]
    render(<WoMarksTable {...baseProps({ marks, onEditChange })} />)

    fireEvent.click(screen.getByTitle('Select all'))
    fireEvent.change(screen.getByLabelText('Set Not Started'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Set In Progress'), { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: /apply to 2/i }))

    expect(onEditChange).toHaveBeenCalledWith(1, 'qty_not_started', '1')
    expect(onEditChange).toHaveBeenCalledWith(2, 'qty_not_started', '1')
    expect(onEditChange).toHaveBeenCalledWith(1, 'qty_in_progress', '4')
    expect(onEditChange).toHaveBeenCalledWith(2, 'qty_in_progress', '4')
  })

  it('selects/deselects all active marks via the header checkbox', () => {
    const marks = [
      makeMark({ id: 1, bom_assembly_id: 1 }),
      makeMark({ id: 2, bom_assembly_id: 2, bom_assembly: { ...makeMark().bom_assembly, assembly_mark: 'A2' } }),
    ]
    render(<WoMarksTable {...baseProps({ marks })} />)

    fireEvent.click(screen.getByTitle('Select all'))
    expect(screen.getByText('2 selected')).toBeInTheDocument()

    fireEvent.click(screen.getByTitle('Select all'))
    expect(screen.queryByText('2 selected')).not.toBeInTheDocument()
  })
})
