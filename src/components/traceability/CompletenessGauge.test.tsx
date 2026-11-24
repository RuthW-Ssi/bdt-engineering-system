import { render, screen } from '@testing-library/react'
import { CompletenessGauge, gaugeColor } from './CompletenessGauge'

describe('CompletenessGauge', () => {
  it('colours by share: red < 50, amber < 100, green at 100, grey with no data', () => {
    expect(gaugeColor(10)).toBe('#C8202A')
    expect(gaugeColor(50)).toBe('#B45309')
    expect(gaugeColor(100)).toBe('#15803D')
    expect(gaugeColor(null)).toBe('#9CA3AF')
  })

  it('shows the percentage, or a dash when there is nothing to trace', () => {
    const { rerender } = render(<CompletenessGauge pct={83.3} label="parts with a heat no." />)
    expect(screen.getByText('83.3%')).toBeInTheDocument()
    rerender(<CompletenessGauge pct={null} label="parts with a heat no." />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})
