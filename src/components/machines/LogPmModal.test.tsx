import { render, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { toast } from 'sonner'
import { LogPmModal } from './LogPmModal'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../../api/machines', () => ({
  createMaintenanceLog: vi.fn().mockResolvedValue({}),
  uploadMachinePhoto: vi.fn(),
}))
afterEach(() => vi.clearAllMocks())

function renderModal() {
  const qc = new QueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <LogPmModal machineId={1} onClose={vi.fn()} />
    </QueryClientProvider>,
  )
}

// 2026-10-22 (dateInputGuard rollout): LogPmModal's "Date performed" field
// used to go straight onChange → setForm with no validity check at all —
// representative of the plain `set(field, value)` useState-form shape most
// machine modals share (ReportRepairModal, CloseRepairTicketModal are the
// same pattern).
describe('LogPmModal date performed input', () => {
  it('toasts and clears the field on an out-of-range year', () => {
    const { container } = renderModal()
    const input = container.querySelector('input[type="datetime-local"]') as HTMLInputElement

    fireEvent.change(input, { target: { value: '2101-01-01T08:00' } })
    expect(input.value).toBe('2101-01-01T08:00')

    fireEvent.blur(input)
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Date performed'))
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('วันที่ไม่ถูกต้อง'))
    expect(input.value).toBe('')
  })

  it('keeps a normal value untouched', () => {
    const { container } = renderModal()
    const input = container.querySelector('input[type="datetime-local"]') as HTMLInputElement

    fireEvent.change(input, { target: { value: '2026-10-20T09:30' } })
    fireEvent.blur(input)

    expect(toast.error).not.toHaveBeenCalled()
    expect(input.value).toBe('2026-10-20T09:30')
  })
})
