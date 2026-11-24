import { vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AssignHeatModal } from './AssignHeatModal'
import { useAssignHeat, useAssignHeatBulk, useHeatLots, useVoidPlateCut } from '../../hooks/useTraceability'
import type { PreviousPlateCut } from '../../api/traceability'

// Tests for AssignHeatModal (traceability). Not yet run under Vitest - run `pnpm vitest run src/components/traceability` before merge.
vi.mock('../../hooks/useTraceability', () => ({
  useAssignHeat: vi.fn(), useAssignHeatBulk: vi.fn(), useHeatLots: vi.fn(), useVoidPlateCut: vi.fn(),
  useSheetHistory: vi.fn(() => ({ data: undefined, isLoading: false, isError: false })), // audit trail, closed by default
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
/* eslint-disable @typescript-eslint/no-explicit-any */
const assign = vi.fn().mockResolvedValue({ plate_cut_id: 55, heat_lot: { id: 7, heat_no: 'H123', mill: 'MILL A', cert_no: 'C-1' }, parts_traced: 3, replaced: 0, warnings: [] })
const earlier: PreviousPlateCut = { plate_cut_id: 9, upload_id: 2, sheet: 'X-1', plate_seq: 1, plate_no: 'P-9', heat_lot: { id: 7, heat_no: 'H123', mill: 'MILL A', cert_no: 'C-1' } }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useAssignHeat).mockReturnValue({ mutateAsync: assign, isPending: false } as any)
  vi.mocked(useAssignHeatBulk).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any)
  vi.mocked(useVoidPlateCut).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any)
  vi.mocked(useHeatLots).mockReturnValue({ data: [] } as any)
})

describe('AssignHeatModal', () => {
  it('offers the heat no. of an earlier upload of the plate and fills it in only on "Use it"', async () => {
    const onClose = vi.fn()
    render(<AssignHeatModal sheetLabel="X-1" onClose={onClose}
      sheet={{ nesting_id: 10, plate_cuts: [], parts: 3, plates_in_report: 1, previous_cuts: [earlier] }} />)
    const heat = screen.getByLabelText(/Heat no\./) as HTMLInputElement
    expect(heat.value).toBe('') // nothing is copied on its own
    fireEvent.click(screen.getByRole('button', { name: 'Use it' }))
    expect(heat.value).toBe('H123')
    expect((screen.getByLabelText('Mill') as HTMLInputElement).value).toBe('MILL A')
    expect(screen.queryByRole('button', { name: 'Use it' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Assign heat no.' }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith({ nestingId: 10, payload: expect.objectContaining({ heat_no: 'H123', mill: 'MILL A', plate_no: 'P-9', plate_seq: 1 }) }))
    expect(onClose).toHaveBeenCalled()
  })

  it('asks for a reason before replacing a plate that already has a heat no.', () => {
    render(<AssignHeatModal sheetLabel="X-1" onClose={vi.fn()}
      sheet={{
        nesting_id: 10, parts: 3, plates_in_report: 1,
        plate_cuts: [{ id: 55, plate_seq: 1, plate_no: null, cut_date: null, machine: null, note: null, create_date: '2026-11-23T00:00:00Z', heat_lot: { id: 7, heat_no: 'H123', mill: '', cert_no: null }, parts_traced: 3 }],
      }} />)
    fireEvent.change(screen.getByLabelText(/Heat no\./), { target: { value: 'H999' } })
    const save = screen.getByRole('button', { name: 'Replace heat no.' })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/Reason for the change/), { target: { value: 'typo' } })
    expect(save).not.toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Use it' })).toBeNull() // no hint once the plate has a record
  })
})
