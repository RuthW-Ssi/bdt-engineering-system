import { render, screen, fireEvent } from '@testing-library/react'
import { QcBreakdownFields, qcBreakdownValid, qcBreakdownSum, EMPTY_QC_BREAKDOWN } from './QcBreakdownFields'

// NOTE on scope: this file covers the shared QcBreakdownFields building block
// (2026-09-23, replaces the retired QtyReusableField — user: "เอา Scrapped
// Reusable เปลี่ยนเป็น Qc passed, Rework, Renew") and its qcBreakdownValid/
// qcBreakdownSum helpers. The per-mark modals that use it (WoMarksTable.tsx's
// remove/accept-version modals, WoDetail.tsx's cancel modal) are covered in
// their own test files.

describe('qcBreakdownSum', () => {
  it('treats blank fields as 0', () => {
    expect(qcBreakdownSum(EMPTY_QC_BREAKDOWN)).toBe(0)
  })

  it('sums all three fields', () => {
    expect(qcBreakdownSum({ qty_qc_passed: '2', qty_rework: '1', qty_renew: '3' })).toBe(6)
  })

  it('ignores a partially-entered breakdown\'s blank fields', () => {
    expect(qcBreakdownSum({ qty_qc_passed: '5', qty_rework: '', qty_renew: '' })).toBe(5)
  })
})

describe('qcBreakdownValid', () => {
  it('rejects a completely blank breakdown', () => {
    expect(qcBreakdownValid(EMPTY_QC_BREAKDOWN, 10)).toBe(false)
  })

  it('rejects a negative field', () => {
    expect(qcBreakdownValid({ qty_qc_passed: '-1', qty_rework: '', qty_renew: '' }, 10)).toBe(false)
  })

  it('accepts an all-zero breakdown (legitimate nothing-salvageable case)', () => {
    expect(qcBreakdownValid({ qty_qc_passed: '0', qty_rework: '0', qty_renew: '0' }, 10)).toBe(true)
  })

  it('accepts a partial breakdown whose sum is within max', () => {
    expect(qcBreakdownValid({ qty_qc_passed: '4', qty_rework: '', qty_renew: '' }, 10)).toBe(true)
  })

  it('accepts a sum exactly equal to max', () => {
    expect(qcBreakdownValid({ qty_qc_passed: '4', qty_rework: '3', qty_renew: '3' }, 10)).toBe(true)
  })

  it('rejects a sum greater than max', () => {
    expect(qcBreakdownValid({ qty_qc_passed: '4', qty_rework: '4', qty_renew: '3' }, 10)).toBe(false)
  })

  it('rejects non-numeric input in any field', () => {
    expect(qcBreakdownValid({ qty_qc_passed: 'abc', qty_rework: '', qty_renew: '' }, 10)).toBe(false)
  })
})

describe('QcBreakdownFields', () => {
  it('renders the current value for all three fields and reports raw string changes via onChange', () => {
    const onChange = vi.fn()
    render(<QcBreakdownFields value={{ qty_qc_passed: '3', qty_rework: '1', qty_renew: '' }} onChange={onChange} max={10} />)

    expect(screen.getByLabelText('QC Passed')).toHaveValue(3)
    expect(screen.getByLabelText('Rework')).toHaveValue(1)
    expect(screen.getByLabelText('Renew')).toHaveValue(null)

    fireEvent.change(screen.getByLabelText('Renew'), { target: { value: '2' } })
    expect(onChange).toHaveBeenCalledWith({ qty_qc_passed: '3', qty_rework: '1', qty_renew: '2' })
  })

  it('shows the running total against max, flagging when it is exceeded', () => {
    const { rerender } = render(<QcBreakdownFields value={{ qty_qc_passed: '4', qty_rework: '', qty_renew: '' }} onChange={vi.fn()} max={10} />)
    expect(screen.getByText('4 / 10 already-produced qty accounted for')).toBeInTheDocument()

    rerender(<QcBreakdownFields value={{ qty_qc_passed: '8', qty_rework: '5', qty_renew: '' }} onChange={vi.fn()} max={10} />)
    expect(screen.getByText(/13 \/ 10 already-produced qty accounted for — exceeds qty done/)).toBeInTheDocument()
  })

  it('renders without a running-total line when no max is given', () => {
    render(<QcBreakdownFields value={EMPTY_QC_BREAKDOWN} onChange={vi.fn()} />)
    expect(screen.queryByText(/already-produced qty accounted for/)).not.toBeInTheDocument()
  })
})
