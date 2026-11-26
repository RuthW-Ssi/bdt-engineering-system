import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import * as api from '../../api/cutting-plan'
import { RemnantRegister } from './RemnantRegister'

// User test report 2026-11-26: remnant database for reuse (Plate + Shape)
vi.mock('../../hooks/usePermission', () => ({ usePermission: () => true }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const ROWS: api.CuttingPlanRemnant[] = [
  { source: 'PLATE', source_id: 5, kind: 'PLATE', offcut_no: 'R3062', from_plate: '9229', profile: null, grade: 'HY370', thick_mm: 6, length_mm: 1491, width_mm: 1281, weight_kg: 90, qty: 1, used: 0, available: 1, certificate: 'MTC-118', upload_id: 170, project_code: '0X186', zone: 'Z3', uploaded: '2026-11-01T00:00:00Z' },
  { source: 'SHAPE', source_id: 40, kind: 'SHAPE', offcut_no: 'S40', from_plate: null, profile: 'PIPE 101.6X2.6', grade: 'HSS550', thick_mm: null, length_mm: 469.68, width_mm: null, weight_kg: null, qty: 6, used: 0, available: 6, certificate: null, upload_id: 2, project_code: '0X222', zone: 'Z07', uploaded: '2026-11-02T00:00:00Z' },
  { source: 'PLATE', source_id: 6, kind: 'PLATE', offcut_no: 'R3063', from_plate: '9247', profile: null, grade: 'HY370', thick_mm: 8, length_mm: 2944, width_mm: 1480, weight_kg: 274, qty: 1, used: 1, available: 0, certificate: null, upload_id: 170, project_code: '0X186', zone: 'Z3', uploaded: '2026-11-01T00:00:00Z' },
]

const wrap = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
    <MemoryRouter><RemnantRegister /></MemoryRouter>
  </QueryClientProvider>,
)

describe('RemnantRegister', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getRemnants').mockResolvedValue(ROWS)
    vi.spyOn(api, 'getPrices').mockResolvedValue([{ grade: 'HY370', thick_mm: 6, thb_per_kg: 23.54, material: 'BDTP000102' }])
    vi.spyOn(api, 'useRemnant').mockResolvedValue({})
  })
  afterEach(() => vi.restoreAllMocks())

  it('lists plate and shape remnants still available, with weight and value, and totals them', async () => {
    wrap()
    expect(await screen.findByText('R3062')).toBeInTheDocument()
    expect(screen.getByText('S40')).toBeInTheDocument()
    expect(screen.queryByText('R3063')).toBeNull() // used up: hidden while "Available only" is on
    expect(within(screen.getByText('R3062').closest('tr')!).getByText('฿2,119')).toBeInTheDocument() // 90 kg × 23.54
    expect(screen.getByTestId('remnant-total')).toHaveTextContent('Available 7 pcs')
    fireEvent.click(screen.getByLabelText('Available only'))
    expect(screen.getByText('R3063')).toBeInTheDocument()
  })

  it('filters by type and by search', async () => {
    wrap()
    await screen.findByText('R3062')
    fireEvent.click(screen.getByRole('button', { name: 'Shape' }))
    expect(screen.queryByText('R3062')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    fireEvent.change(screen.getByLabelText('Search remnants'), { target: { value: 'mtc-118' } })
    expect(screen.getByText('R3062')).toBeInTheDocument()
    expect(screen.queryByText('S40')).toBeNull()
  })

  it('Use takes pieces out with a note, never more than are left', async () => {
    wrap()
    const row = (await screen.findByText('S40')).closest('tr')!
    fireEvent.click(within(row).getByRole('button', { name: 'Use' }))
    const dlg = screen.getByRole('dialog', { name: 'Use remnant' })
    fireEvent.change(within(dlg).getByLabelText('Pieces to use'), { target: { value: '7' } })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Take out' }))
    expect(api.useRemnant).not.toHaveBeenCalled()
    fireEvent.change(within(dlg).getByLabelText('Pieces to use'), { target: { value: '2' } })
    fireEvent.change(within(dlg).getByLabelText('Used for'), { target: { value: 'job 0X225' } })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Take out' }))
    await waitFor(() => expect(api.useRemnant).toHaveBeenCalledWith({ source: 'SHAPE', source_id: 40, qty: 2, note: 'job 0X225' }))
  })
})
