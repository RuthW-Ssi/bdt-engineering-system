import { render, screen, fireEvent } from '@testing-library/react'
import { QtyReusableField, WoHoldResolutionModal, qtyReusableValid } from './WoHoldResolutionModal'
import type { BomVersionStatus, WoDetail as WoDetailT } from '../../api/wo'

// NOTE on scope: this file covers the Accept-hold flow that
// WoHoldResolutionModal.tsx actually renders/owns, plus the shared
// `qtyReusableValid` pure function and `QtyReusableField` building block that
// are ALSO reused by the Cancel-with-qty_reusable flow living inside
// `src/pages/WoDetail.tsx`'s generic action modal (submitModal(), around
// lines 81-93). That page-level Cancel flow is not exported/testable in
// isolation without mounting the full WoDetail page (react-router params,
// useWo/useBomVersionStatus/useWoTransition/useAcceptNewVersion hooks) and is
// out of scope here — but its validation math is exactly `qtyReusableValid`,
// which is exercised thoroughly below.

function makeWo(overrides: Partial<WoDetailT> = {}): WoDetailT {
  return {
    id: 1,
    wo_code: 'WO-0001',
    status: 'ON_HOLD',
    mo_id: 1,
    source_routing_op_id: null,
    sequence: 1,
    work_center_id: 1,
    expected_duration_min: 60,
    setup_time_min: 0,
    op_attributes: {},
    bom_assembly_id: 1,
    bom_dispatch_id_snapshot: 1,
    earliest_start_at: null,
    actual_start_at: null,
    actual_end_at: null,
    target_end_at: null,
    qty_done: null,
    qty_scrapped: null,
    assigned_to: null,
    notes: null,
    released_at: null,
    released_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    created_by: 'tester',
    updated_by: null,
    manufacturing_order: {
      id: 1,
      mo_code: 'MO-0001',
      status: 'IN_PROGRESS',
      primary_mark_prefix_code: 'A',
      primary_mark_prefix: { code: 'A', label: 'Assembly', category: 'x' },
    },
    mrp_workcenter: { id: 1, code: 'WC1', name: 'Work Center 1', machine: null },
    bom_assembly: {
      id: 1,
      assembly_mark: 'A1',
      name: null,
      length_mm: null,
      surface_area_m2: null,
      weight_kg: null,
      width_mm: null,
      height_mm: null,
      dispatch: { id: 1, project: null, zone: null, sub_zone: null },
    },
    mark_prefix: { code: 'A', label: 'Assembly', category: 'x' },
    snapshot_dispatch: null,
    source_routing_op: null,
    ...overrides,
  }
}

function makeBom(overrides: Partial<BomVersionStatus> = {}): BomVersionStatus {
  return {
    is_outdated: true,
    delta_types: ['SPEC_CHANGED'],
    delta_details: null,
    snapshot_dispatch_id: 1,
    latest_dispatch_id: 2,
    assembly_mark: 'A1',
    ...overrides,
  }
}

function getNoteField() {
  // Only field with an implicit "textbox" role — the qty_reusable input is
  // type="number" (role "spinbutton").
  return screen.getByRole('textbox')
}

function getAcceptButton() {
  return screen.getByRole('button', { name: /accept/i })
}

describe('qtyReusableValid', () => {
  it('rejects empty string', () => {
    expect(qtyReusableValid('', 10)).toBe(false)
  })

  it('rejects negative numbers', () => {
    expect(qtyReusableValid('-1', 10)).toBe(false)
  })

  it('accepts exactly 0 (legitimate nothing-reusable case, fixed in 228ea13)', () => {
    expect(qtyReusableValid('0', 10)).toBe(true)
  })

  it('accepts values up to and including max', () => {
    expect(qtyReusableValid('10', 10)).toBe(true)
  })

  it('rejects values greater than max', () => {
    expect(qtyReusableValid('11', 10)).toBe(false)
  })

  it('rejects non-numeric input', () => {
    expect(qtyReusableValid('abc', 10)).toBe(false)
  })
})

describe('QtyReusableField', () => {
  it('renders the current value and reports raw string changes via onChange', () => {
    const onChange = vi.fn()
    render(<QtyReusableField value="3" onChange={onChange} max={10} />)

    const input = screen.getByRole('spinbutton')
    expect(input).toHaveValue(3)

    fireEvent.change(input, { target: { value: '0' } })
    expect(onChange).toHaveBeenCalledWith('0')
  })
})

describe('WoHoldResolutionModal', () => {
  const onClose = vi.fn()
  const onSubmit = vi.fn()

  beforeEach(() => {
    onClose.mockClear()
    onSubmit.mockClear()
  })

  describe('when qty_reusable is not needed (no QTY_CHANGED delta driving it)', () => {
    const wo = makeWo({ qty_done: 5 })
    const bom = makeBom({ delta_types: ['SPEC_CHANGED'] })

    it('disables submit while note is empty', () => {
      render(<WoHoldResolutionModal wo={wo} bom={bom} isPending={false} onClose={onClose} onSubmit={onSubmit} />)
      expect(getAcceptButton()).toBeDisabled()
    })

    it('enables submit once note is non-empty, and does not render the qty_reusable field', () => {
      render(<WoHoldResolutionModal wo={wo} bom={bom} isPending={false} onClose={onClose} onSubmit={onSubmit} />)

      expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()

      fireEvent.change(getNoteField(), { target: { value: 'Resolving hold' } })
      expect(getAcceptButton()).not.toBeDisabled()
    })

    it('disables submit when note is only whitespace', () => {
      render(<WoHoldResolutionModal wo={wo} bom={bom} isPending={false} onClose={onClose} onSubmit={onSubmit} />)
      fireEvent.change(getNoteField(), { target: { value: '   ' } })
      expect(getAcceptButton()).toBeDisabled()
    })

    it('submits { note, qty_reusable: undefined } and trims the note', () => {
      render(<WoHoldResolutionModal wo={wo} bom={bom} isPending={false} onClose={onClose} onSubmit={onSubmit} />)

      fireEvent.change(getNoteField(), { target: { value: '  Resolving hold  ' } })
      fireEvent.click(getAcceptButton())

      expect(onSubmit).toHaveBeenCalledTimes(1)
      expect(onSubmit).toHaveBeenCalledWith({ note: 'Resolving hold', qty_reusable: undefined })
    })

    it('calls onClose when Close is clicked', () => {
      render(<WoHoldResolutionModal wo={wo} bom={bom} isPending={false} onClose={onClose} onSubmit={onSubmit} />)
      fireEvent.click(screen.getByRole('button', { name: 'Close' }))
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('disables submit and shows pending label while isPending', () => {
      render(<WoHoldResolutionModal wo={wo} bom={bom} isPending onClose={onClose} onSubmit={onSubmit} />)
      fireEvent.change(getNoteField(), { target: { value: 'Resolving hold' } })

      const button = screen.getByRole('button', { name: /accepting/i })
      expect(button).toBeDisabled()
      expect(onSubmit).not.toHaveBeenCalled()
    })
  })

  describe('when qty_reusable is required (qty_done exceeds the new target qty)', () => {
    // qty_done=10 > delta.to=8 -> needsQtyReusable=true; validity bound is
    // qty_done (10), not delta.to (8), per QtyReusableField's max={qtyDone}.
    const wo = makeWo({ qty_done: 10 })
    const bom = makeBom({ delta_types: ['QTY_CHANGED'], delta_details: { qty: { from: 5, to: 8 } } })

    function fillNote() {
      fireEvent.change(getNoteField(), { target: { value: 'Accepting with leftover qty' } })
    }

    it('renders the qty_reusable field', () => {
      render(<WoHoldResolutionModal wo={wo} bom={bom} isPending={false} onClose={onClose} onSubmit={onSubmit} />)
      expect(screen.getByRole('spinbutton')).toBeInTheDocument()
    })

    it('disables submit when note is filled but qty_reusable is empty', () => {
      render(<WoHoldResolutionModal wo={wo} bom={bom} isPending={false} onClose={onClose} onSubmit={onSubmit} />)
      fillNote()
      expect(getAcceptButton()).toBeDisabled()
    })

    it('disables submit when qty_reusable is negative', () => {
      render(<WoHoldResolutionModal wo={wo} bom={bom} isPending={false} onClose={onClose} onSubmit={onSubmit} />)
      fillNote()
      fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '-1' } })
      expect(getAcceptButton()).toBeDisabled()
    })

    it('disables submit when qty_reusable exceeds qty_done (the max)', () => {
      render(<WoHoldResolutionModal wo={wo} bom={bom} isPending={false} onClose={onClose} onSubmit={onSubmit} />)
      fillNote()
      fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '11' } })
      expect(getAcceptButton()).toBeDisabled()
    })

    it('ENABLES submit when qty_reusable is exactly 0 (valid per the 228ea13 fix)', () => {
      render(<WoHoldResolutionModal wo={wo} bom={bom} isPending={false} onClose={onClose} onSubmit={onSubmit} />)
      fillNote()
      fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '0' } })
      expect(getAcceptButton()).not.toBeDisabled()
    })

    it('submits { note, qty_reusable: 0 } as a number when qty_reusable is 0', () => {
      render(<WoHoldResolutionModal wo={wo} bom={bom} isPending={false} onClose={onClose} onSubmit={onSubmit} />)
      fillNote()
      fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '0' } })
      fireEvent.click(getAcceptButton())

      expect(onSubmit).toHaveBeenCalledWith({ note: 'Accepting with leftover qty', qty_reusable: 0 })
    })

    it('enables submit once qty_reusable is within range, and submits the correct payload', () => {
      render(<WoHoldResolutionModal wo={wo} bom={bom} isPending={false} onClose={onClose} onSubmit={onSubmit} />)
      fillNote()
      fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '4' } })
      expect(getAcceptButton()).not.toBeDisabled()

      fireEvent.click(getAcceptButton())
      expect(onSubmit).toHaveBeenCalledWith({ note: 'Accepting with leftover qty', qty_reusable: 4 })
    })

    it('accepts qty_reusable exactly at the max (qty_done)', () => {
      render(<WoHoldResolutionModal wo={wo} bom={bom} isPending={false} onClose={onClose} onSubmit={onSubmit} />)
      fillNote()
      fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '10' } })
      expect(getAcceptButton()).not.toBeDisabled()
    })

    it('does not submit on click while invalid (guard against stale-closure double submits)', () => {
      render(<WoHoldResolutionModal wo={wo} bom={bom} isPending={false} onClose={onClose} onSubmit={onSubmit} />)
      fillNote()
      fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '-1' } })
      fireEvent.click(getAcceptButton())
      expect(onSubmit).not.toHaveBeenCalled()
    })
  })
})
