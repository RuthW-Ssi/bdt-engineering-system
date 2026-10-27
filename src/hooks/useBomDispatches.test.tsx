import { vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { dispatchesApi } from '../api/dispatches'
import type { UploadPreviewDto, RevReviewDto } from '../api/dispatches'
import { useUploadBomWithPreview, useSaveRenames, useUndoRename } from './useBomDispatches'

vi.mock('../api/dispatches', () => ({
  dispatchesApi: {
    previewUpload: vi.fn(),
    upload: vi.fn(),
  },
}))

const mockedApi = vi.mocked(dispatchesApi)

const emptyReview: RevReviewDto = { base_dispatch_id: 7, has_dn: false, rows: [], dn_only_marks: [], dn_warnings: [] }
const cleanResult: UploadPreviewDto = { unmatchedAssemblyMarks: [], unmatchedPartMarks: [], review: emptyReview }
const mismatchResult: UploadPreviewDto = { unmatchedAssemblyMarks: ['A9'], unmatchedPartMarks: [], review: emptyReview }
const reviewRow = { mark: 'B1', kind: 'changed' as const, prev_rev: 1, suggested_rev: 2, suggested_source: 'MANUAL' as const, dn_rev: null, dn_status: null, in_dn: false, warning: 'CHANGED_NO_REV_UP' as const, dn_cancelled_in_files: false, rename_hint: null, editable: true, diff: null }
const reviewResult: UploadPreviewDto = { ...cleanResult, review: { ...emptyReview, rows: [reviewRow] } }

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

  it('review rows → upload is held and pendingReview is set; confirmReview sends revs + base_dispatch_id', async () => {
    mockedApi.previewUpload.mockResolvedValue(reviewResult)
    mockedApi.upload.mockResolvedValue({} as never)
    const { result } = renderHook(() => useUploadBomWithPreview(), { wrapper })
    const fd = new FormData()
    fd.append('zone_id', '2')
    await act(async () => { await result.current.submit(fd) })
    expect(mockedApi.upload).not.toHaveBeenCalled()
    expect(result.current.pendingReview).toEqual(reviewResult.review)
    await act(async () => { await result.current.confirmReview([{ mark: 'B1', rev: 3 }]) })
    const sent = mockedApi.upload.mock.calls[0][0] as FormData
    expect(sent.get('zone_id')).toBe('2')
    expect(sent.get('revs')).toBe('[{"mark":"B1","rev":3}]')
    expect(sent.get('base_dispatch_id')).toBe('7')
    expect(result.current.pendingReview).toBeNull()
  })

  // final review fix 4: a stale-preview 409 must not leave the review open (retrying would 409 forever)
  it('a 409 (someone uploaded meanwhile) on save clears the pending review so the user re-uploads', async () => {
    mockedApi.previewUpload.mockResolvedValue(reviewResult)
    mockedApi.upload.mockRejectedValue({ response: { status: 409, data: { message: 'stale' } } })
    const { result } = renderHook(() => useUploadBomWithPreview(), { wrapper })
    await act(async () => { await result.current.submit(new FormData()) })
    expect(result.current.pendingReview).toEqual(reviewResult.review)
    await act(async () => { await expect(result.current.confirmReview([{ mark: 'B1', rev: 3 }])).rejects.toBeTruthy() })
    expect(result.current.pendingReview).toBeNull()
  })

  it('any other failed save keeps the review open to retry or cancel', async () => {
    mockedApi.previewUpload.mockResolvedValue(reviewResult)
    mockedApi.upload.mockRejectedValue({ response: { status: 500 } })
    const { result } = renderHook(() => useUploadBomWithPreview(), { wrapper })
    await act(async () => { await result.current.submit(new FormData()) })
    await act(async () => { await expect(result.current.confirmReview([{ mark: 'B1', rev: 3 }])).rejects.toBeTruthy() })
    expect(result.current.pendingReview).toEqual(reviewResult.review)
  })

  it('the preview gets the NC files and the zone (it compares with the zone\'s current BOM)', async () => {
    mockedApi.previewUpload.mockResolvedValue(cleanResult)
    mockedApi.upload.mockResolvedValue({} as never)
    const { result } = renderHook(() => useUploadBomWithPreview(), { wrapper })
    const fd = new FormData()
    for (const [k, v] of [['project_id', '1'], ['zone_id', '2'], ['sub_zone_id', '3'], ['upload_mode', 'combined']]) fd.append(k, v)
    fd.append('nc_files', new File(['x'], 'p1.nc1'))
    await act(async () => { await result.current.submit(fd) })
    const preview = mockedApi.previewUpload.mock.calls[0][0] as FormData
    expect([preview.get('project_id'), preview.get('zone_id'), preview.get('sub_zone_id'), preview.get('upload_mode')]).toEqual(['1', '2', '3', 'combined'])
    expect((preview.getAll('nc_files')[0] as File).name).toBe('p1.nc1')
    expect((mockedApi.upload.mock.calls[0][0] as FormData).get('base_dispatch_id')).toBe('7')
  })
})

// final review: a pair / undo changes MO compare, WO version status, paint
// config and Project Progress — their caches refresh too, not just the BOM page
describe('useSaveRenames / useUndoRename cache refresh', () => {
  const EXPECTED = [
    ['rename-candidates', 5], ['dispatch-renames', 5], ['dispatch-diff', 5], ['dispatch', 5],
    ['mo'], ['wo'], ['paint-config'], ['mbom'], ['project-progress'],
  ]
  function setup() {
    const api = mockedApi as unknown as Record<string, unknown>
    api.saveRenames = vi.fn().mockResolvedValue({})
    api.undoRename = vi.fn().mockResolvedValue({})
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const w = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    const keys = () => spy.mock.calls.map(c => (c[0] as { queryKey: unknown[] }).queryKey)
    return { w, keys }
  }

  it('useSaveRenames invalidates the BOM page keys and the mo / wo / paint-config / mbom / project-progress prefixes', async () => {
    const { w, keys } = setup()
    const { result } = renderHook(() => useSaveRenames(5), { wrapper: w })
    await act(async () => { await result.current.mutateAsync([]) })
    expect(keys()).toEqual(expect.arrayContaining(EXPECTED))
  })

  it('useUndoRename invalidates the same keys', async () => {
    const { w, keys } = setup()
    const { result } = renderHook(() => useUndoRename(5), { wrapper: w })
    await act(async () => { await result.current.mutateAsync(9) })
    expect(keys()).toEqual(expect.arrayContaining(EXPECTED))
  })
})
