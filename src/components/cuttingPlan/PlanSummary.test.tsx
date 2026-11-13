import { fireEvent, render, screen, within } from '@testing-library/react'
import { PlanSummaryCharts } from './PlanSummary'
import type { PlanSummary } from '../../lib/cuttingPlan/planSummary'

// 2026-11-11: a plan with 12 thicknesses (as the real 99-plate plan) must not stretch the cards beside it
const THICK = [5, 6, 8, 9, 10, 12, 14, 16, 20, 25, 32, 35]
const s: PlanSummary = {
  plates: 99, steelKg: 83000, partsKg: 70000, scrapKg: 8100, remnantKg: 4900, machineMin: 3924,
  byThickness: THICK.map(t => ({ thick: t, plates: 8, kg: 7000, minutes: 300 })),
  plateSizes: [{ thick: 6, width: 1480, length: 10000, plates: 13 }], remnantPieces: 25, remnantM2: 55.2,
  remnantSizes: [{ thick: 20, width: 240, length: 12000, pieces: 1 }],
}
const show = (thickness: number | null = null) =>
  render(<PlanSummaryCharts summary={s} focus={s} thickness={thickness} onThickness={() => {}} />)
const thicknessRows = () => screen.getAllByRole('button', { name: /^\d+ mm/ })

describe('PlanSummaryCharts with many thicknesses', () => {
  it('shows the first 10 thicknesses, then "Show all 12 thicknesses"', () => {
    show()
    expect(thicknessRows()).toHaveLength(10)
    fireEvent.click(screen.getByRole('button', { name: 'Show all 12 thicknesses' }))
    expect(thicknessRows()).toHaveLength(12)
    expect(screen.getByRole('button', { name: 'Show fewer' })).toBeInTheDocument()
  })
  it('a picked thickness past the first 10 stays on screen', () => {
    show(35)
    expect(screen.getByRole('button', { name: /^35 mm/ })).toBeInTheDocument()
  })
  it('stock plates and remnants share one column beside the chart', () => {
    show()
    const side = screen.getByTestId('summary-side')
    expect(within(side).getByText('Stock plates')).toBeInTheDocument()
    expect(within(side).getByText('Remnants')).toBeInTheDocument()
  })
  // Tao 2026-11-11: the side cards fold and unfold like the chart; both sides always end up the same height
  // (grid stretch), whichever is taller — so nothing hides behind a scroll bar.
  it('stock plates and remnants fold to a few rows with "Show all" (no "Other" row), like the chart', () => {
    const sizes = Array.from({ length: 46 }, (_, i) => ({ thick: 6, width: 1480, length: 6000 + i * 100, plates: 1 }))
    const rem = Array.from({ length: 25 }, (_, i) => ({ thick: 9, width: 300 + i, length: 9100, pieces: 1 }))
    render(<PlanSummaryCharts summary={s} focus={{ ...s, plateSizes: sizes, remnantSizes: rem }} thickness={null} onThickness={() => {}} />)
    const side = screen.getByTestId('summary-side')
    expect(side).not.toHaveStyle({ position: 'absolute' })
    expect(within(side).queryByText(/^Other/)).not.toBeInTheDocument() // Tao 2026-11-11: no "Other" row, Show all instead
    expect(within(side).queryByText('6 × 1,480 × 6,500')).not.toBeInTheDocument()
    fireEvent.click(within(side).getByRole('button', { name: 'Show all 46 sizes' }))
    expect(within(side).getByText('6 × 1,480 × 10,500')).toBeInTheDocument()
    fireEvent.click(within(side).getByRole('button', { name: 'Show all 25 sizes' }))
    expect(within(side).getByText('9 × 324 × 9,100')).toBeInTheDocument()
    expect(within(side).getAllByRole('button', { name: 'Show fewer' })).toHaveLength(2)
  })
  // Tao 2026-11-11: drop the "Most used" caption and the idle filter hint; the active-filter line stays
  it('no "Most used" caption, no idle "Click a bar" hint; the active filter keeps its Show all link', () => {
    show()
    expect(screen.queryByText(/^Most used/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Most common/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Click a bar to filter/)).not.toBeInTheDocument()
  })
  it('a picked thickness still says what it filters, with a way back', () => {
    show(35)
    expect(screen.getByText(/Filtering all tabs: 35 mm/)).toBeInTheDocument()
  })
  // Tao 2026-11-11: remnant weight / area / share sit on the same line as "25 pcs"
  it('remnants: count, weight, area and share on one line', () => {
    show()
    const side = screen.getByTestId('summary-side')
    expect(within(side).getByText('25').parentElement).toHaveTextContent(/^25\s*pcs · 4\.9 t · 55\.2 m² · 5\.9% of total steel$/) // the gap after 25 is CSS
  })
})
