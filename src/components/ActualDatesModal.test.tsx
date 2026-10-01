import { render, screen, fireEvent } from '@testing-library/react'
import { ActualDatesModal, validateActualDatesForm } from './ActualDatesModal'

const NOW = new Date(2026, 9, 1, 12, 0) // 01 Oct 2026, 12:00 local
const EMPTY = { start: '', finish: '', timeliness: '' as const, delayNote: '', reason: '' }
const DATES = { ...EMPTY, start: '2026-09-30T08:00', finish: '2026-10-01T10:00' }
const PLAIN = { withTimeliness: false, withReason: false, now: NOW }

describe('validateActualDatesForm', () => {
  it('requires both dates', () => {
    expect(validateActualDatesForm(EMPTY, PLAIN)).toEqual(['Actual Start is required', 'Actual Finish is required'])
    expect(validateActualDatesForm({ ...EMPTY, start: DATES.start }, PLAIN)).toEqual(['Actual Finish is required'])
  })

  it('accepts valid past dates, including start === finish', () => {
    expect(validateActualDatesForm(DATES, PLAIN)).toEqual([])
    expect(validateActualDatesForm({ ...EMPTY, start: '2026-09-30T08:00', finish: '2026-09-30T08:00' }, PLAIN)).toEqual([])
  })

  it('rejects finish before start', () => {
    expect(validateActualDatesForm({ ...EMPTY, start: '2026-09-30T08:00', finish: '2026-09-30T07:59' }, PLAIN))
      .toEqual(['Actual Finish must not be before Actual Start'])
  })

  it('rejects either date in the future (no tolerance)', () => {
    expect(validateActualDatesForm({ ...DATES, finish: '2026-10-01T12:01' }, PLAIN)).toEqual(['Actual dates must not be in the future'])
    expect(validateActualDatesForm({ ...DATES, start: '2026-10-02T08:00', finish: '2026-10-02T09:00' }, PLAIN)).toEqual(['Actual dates must not be in the future'])
    expect(validateActualDatesForm({ ...DATES, finish: '2026-10-01T12:00' }, PLAIN)).toEqual([])
  })

  it('withTimeliness: requires a choice, and a non-blank delay reason only when DELAYED', () => {
    const opts = { ...PLAIN, withTimeliness: true }
    expect(validateActualDatesForm(DATES, opts)).toEqual(['Select On Plan or Delayed'])
    expect(validateActualDatesForm({ ...DATES, timeliness: 'ON_PLAN' }, opts)).toEqual([])
    expect(validateActualDatesForm({ ...DATES, timeliness: 'DELAYED', delayNote: '   ' }, opts)).toEqual(['Delay reason is required'])
    expect(validateActualDatesForm({ ...DATES, timeliness: 'DELAYED', delayNote: 'crane down' }, opts)).toEqual([])
  })

  it('ignores timeliness when withTimeliness is off', () => {
    expect(validateActualDatesForm({ ...DATES, timeliness: 'DELAYED' }, PLAIN)).toEqual([])
  })

  it('requires a reason only when withReason', () => {
    expect(validateActualDatesForm(DATES, PLAIN)).toEqual([])
    expect(validateActualDatesForm({ ...DATES, reason: '  ' }, { ...PLAIN, withReason: true })).toEqual(['A reason is required'])
    expect(validateActualDatesForm({ ...DATES, reason: 'done' }, { ...PLAIN, withReason: true })).toEqual([])
  })
})

// Past dates relative to any real clock the tests run under.
const START = '2025-01-05T08:00'
const FINISH = '2025-01-06T17:30'

function fillDates() {
  fireEvent.change(screen.getByLabelText(/Actual Start/), { target: { value: START } })
  fireEvent.change(screen.getByLabelText(/Actual Finish/), { target: { value: FINISH } })
}

describe('ActualDatesModal', () => {
  it('starts empty, shows no messages before the user types, and keeps Confirm disabled until valid', () => {
    render(<ActualDatesModal title="Complete · WO-1" withTimeliness onConfirm={vi.fn()} onClose={vi.fn()} />)
    const confirm = screen.getByRole('button', { name: 'Confirm' })

    expect(screen.getByLabelText(/Actual Start/)).toHaveValue('')
    expect(screen.getByLabelText(/Actual Finish/)).toHaveValue('')
    expect(screen.queryByText('Actual Start is required')).not.toBeInTheDocument()
    expect(confirm).toBeDisabled()

    fillDates()
    expect(confirm).toBeDisabled()
    expect(screen.getByText('Select On Plan or Delayed')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('On Plan'))
    expect(confirm).toBeEnabled()
  })

  it('shows Delay Reason only after choosing Delayed, and requires it', () => {
    render(<ActualDatesModal title="t" withTimeliness onConfirm={vi.fn()} onClose={vi.fn()} />)
    fillDates()
    expect(screen.queryByLabelText(/Delay Reason/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Delayed'))
    expect(screen.getByLabelText(/Delay Reason/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()

    fireEvent.click(screen.getByLabelText('On Plan'))
    expect(screen.queryByLabelText(/Delay Reason/)).not.toBeInTheDocument()
  })

  it('onConfirm gets ISO strings and no delay_note for ON_PLAN', () => {
    const onConfirm = vi.fn()
    render(<ActualDatesModal title="t" withTimeliness onConfirm={onConfirm} onClose={vi.fn()} />)
    fillDates()
    fireEvent.click(screen.getByLabelText('Delayed'))
    fireEvent.change(screen.getByLabelText(/Delay Reason/), { target: { value: 'typed then switched' } })
    fireEvent.click(screen.getByLabelText('On Plan'))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    const v = onConfirm.mock.calls[0][0]
    expect(v).toEqual({
      actual_start: new Date(2025, 0, 5, 8, 0).toISOString(),
      actual_finish: new Date(2025, 0, 6, 17, 30).toISOString(),
      timeliness: 'ON_PLAN',
      delay_note: undefined,
    })
    expect(v.delay_note).toBeUndefined()
  })

  it('onConfirm gets the trimmed delay_note for DELAYED', () => {
    const onConfirm = vi.fn()
    render(<ActualDatesModal title="t" withTimeliness onConfirm={onConfirm} onClose={vi.fn()} />)
    fillDates()
    fireEvent.click(screen.getByLabelText('Delayed'))
    fireEvent.change(screen.getByLabelText(/Delay Reason/), { target: { value: '  crane down  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(onConfirm.mock.calls[0][0]).toMatchObject({ timeliness: 'DELAYED', delay_note: 'crane down' })
  })

  it('withReason: requires and passes the trimmed reason (no timeliness)', () => {
    const onConfirm = vi.fn()
    render(<ActualDatesModal title="t" withReason onConfirm={onConfirm} onClose={vi.fn()} />)
    fillDates()
    const confirm = screen.getByRole('button', { name: 'Confirm' })
    expect(confirm).toBeDisabled()
    expect(screen.queryByLabelText('On Plan')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: ' all done ' } })
    fireEvent.click(confirm)
    expect(onConfirm.mock.calls[0][0]).toEqual({
      actual_start: new Date(2025, 0, 5, 8, 0).toISOString(),
      actual_finish: new Date(2025, 0, 6, 17, 30).toISOString(),
      reason: 'all done',
    })
  })

  it('prefills from initial (local time) and is immediately confirmable', () => {
    const onConfirm = vi.fn()
    render(
      <ActualDatesModal
        title="Edit Actual Dates · WO-1"
        withTimeliness
        initial={{
          actual_start: new Date(2025, 0, 5, 8, 0).toISOString(),
          actual_finish: new Date(2025, 0, 6, 17, 30).toISOString(),
          timeliness: 'DELAYED',
          delay_note: 'late steel',
        }}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByLabelText(/Actual Start/)).toHaveValue(START)
    expect(screen.getByLabelText(/Actual Finish/)).toHaveValue(FINISH)
    expect(screen.getByLabelText('Delayed')).toBeChecked()
    expect(screen.getByLabelText(/Delay Reason/)).toHaveValue('late steel')

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(onConfirm.mock.calls[0][0]).toMatchObject({ timeliness: 'DELAYED', delay_note: 'late steel' })
  })

  it('sends an untouched stored date back as-is (seconds kept), a changed one at minute precision', () => {
    const onConfirm = vi.fn()
    const storedStart = new Date(2025, 0, 5, 8, 0, 42, 123).toISOString()
    render(
      <ActualDatesModal
        title="Edit Actual Dates · MO-1"
        initial={{ actual_start: storedStart, actual_finish: new Date(2025, 0, 6, 17, 30, 15).toISOString() }}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByLabelText(/Actual Finish/), { target: { value: '2025-01-06T18:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(onConfirm.mock.calls[0][0]).toEqual({
      actual_start: storedStart,
      actual_finish: new Date(2025, 0, 6, 18, 0).toISOString(),
    })
  })

  it('shows plan dates, the server error, Saving… while pending, and Cancel calls onClose', () => {
    const onClose = vi.fn()
    render(
      <ActualDatesModal
        title="t" plan={{ start: null, finish: null }} pending error="Actual Finish must not be before Actual Start"
        onConfirm={vi.fn()} onClose={onClose}
      />,
    )
    expect(screen.getByText('Plan: — → —')).toBeInTheDocument()
    expect(screen.getByText('Actual Finish must not be before Actual Start')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
  })
})
