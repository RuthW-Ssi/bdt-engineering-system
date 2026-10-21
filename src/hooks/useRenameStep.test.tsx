import { vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { dispatchesApi } from '../api/dispatches'
import { useRenameStep } from './useRenameStep'

vi.mock('../api/dispatches', () => ({ dispatchesApi: { getRenameCandidates: vi.fn() } }))
vi.mock('sonner', () => ({ toast: { info: vi.fn() } }))
const api = vi.mocked(dispatchesApi)
const empty = { dispatch_id: 9, latest: true, assemblies: [], parts: [], new_assemblies: [], new_parts: [] }

describe('useRenameStep', () => {
  it('opens only when something disappeared', async () => {
    api.getRenameCandidates.mockResolvedValueOnce({ ...empty, parts: [{ mark: 'C-x', ref_id: 3, data: null, suggestions: [] }] })
    const { result } = renderHook(() => useRenameStep())
    let opened = false
    await act(async () => { opened = await result.current.afterUpload(9) })
    expect([opened, result.current.dispatchId]).toEqual([true, 9])
    act(() => result.current.close())
    expect(result.current.dispatchId).toBeNull()
  })

  it('nothing disappeared, or the check fails → continue as before (never blocks the upload)', async () => {
    api.getRenameCandidates.mockResolvedValueOnce(empty)
    const { result } = renderHook(() => useRenameStep())
    await act(async () => { expect(await result.current.afterUpload(9)).toBe(false) })
    api.getRenameCandidates.mockRejectedValueOnce(new Error('down'))
    await act(async () => { expect(await result.current.afterUpload(9)).toBe(false) })
    expect(result.current.dispatchId).toBeNull()
  })
})
