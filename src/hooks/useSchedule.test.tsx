import { vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { activateScheduleVersion, getScheduleFourM, runSchedule, type ScheduleFourM } from '../api/schedule'
import { useActivateVersion, useRunSchedule, useScheduleFourM } from './useSchedule'

vi.mock('../api/schedule', () => ({
  getScheduleBoard: vi.fn(),
  getScheduleFourM: vi.fn(),
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

const fourm = (version_id: number | null): ScheduleFourM => ({
  version_id,
  operators_by_team: [],
  stock: { materials: 0, with_stock: 0, short: 0 },
  wip: { status: 'ok', rows: [] },
  first_seq_by_mo: [],
})

describe('useScheduleFourM', () => {
  it('loads the 4M data of the given version', async () => {
    vi.mocked(getScheduleFourM).mockResolvedValue(fourm(3))
    const { result } = renderHook(() => useScheduleFourM(3), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(getScheduleFourM).toHaveBeenCalledWith(3)
    expect(result.current.data?.version_id).toBe(3)
  })

  it('waits while disabled (board not loaded yet)', () => {
    renderHook(() => useScheduleFourM(null, { enabled: false }), { wrapper })
    expect(getScheduleFourM).not.toHaveBeenCalled()
  })

  it('keeps the previous version\'s data while the next one loads', async () => {
    vi.mocked(getScheduleFourM).mockResolvedValueOnce(fourm(3)).mockReturnValueOnce(new Promise(() => undefined))
    const { result, rerender } = renderHook(({ v }) => useScheduleFourM(v), { wrapper, initialProps: { v: 3 } })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    rerender({ v: 4 })
    expect(result.current.isPlaceholderData).toBe(true)
    expect(result.current.data?.version_id).toBe(3)
  })

  it('is refreshed together with the board after a run and after an activation', async () => {
    const key = ['schedule', 'board', 'fourm', 3]
    vi.mocked(runSchedule).mockRejectedValue(timeout)
    vi.mocked(activateScheduleVersion).mockRejectedValue(timeout)
    const run = renderHook(() => useRunSchedule(), { wrapper }).result
    const activate = renderHook(() => useActivateVersion(), { wrapper }).result

    qc.setQueryData(key, fourm(3))
    await act(() => run.current.mutateAsync({ direction: 'event' }).catch(() => undefined))
    expect(qc.getQueryState(key)?.isInvalidated).toBe(true)

    qc.setQueryData(key, fourm(3))
    expect(qc.getQueryState(key)?.isInvalidated).toBe(false)
    await act(() => activate.current.mutateAsync(3).catch(() => undefined))
    expect(qc.getQueryState(key)?.isInvalidated).toBe(true)
  })
})
