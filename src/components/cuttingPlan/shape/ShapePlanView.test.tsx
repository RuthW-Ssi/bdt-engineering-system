import { fireEvent, render, screen, within } from '@testing-library/react'
import { ShapePlanView } from './ShapePlanView'
import type { CuttingPlanDetail } from '../../../api/cutting-plan'

// Plan #667 (PIPE 101.6X2.6) layouts 1-2 as saved
const part = (id: number, mark: string, len: string) => ({ id, seq: 1, part_no: id, mark, length_mm: len, count: 1 })
const detail = {
  files: [],
  shape_sizes: [{
    id: 1, profile: 'PIPE 101.6X2.6', grade: 'HSS550', plan_no: 667, kerf_mm: '12', yield_pct: '92.74', stocks: 16, parts: 28, parts_length_mm: '0', layouts_count: 2,
    layouts: [
      { id: 1, seq: 1, stock_no: 1, stock_length_mm: '12500', rest_mm: '70', repeat: 4, parts: [part(1, 'DBN-A3-m69', '12418')] },
      { id: 2, seq: 2, stock_no: 2, stock_length_mm: '6013', rest_mm: '82.67', repeat: 12, parts: [part(2, 'DBN-A3-m78', '3000'), part(3, 'DBN-A3-m75', '2906.33')] },
      { id: 5, seq: 5, stock_no: 2, stock_length_mm: '6013', rest_mm: '469.68', repeat: 6, parts: [part(4, 'DBN-A3-m80', '3519.32'), part(5, 'DBN-A3-m79', '2000')] },
    ],
  }],
} as unknown as CuttingPlanDetail

describe('ShapePlanView', () => {
  it('shows each part length and the scrap (Rest) on every layout, per piece and × repeat', () => {
    render(<ShapePlanView detail={detail} />)
    expect(screen.getByTestId('dims-2')).toHaveTextContent(/3,000 mm.*2,906\.33 mm.*12 mm.*Scrap 82\.67 mm/)
    expect(screen.getByText('Scrap 82.67 mm/pc · total 992.04 mm (×12)')).toBeInTheDocument()
    expect(screen.getByText('Scrap 70 mm/pc · total 280 mm (×4)')).toBeInTheDocument()
  })
  // live 2026-11-11: a wide scrap label spilled onto the kerf number beside it
  it('labels only the kerf between parts, never the one next to the scrap', () => {
    render(<ShapePlanView detail={detail} />)
    expect(screen.getByTestId('dims-5').textContent!.match(/12 mm/g)).toHaveLength(1)
  })
  it('totals the scrap for the size and the upload', () => {
    render(<ShapePlanView detail={detail} />)
    expect(screen.getByText('Scrap (Rest)', { selector: 'div' })).toBeInTheDocument() // the summary card (the chart legend is a span)
    expect(screen.getAllByText('4.09 m').length).toBeGreaterThanOrEqual(2) // card + size row: 280 + 992.04 + 2,818.08 mm
  })

  it('charts: where the pipe goes, pipes per size by stock length, and the stock to prepare', () => {
    render(<ShapePlanView detail={detail} />)
    expect(screen.getByText(/^Total pipe · /)).toHaveTextContent('Total pipe · 158.2 m · 22 pieces')
    expect(screen.getByRole('img', { name: 'Pipe breakdown' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /PIPE 101\.6X2\.6.*22 pcs/ })).toBeInTheDocument()
    expect(screen.getByTestId('stock-to-prepare')).toHaveTextContent(/PIPE 101\.6X2\.6 · HSS550 · 6,013 mm.*18 pcs.*PIPE 101\.6X2\.6 · HSS550 · 12,500 mm.*4 pcs/)
  })

  // 2026-11-11: many sizes must not grow the charts without end
  it('many sizes: 10 size bars then "Show all"; stock list 6 rows then "Show all"', () => {
    const base = detail.shape_sizes[0]
    const many = { ...detail, shape_sizes: Array.from({ length: 12 }, (_, i) => ({ ...base, id: 100 + i, profile: `PIPE ${100 + i}X3`, layouts: [base.layouts[1]] })) } as CuttingPlanDetail
    render(<ShapePlanView detail={many} />)
    const bars = () => screen.getAllByRole('button', { name: /^PIPE \d+X3 \d+ pcs/ })
    expect(bars()).toHaveLength(10)
    fireEvent.click(screen.getByRole('button', { name: 'Show all 12 sizes' }))
    expect(bars()).toHaveLength(12)
    const stock = screen.getByTestId('stock-to-prepare')
    expect(within(stock).getAllByText(/^PIPE \d+X3 · /)).toHaveLength(6)
    expect(within(stock).queryByText(/^Other/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show all 12 rows' }))
    expect(within(screen.getByTestId('stock-to-prepare')).getAllByText(/^PIPE \d+X3 · /)).toHaveLength(12)
  })

  it('stock to prepare sits in the side column without a scroll bar', () => {
    render(<ShapePlanView detail={detail} />)
    expect(screen.getByTestId('shape-side')).not.toHaveStyle({ position: 'absolute' })
    expect(screen.getByTestId('shape-side').querySelector('[style*="overflow-y"]')).toBeNull()
  })
})
