import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ProgressChips, ProgressTable, type OpProgress } from './MarkProgress'

const wo = (over: Partial<OpProgress['wos'][number]> = {}): OpProgress['wos'][number] => ({
  wo_id: 9, wo_code: 'WO-9', status: 'IN_PROGRESS', qty_planned: 2,
  qty_not_started: 0, qty_in_progress: 1, qty_done: 1, qty_qc_passed: 1, qty_rework: null, qty_renew: null, actual_finish: null, ...over,
})
const OPS: OpProgress[] = [
  { sequence: 0, op_code: 'OP-000', name: 'Build-up(Pre-Shop)', need: 2, qc_passed: 2, wos: [wo({ wo_id: 7, wo_code: 'WO-7', status: 'DONE', qty_qc_passed: 2, actual_finish: '2026-10-14T12:00:00.000Z' })] },
  // one operation, one mark, split across two WOs (user 2026-10-14)
  { sequence: 10, op_code: 'OP-FIT', name: 'Fit-Up', need: 3, qc_passed: 1, wos: [wo(), wo({ wo_id: 10, wo_code: 'WO-10', status: 'NOT_STARTED', qty_planned: 1, qty_not_started: 1, qty_in_progress: 0, qty_done: 0, qty_qc_passed: 0 })] },
  { sequence: 20, op_code: 'OP-WELD', name: 'Welding', need: 2, qc_passed: 0, wos: [] },
]
const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('ProgressChips', () => {
  it('one chip per operation: ✓ when QC Passed covers the sets, passed/need while short, – with no WO', () => {
    wrap(<ProgressChips ops={OPS} />)
    expect(screen.getByRole('link', { name: /000 Build-up\(Pre-Shop\) ✓/ })).toHaveAttribute('href', '/order/wo/7')
    expect(screen.getByRole('link', { name: /010 Fit-Up 1\/3 · 2 WO/ })).toHaveAttribute('href', '/order/wo/9')
    expect(screen.getByText(/020 Welding –/)).not.toHaveAttribute('href')
  })

  // User 2026-10-14: green only once every WO of the operation is complete.
  it('is green (✓) only when every WO of the operation is Done and they cover the sets', () => {
    const passedButOpen: OpProgress = { ...OPS[0], wos: [wo({ status: 'IN_PROGRESS', qty_qc_passed: 2 })] }
    const doneButShort: OpProgress = { ...OPS[0], need: 3, wos: [wo({ status: 'DONE', qty_qc_passed: 2 })] }
    const { unmount } = wrap(<ProgressChips ops={[passedButOpen]} />)
    expect(screen.getByRole('link', { name: /000 Build-up\(Pre-Shop\) 2\/2/ })).toBeInTheDocument()
    unmount()
    wrap(<ProgressChips ops={[doneButShort]} />)
    expect(screen.getByRole('link', { name: /000 Build-up\(Pre-Shop\) 2\/3/ })).toBeInTheDocument()
  })

  it('shows a dash when the MO has no operations', () => {
    wrap(<ProgressChips ops={[]} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})

describe('ProgressTable', () => {
  it('a row per WO with how many sets of the mark it holds, and a "no WO yet" row for an operation without one', () => {
    wrap(<ProgressTable ops={OPS} />)
    expect(screen.getAllByRole('columnheader').map(h => h.textContent)).toContain('Qty in WO')
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows).toHaveLength(4)
    expect(within(rows[0]).getByRole('link', { name: 'WO-7' })).toHaveAttribute('href', '/order/wo/7')
    expect(within(rows[0]).getByText('Done')).toBeInTheDocument()
    expect(within(rows[0]).getByText(/^14\/10\/2026 \d\d:\d\d$/)).toBeInTheDocument()
    // Qty in WO, Not Started, In Progress, Done, QC Passed, Rework, Renew
    expect(within(rows[1]).getAllByRole('cell').map(c => c.textContent).slice(4, 11)).toEqual(['2', '0', '1', '1', '1', '–', '–'])
    expect(within(rows[2]).getAllByRole('cell').map(c => c.textContent).slice(2, 5)).toEqual(['WO-10', 'Not Started', '1'])
    expect(within(rows[3]).getByText('ยังไม่ออก WO')).toBeInTheDocument()
  })
})
