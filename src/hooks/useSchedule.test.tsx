import { vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { activateScheduleVersion, runSchedule } from '../api/schedule'
import { useActivateVersion, useRunSchedule } from './useSchedule'

vi.mock('../api/schedule', () => ({
  getScheduleBoard: vi.fn(),
  runSchedule: vi.fn(),
  activateScheduleVersion: vi.fn(),
}))

let qc: QueryClient
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

const timeout = Object.assign(new Error('Request failed with status code 504'), { isAxiosError: true, response: { status: 504, data: {} } })

beforeEach(() => {
  vi.clearAllMocks()
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
})

describe('schedule mutations', () => {
  // a 504 only aborts the backend's call — prod-scheduler may still save a version
  it('useRunSchedule refreshes the board even when the run fails', async () => {
    vi.mocked(runSchedule).mockRejectedValue(timeout)
    const invalidate = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useRunSchedule(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ direction: 'event' }).catch(() => undefined)
    })

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['schedule', 'board'] })
  })

  it('useActivateVersion refreshes the board even when the activation fails', async () => {
    vi.mocked(activateScheduleVersion).mockRejectedValue(timeout)
    const invalidate = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useActivateVersion(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync(3).catch(() => undefined)
    })

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['schedule', 'board'] })
  })
})
