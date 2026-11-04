import { vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AxiosError, AxiosHeaders } from 'axios'
import type { ReactNode } from 'react'
import * as woApi from '../api/wo'
import { useWoCancel, useWoDone, useWoTransition } from './useWo'

vi.mock('../api/wo', async importOriginal => ({
  ...(await importOriginal<typeof import('../api/wo')>()),
  woTransition: vi.fn(),
  woDone: vi.fn(),
  woCancel: vi.fn(),
}))

function httpError(status: number) {
  const config = { headers: new AxiosHeaders() }
  return new AxiosError('x', 'ERR', config, null, { status, statusText: '', headers: {}, config, data: { code: 'STALE_STATUS' } })
}

function setup<T>(hook: () => T) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  const spy = vi.spyOn(qc, 'invalidateQueries')
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  return { spy, ...renderHook(hook, { wrapper }) }
}

// 2026-11-04: a 409 means someone else changed the WO's status first — reload
// it so the screen shows the real status beside the error.
describe('useWoTransition', () => {
  it('reloads the WO when the server answers 409', async () => {
    vi.mocked(woApi.woTransition).mockRejectedValue(httpError(409))
    const { result, spy } = setup(() => useWoTransition(1))
    await act(async () => { await result.current.mutateAsync({ action: 'hold' }).catch(() => {}) })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['wo', 'detail', 1] })
  })

  it('does not reload on other errors (e.g. 400)', async () => {
    vi.mocked(woApi.woTransition).mockRejectedValue(httpError(400))
    const { result, spy } = setup(() => useWoTransition(1))
    await act(async () => { await result.current.mutateAsync({ action: 'hold' }).catch(() => {}) })
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('useWoDone / useWoCancel', () => {
  it('Done reloads the WO on 409', async () => {
    vi.mocked(woApi.woDone).mockRejectedValue(httpError(409))
    const { result, spy } = setup(() => useWoDone(1))
    await act(async () => { await result.current.mutateAsync({} as never).catch(() => {}) })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['wo', 'detail', 1] })
  })

  it('Cancel reloads the WO on 409', async () => {
    vi.mocked(woApi.woCancel).mockRejectedValue(httpError(409))
    const { result, spy } = setup(() => useWoCancel(1))
    await act(async () => { await result.current.mutateAsync({} as never).catch(() => {}) })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['wo', 'detail', 1] })
  })
})
