import { render, screen } from '@testing-library/react'
import { CuttingPlanPreviewModal } from './CuttingPlanPreviewModal'
import type { CuttingPlanPreviewResult } from '../../api/cutting-plan'

const OK: CuttingPlanPreviewResult = {
  summary: { plateCount: 3, partCount: 10, plateUsageCount: 3, remnantCount: 1 },
  reportProblems: [],
  mappingError: null,
  fileProblems: [],
  alreadyInSystem: [],
}
const show = (preview: CuttingPlanPreviewResult) =>
  render(<CuttingPlanPreviewModal preview={preview} onCancel={() => {}} onConfirm={() => {}} isUploading={false} />)

describe('CuttingPlanPreviewModal', () => {
  it('lets a clean upload be saved', () => {
    show(OK)
    expect(screen.getByRole('button', { name: 'Confirm & Save' })).toBeEnabled()
  })

  // 2026-11-09: any problem in a report refuses the whole upload; every one is listed by plate and section
  it('lists every report problem by plate, section and problem, and blocks saving', () => {
    show({
      ...OK,
      reportProblems: [
        { file: 'Z00-14-6.txt', section: 'Remnants', problem: 'R2380 has no dimensions' },
        { file: 'Z00-14-6.txt', section: 'Remnants', problem: 'R2381 has no dimensions' },
        { file: 'Z100-5-1.txt', section: 'Used Material', problem: 'The plate row has 12 cells, the header has 11' },
      ],
    })
    expect(screen.getByText(/2 plates need fixing/)).toBeInTheDocument()
    expect(screen.getByText(/Nothing was saved/)).toBeInTheDocument()
    const rows = screen.getAllByRole('row').slice(1).map(r => r.textContent)
    expect(rows).toEqual([
      'Z00-14-6RemnantsR2380 has no dimensions',
      'Z00-14-6RemnantsR2381 has no dimensions',
      'Z100-5-1Used MaterialThe plate row has 12 cells, the header has 11',
    ])
    expect(screen.getByRole('button', { name: 'Confirm & Save' })).toBeDisabled()
  })

  // 2026-11-10: a plate already in the system is skipped when its report is the same, saved as the newer
  // version when it changed; nothing to save when every plate is a copy
  it('lists plates already in the system, says what happens to each, and still lets the rest be saved', () => {
    show({
      ...OK,
      alreadyInSystem: [
        { plate: 'Z00-14-6', ncFile: '00006585.cld', uploadId: 57, sameReport: true },
        { plate: 'Z00-14-7', ncFile: '00006586.cld', uploadId: 57, sameReport: false },
      ],
    })
    expect(screen.getByText(/2 of 3 plates are already in the system/)).toBeInTheDocument()
    const rows = screen.getAllByRole('row').slice(1).map(r => r.textContent)
    expect(rows).toEqual([
      'Z00-14-600006585.cld#57Same report · not saved again',
      'Z00-14-700006586.cld#57Report changed · saved as the newer version',
    ])
    expect(screen.getByRole('button', { name: 'Confirm & Save' })).toBeEnabled()
  })

  it('blocks saving when every plate is already in the system with the same report', () => {
    show({
      ...OK,
      summary: { ...OK.summary, plateCount: 1 },
      alreadyInSystem: [{ plate: 'Z00-14-6', ncFile: '00006585.cld', uploadId: 57, sameReport: true }],
    })
    expect(screen.getByText(/Every plate is already in the system/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm & Save' })).toBeDisabled()
  })
})
