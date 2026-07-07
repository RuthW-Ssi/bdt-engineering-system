import { vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { dispatchesApi } from '../api/dispatches'
import type { PreviewJunctionsResult } from '../api/dispatches'
import { useUploadBomWithPreview } from './useBomDispatches'

vi.mock('../api/dispatches', () => ({
  dispatchesApi: {
    previewUpload: vi.fn(),
    upload: vi.fn(),
  },
}))

const mockedApi = vi.mocked(dispatchesApi)

const cleanResult: PreviewJunctionsResult = { unmatchedAssemblyMarks: [], unmatchedPartMarks: [] }
const mismatchResult: PreviewJunctionsResult = { unmatchedAssemblyMarks: ['A9'], unmatchedPartMarks: [] }

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

function makeFormData(): FormData {
  return new FormData()
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useUploadBomWithPreview', () => {
  it('clean submit: preview finds no mismatch, upload proceeds directly', async () => {
    mockedApi.previewUpload.mockResolvedValue(cleanResult)
    mockedApi.upload.mockResolvedValue({} as never)

    const { result } = renderHook(() => useUploadBomWithPreview(), { wrapper })

    await act(async () => {
      await result.current.submit(makeFormData())
    })

    expect(mockedApi.previewUpload).toHaveBeenCalledTimes(1)
    expect(mockedApi.upload).toHaveBeenCalledTimes(1)
    expect(result.current.pendingMismatch).toBeNull()
  })

  it('mismatch found: upload is held, pendingMismatch is set', async () => {
    mockedApi.previewUpload.mockResolvedValue(mismatchResult)
    mockedApi.upload.mockResolvedValue({} as never)

    const { result } = renderHook(() => useUploadBomWithPreview(), { wrapper })

    await act(async () => {
      await result.current.submit(makeFormData())
    })

    expect(mockedApi.previewUpload).toHaveBeenCalledTimes(1)
    expect(mockedApi.upload).not.toHaveBeenCalled()
    expect(result.current.pendingMismatch).toEqual(mismatchResult)
  })

  it('confirm(): proceeds with the held upload and clears pendingMismatch', async () => {
    mockedApi.previewUpload.mockResolvedValue(mismatchResult)
    mockedApi.upload.mockResolvedValue({} as never)

    const { result } = renderHook(() => useUploadBomWithPreview(), { wrapper })

    await act(async () => {
      await result.current.submit(makeFormData())
    })
    expect(result.current.pendingMismatch).toEqual(mismatchResult)

    await act(async () => {
      await result.current.confirm()
    })

    expect(mockedApi.upload).toHaveBeenCalledTimes(1)
    expect(result.current.pendingMismatch).toBeNull()
  })

  it('cancel(): clears pendingMismatch without ever uploading', async () => {
    mockedApi.previewUpload.mockResolvedValue(mismatchResult)
    mockedApi.upload.mockResolvedValue({} as never)

    const { result } = renderHook(() => useUploadBomWithPreview(), { wrapper })

    await act(async () => {
      await result.current.submit(makeFormData())
    })
    expect(result.current.pendingMismatch).toEqual(mismatchResult)

    act(() => {
      result.current.cancel()
    })

    await waitFor(() => expect(result.current.pendingMismatch).toBeNull())
    expect(mockedApi.upload).not.toHaveBeenCalled()
  })

  it('regression (2026-07-06 bug): a clean resubmit after an earlier mismatch clears the stale pendingMismatch', async () => {
    mockedApi.upload.mockResolvedValue({} as never)

    const { result } = renderHook(() => useUploadBomWithPreview(), { wrapper })

    // first submit: mismatch found, held
    mockedApi.previewUpload.mockResolvedValueOnce(mismatchResult)
    await act(async () => {
      await result.current.submit(makeFormData())
    })
    expect(result.current.pendingMismatch).toEqual(mismatchResult)

    // user edits the file set and resubmits — this time it's clean
    mockedApi.previewUpload.mockResolvedValueOnce(cleanResult)
    await act(async () => {
      await result.current.submit(makeFormData())
    })

    expect(result.current.pendingMismatch).toBeNull()
    expect(mockedApi.upload).toHaveBeenCalledTimes(1) // only the clean submit uploaded
  })
})
