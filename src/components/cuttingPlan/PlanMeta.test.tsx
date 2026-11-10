import { render, screen } from '@testing-library/react'
import { PlanMeta } from './PlanMeta'

describe('PlanMeta', () => {
  // 2026-11-10: no zone = "All zones (whole project)"
  it('labels a whole-project upload "Zone : All zones"', () => {
    render(<PlanMeta plan={{ project: { id: 1, project_code: '0X222', name: 'Bangna' }, zone: null, sub_zone: null, lot: null }} />)
    expect(screen.getByText('All zones')).toBeInTheDocument()
  })
})
