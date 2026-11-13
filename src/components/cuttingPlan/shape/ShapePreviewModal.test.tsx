import { render, screen } from '@testing-library/react'
import { ShapePreviewModal } from './ShapePreviewModal'
import type { ShapePreviewResult } from '../../../api/cutting-plan'

const OK: ShapePreviewResult = {
  sizes: [
    { file: 'CP-a - PIPE 113.5X2.4-HSS550.pdf', profile: 'PIPE 113.5X2.4', grade: 'HSS550', stocks: 22, parts: 47, yieldPct: 93.77 },
    { file: 'CP-a - PIPE 101.6X2.6-HSS550.pdf', profile: 'PIPE 101.6X2.6', grade: 'HSS550', stocks: 53, parts: 103, yieldPct: 92.74 },
  ],
  problems: [], warnings: [], notUsed: ['PS-a - PIPE 113.5X2.4-HSS550.pdf'], alreadyInSystem: [],
}
const show = (p: ShapePreviewResult) => render(<ShapePreviewModal preview={p} onCancel={() => {}} onConfirm={() => {}} isUploading={false} />)

describe('ShapePreviewModal', () => {
  it('lists every size with its totals and lets a clean upload be saved', () => {
    show(OK)
    expect(screen.getAllByRole('row').slice(1).map(r => r.textContent)).toEqual([
      'PIPE 113.5X2.4HSS550224793.77%',
      'PIPE 101.6X2.6HSS5505310392.74%',
    ])
    expect(screen.getByText(/1 file not used/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm & Save' })).toBeEnabled()
  })

  it('lists every problem by file and blocks saving', () => {
    show({ ...OK, problems: [{ file: 'CP-b.pdf', problem: 'Stocks: layouts add up to 23, the report says 22' }] })
    expect(screen.getByText(/Cannot save: 1 file needs fixing\. Nothing was saved\./)).toBeInTheDocument()
    expect(screen.getByText('Stocks: layouts add up to 23, the report says 22')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm & Save' })).toBeDisabled()
  })

  it('shows warnings without blocking', () => {
    show({ ...OK, warnings: ['CP-c.pdf: the title says grade SS500, the report says HSS500'] })
    expect(screen.getByText(/the title says grade SS500/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm & Save' })).toBeEnabled()
  })

  it('blocks saving when every size is already in the system with the same report', () => {
    show({ ...OK, alreadyInSystem: [
      { profile: 'PIPE 113.5X2.4', uploadId: 3, sameReport: true },
      { profile: 'PIPE 101.6X2.6', uploadId: 3, sameReport: true },
    ] })
    expect(screen.getByText(/Every size is already in the system/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm & Save' })).toBeDisabled()
  })
})
