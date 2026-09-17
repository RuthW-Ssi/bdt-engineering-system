import { vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { ActivityBuilderModal } from './ActivityBuilder'

const createSpy = vi.fn()
const updateSpy = vi.fn()
let existingActivity: unknown = undefined

vi.mock('../hooks/useActivities', () => ({
  useActivity: () => ({ data: existingActivity, isLoading: false }),
  useCreateActivity: () => ({ mutateAsync: createSpy }),
  useUpdateActivity: () => ({ mutateAsync: updateSpy }),
}))
vi.mock('../hooks/usePermission', () => ({ usePermission: () => true }))
vi.mock('../api/consumeFormulas', () => ({ consumeFormulasApi: { list: vi.fn().mockResolvedValue([]) } }))
vi.mock('../api/routingFormulas', () => ({ routingFormulaParamsApi: { list: vi.fn().mockResolvedValue([]) } }))
// The material/tool/skill pickers fetch their own option lists on mount.
vi.mock('../api/client', () => ({
  apiClient: {
    get: vi.fn((url: string) => Promise.resolve({ data: url === '/materials' ? { items: [] } : [] })),
  },
}))

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

beforeEach(() => {
  vi.clearAllMocks()
  existingActivity = undefined
  createSpy.mockResolvedValue({})
  updateSpy.mockResolvedValue({})
})

// Every activity created through this form used to be saved as kind='run' —
// there was no way to mark a setup/move/inspect step, and setup time is
// summed separately from run time by computeActivityDuration() (2026-09-16).
describe('ActivityBuilderModal — kind', () => {
  it('sends the selected kind on create', async () => {
    render(<ActivityBuilderModal onClose={() => {}} />, { wrapper })

    fireEvent.change(screen.getByPlaceholderText('e.g. Cut H-beam web plate'), { target: { value: 'Flip the workpiece' } })
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'move' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Activity' }))

    await waitFor(() => expect(createSpy).toHaveBeenCalled())
    expect(createSpy.mock.calls[0][0]).toMatchObject({ name: 'Flip the workpiece', kind: 'move' })
  })

  it('defaults kind to run on a new activity', () => {
    render(<ActivityBuilderModal onClose={() => {}} />, { wrapper })

    expect(screen.getByLabelText('Kind')).toHaveValue('run')
  })

  it('loads the existing kind when editing', async () => {
    existingActivity = {
      id: 7, activity_code: 'ACT-00066', name: 'Lift the workpiece onto the jig', duration_min: '10.00',
      kind: 'setup', per_minute: null, formula_code: null, ratio: null, ratio_unit: null, per_time: null,
      consumes: [], skills: [], tools: [],
    }
    render(<ActivityBuilderModal activityId={7} onClose={() => {}} />, { wrapper })

    await waitFor(() => expect(screen.getByLabelText('Kind')).toHaveValue('setup'))
  })
})
