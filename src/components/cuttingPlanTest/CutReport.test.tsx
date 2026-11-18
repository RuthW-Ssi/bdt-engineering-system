import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { vi } from 'vitest'
import { CutReport } from './CutReport'
import type { CutReportSize } from './CutReport'

// 3 bars of 6,000: two DBN-A3-m12 (2,410) then one DBN-A3-m15 (1,090), kerf 12
const SIZE: CutReportSize = {
  profile: '101.6X2.6', grade: 'SS400', zone: 'Z03', kerfMm: 12,
  result: {
    stocks: 3, stockLengthMm: 18000, partsLengthMm: 17730, scrapMm: 162, kerfMm: 12, yieldPct: 98.5, cuts: 9, method: 'mip',
    stockMix: [{ lengthMm: 6000, pieces: 3 }, { lengthMm: 9000, pieces: 0 }],
    layouts: [{
      stockLengthMm: 6000, repeat: 3, restMm: 54, cuts: 3,
      pieces: [{ lengthMm: 2410, count: 2 }, { lengthMm: 1090, count: 1 }],
      marks: [{ mark: 'DBN-A3-m12', lengthMm: 2410, pcs: 6 }, { mark: 'DBN-A3-m15', lengthMm: 1090, pcs: 3 }],
    }],
  },
}

describe('CutReport', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks() })

  it('heads each size with the title, the size and the stocks', () => {
    render(<CutReport source="BOM 0X222 · Z03" sizes={[SIZE]} onClose={() => {}} />)
    const sheet = screen.getByTestId('cr-sheet-101.6X2.6')
    expect(within(sheet).getByText('CUTTING REPORT SHAPE')).toBeTruthy()
    expect(within(sheet).getByText('BOM 0X222 · Z03')).toBeTruthy()
    expect(within(sheet).getByText('Z03')).toBeTruthy()
    // only the lengths that are used
    expect(within(sheet).getByText('6,000 × 3', { selector: 'li' })).toBeTruthy()
    expect(within(sheet).queryByText(/9,000/)).toBeNull()
  })

  it('lists the marks in cut order by their full name, in the words of the CutLogic report', () => {
    render(<CutReport source="x" sizes={[SIZE]} onClose={() => {}} />)
    const layout = screen.getByTestId('cr-layout-1')
    const rows = within(layout).getAllByRole('row').slice(1).map(r => within(r).getAllByRole('cell').map(c => c.textContent))
    expect(rows).toEqual([
      ['1', 'DBN-A3-m12', '2,410', '2', '6'],
      ['2', 'DBN-A3-m15', '1,090', '1', '3'],
    ])
    // the words of the CutLogic report
    expect(within(layout).getByText('Layout 1 of 1')).toBeTruthy()
    expect(within(layout).getByText('Length 6,000')).toBeTruthy()
    expect(within(layout).getByText('Repeat 3x')).toBeTruthy()
    expect(within(layout).getByText('Rest 54')).toBeTruthy()
  })

  it('prints, switches paper and colour, and closes', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    const onClose = vi.fn()
    render(<CutReport source="x" sizes={[SIZE]} onClose={onClose} />)
    const root = screen.getByRole('dialog', { name: 'Cutting report' })
    fireEvent.click(screen.getByText('Print'))
    expect(print).toHaveBeenCalledTimes(1)
    expect(root.querySelector('style')!.textContent).toContain('size:A4 landscape')
    fireEvent.click(screen.getByText('A4 portrait'))
    expect(root.querySelector('style')!.textContent).toContain('size:A4 portrait')
    fireEvent.click(screen.getByText('Black and white'))
    expect(root.className).toContain('cr-bw')
    fireEvent.click(screen.getByLabelText('Close report'))
    expect(onClose).toHaveBeenCalled()
  })
})
