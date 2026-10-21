import { vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { dispatchesApi } from '../api/dispatches'
import { useRenameStep } from './useRenameStep'

vi.mock('../api/dispatches', () => ({ dispatchesApi: { getRenameCandidates: vi.fn() } }))
vi.mock('sonner', () => ({ toast: { info: vi.fn() } }))
const api = vi.mocked(dispatchesApi)
const empty = { dispatch_id: 9, latest: true, assemblies: [], parts: [], new_assemblies: [], new_parts: [] }

let qc: QueryClient
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
beforeEach(() => { qc = new QueryClient() })

describe('useRenameStep', () => {
  it('opens only when something disappeared', async () => {
    api.getRenameCandidates.mockResolvedValueOnce({ ...empty, parts: [{ mark: 'C-x', ref_id: 3, data: null, suggestions: [] }] })
    const { result } = renderHook(() => useRenameStep(), { wrapper })
    let opened = false
    await act(async () => { opened = await result.current.afterUpload(9) })
    expect([opened, result.current.dispatchId]).toEqual([true, 9])
    act(() => result.current.close())
    expect(result.current.dispatchId).toBeNull()
  })

  it('nothing disappeared, or the check fails → continue as before (never blocks the upload)', async () => {
    api.getRenameCandidates.mockResolvedValueOnce(empty)
    const { result } = renderHook(() => useRenameStep(), { wrapper })
    await act(async () => { expect(await result.current.afterUpload(9)).toBe(false) })
    api.getRenameCandidates.mockRejectedValueOnce(new Error('down'))
    await act(async () => { expect(await result.current.afterUpload(9)).toBe(false) })
    expect(result.current.dispatchId).toBeNull()
  })

  // final review: the dialog reads ['rename-candidates', id] — seed it so it doesn't GET the same thing again
  it('seeds the rename-candidates cache with what it fetched', async () => {
    const c = { ...empty, parts: [{ mark: 'C-x', ref_id: 3, data: null, suggestions: [] }] }
    api.getRenameCandidates.mockResolvedValueOnce(c)
    const { result } = renderHook(() => useRenameStep(), { wrapper })
    await act(async () => { await result.current.afterUpload(9) })
    expect(qc.getQueryData(['rename-candidates', 9])).toEqual(c)
  })
})
