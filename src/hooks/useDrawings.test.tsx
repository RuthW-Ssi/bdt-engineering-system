import { vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import * as drawingsApi from '../api/drawings'
import { drawingKey } from '../api/drawings'
import { useUploadDrawings, useDrawingPdfUrl, useDrawingBomMarks, type StagedDrawing } from './useDrawings'

// Partial mock: `drawingKey` is a pure function whose own shape is verified
// directly below (real implementation), everything else that touches the
// network is replaced with a spy. `getLatestDrawingVersion` is gone from the
// real module entirely (Task 3 removed GET /drawings/latest-version) — there
// is nothing left to mock or call.
vi.mock('../api/drawings', async importOriginal => {
  const actual = await importOriginal<typeof import('../api/drawings')>()
  return {
    ...actual,
    getDrawingsByZone: vi.fn(),
    uploadDrawing: vi.fn(),
    getDrawingBomMarks: vi.fn(),
    deleteDrawing: vi.fn(),
    fetchDrawingBlob: vi.fn(),
  }
})

const mocked = vi.mocked(drawingsApi)

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

const scope = {
  projectId: 1, projectCode: 'P1',
  zoneId: 7, zoneCode: 'Z1',
  subZoneId: null, subZoneCode: null,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('drawingKey', () => {
  it('builds drawings/<project>/<zone>/<mark>/rev<n>/<file> with no sub-zone', () => {
    expect(
      drawingKey({ projectCode: 'P1', zoneCode: 'Z1', subZoneCode: null }, '2BUH1A-1', 2, '2BUH1A-1 - BEAM - Rev 2.pdf'),
    ).toBe('drawings/P1/Z1/2BUH1A-1/rev2/2BUH1A-1 - BEAM - Rev 2.pdf')
  })

  it('inserts the sub-zone code segment when present', () => {
    expect(
      drawingKey({ projectCode: 'P1', zoneCode: 'Z1', subZoneCode: 'S1' }, 'B1', 0, 'plan-A.pdf'),
    ).toBe('drawings/P1/Z1/S1/B1/rev0/plan-A.pdf')
  })

  it('sanitizes / and \\ in the mark so it cannot add extra path segments', () => {
    expect(
      drawingKey({ projectCode: 'P1', zoneCode: 'Z1', subZoneCode: null }, 'A/B\\C', 1, 'plan.pdf'),
    ).toBe('drawings/P1/Z1/A_B_C/rev1/plan.pdf')
  })

  it('sanitizes / and \\ in the file name so it cannot add extra path segments', () => {
    expect(
      drawingKey({ projectCode: 'P1', zoneCode: 'Z1', subZoneCode: null }, 'B1', 1, 'a/b\\c.pdf'),
    ).toBe('drawings/P1/Z1/B1/rev1/a_b_c.pdf')
  })
})

describe('useUploadDrawings', () => {
  it('uploads each staged item with its own mark + rev, no latest-version lookup', async () => {
    mocked.uploadDrawing.mockResolvedValue({} as any)
    const file = new File(['x'], '2BUH1A-1 - BEAM - Rev 2.pdf')
    const items: StagedDrawing[] = [{ file, fileName: '2BUH1A-1 - BEAM - Rev 2.pdf', mark: '2BUH1A-1', rev: 2 }]

    const { result } = renderHook(() => useUploadDrawings(scope), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(items)
    })

    expect(mocked.uploadDrawing).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 1, projectCode: 'P1', zoneId: 7, zoneCode: 'Z1', subZoneId: null, subZoneCode: null,
        mark: '2BUH1A-1', rev: 2, fileName: '2BUH1A-1 - BEAM - Rev 2.pdf', file,
      }),
    )
    // The expected key for this exact input is pinned by the `drawingKey`
    // suite above — this test only needs to prove the hook plumbs mark/rev
    // through untouched; `uploadDrawing` (mocked here) owns turning them
    // into that key.
  })

  it('dedupes identical file names only within the same (mark, rev) pair', async () => {
    mocked.uploadDrawing.mockResolvedValue({} as any)
    const fileA = new File(['a'], 'plan.pdf')
    const fileB = new File(['b'], 'plan.pdf')
    const fileC = new File(['c'], 'plan.pdf')
    const items: StagedDrawing[] = [
      { file: fileA, fileName: 'plan.pdf', mark: 'B1', rev: 1 },
      { file: fileB, fileName: 'plan.pdf', mark: 'B1', rev: 1 }, // same mark+rev+name → -2
      { file: fileC, fileName: 'plan.pdf', mark: 'B2', rev: 1 }, // different mark → no suffix
    ]

    const { result } = renderHook(() => useUploadDrawings(scope), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(items)
    })

    expect(mocked.uploadDrawing).toHaveBeenNthCalledWith(1, expect.objectContaining({ fileName: 'plan.pdf', mark: 'B1', rev: 1 }))
    expect(mocked.uploadDrawing).toHaveBeenNthCalledWith(2, expect.objectContaining({ fileName: 'plan-2.pdf', mark: 'B1', rev: 1 }))
    expect(mocked.uploadDrawing).toHaveBeenNthCalledWith(3, expect.objectContaining({ fileName: 'plan.pdf', mark: 'B2', rev: 1 }))
  })

  it('uploads independently (allSettled) and reports the failed count without aborting the rest', async () => {
    mocked.uploadDrawing
      .mockResolvedValueOnce({} as any)
      .mockRejectedValueOnce(new Error('nope'))
    const items: StagedDrawing[] = [
      { file: new File(['a'], 'a.pdf'), fileName: 'a.pdf', mark: 'B1', rev: 1 },
      { file: new File(['b'], 'b.pdf'), fileName: 'b.pdf', mark: 'B2', rev: 1 },
    ]

    const { result } = renderHook(() => useUploadDrawings(scope), { wrapper })
    let outcome: { uploaded: number; failed: unknown[] } | undefined
    await act(async () => {
      outcome = await result.current.mutateAsync(items)
    })

    expect(outcome?.uploaded).toBe(1)
    expect(outcome?.failed).toHaveLength(1)
  })
})

describe('useDrawingBomMarks', () => {
  it('fetches the distinct BOM marks for a zone (or sub-zone)', async () => {
    mocked.getDrawingBomMarks.mockResolvedValue(['B1', 'B2'])

    const { result } = renderHook(() => useDrawingBomMarks(7, null), { wrapper })

    await waitFor(() => expect(result.current.data).toEqual(['B1', 'B2']))
    expect(mocked.getDrawingBomMarks).toHaveBeenCalledWith(7, null)
  })

  it('does not fetch when zoneId is undefined', () => {
    renderHook(() => useDrawingBomMarks(undefined, null), { wrapper })
    expect(mocked.getDrawingBomMarks).not.toHaveBeenCalled()
  })
})

describe('useDrawingPdfUrl', () => {
  it('fetches the file as a blob and exposes an object URL', async () => {
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' })
    mocked.fetchDrawingBlob.mockResolvedValue(blob)
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake-url')

    const { result } = renderHook(() => useDrawingPdfUrl('drawings/P1/Z1/B1/rev1/plan-A.pdf'), { wrapper })

    await waitFor(() => expect(result.current.data).toBe('blob:fake-url'))
    expect(mocked.fetchDrawingBlob).toHaveBeenCalledWith('drawings/P1/Z1/B1/rev1/plan-A.pdf')
    createSpy.mockRestore()
  })

  // Security finding F-001 (docs/security/findings/2026-09-14-drawing-pdf-upload.md):
  // the backend now allowlists upload contentType, but this hook doesn't
  // trust the *fetched* blob's declared type either — it's re-wrapped as
  // application/pdf unconditionally before becoming an object URL. This
  // hook only ever runs for a file the caller has already decided is a PDF
  // (DrawingPreviewPanel's isPdf() check), so forcing the type here is
  // always correct, and it means a spoofed content-type can never make the
  // resulting blob: URL render as anything other than a PDF — regardless of
  // what a compromised or future upstream ever stores. (A sandboxed iframe
  // was tried as a second defense layer and reverted — Chromium's native
  // PDF viewer doesn't run inside a sandboxed iframe at all, no combination
  // of sandbox tokens restores it, so it silently broke every real preview.)
  it('forces the resulting blob to type application/pdf regardless of the server-declared content-type', async () => {
    const spoofedBlob = new Blob(['<script>alert(1)</script>'], { type: 'text/html' })
    mocked.fetchDrawingBlob.mockResolvedValue(spoofedBlob)
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation((obj: Blob | MediaSource) => {
      expect((obj as Blob).type).toBe('application/pdf')
      return 'blob:forced-pdf'
    })

    const { result } = renderHook(() => useDrawingPdfUrl('drawings/P1/Z1/B1/rev1/plan-A.pdf'), { wrapper })

    await waitFor(() => expect(result.current.data).toBe('blob:forced-pdf'))
    createSpy.mockRestore()
  })

  it('does not fetch when fileKey is null', () => {
    renderHook(() => useDrawingPdfUrl(null), { wrapper })
    expect(mocked.fetchDrawingBlob).not.toHaveBeenCalled()
  })

  // Regression: switching the DrawingList type-toggle away from PDF and back
  // (e.g. DWG tab, then back to PDF) re-requests this same fileKey. With
  // staleTime: Infinity, React Query serves the cached URL again rather than
  // refetching — so revoking it just because the caller briefly stopped
  // asking for it leaves the cached string pointing at a dead blob, and the
  // PDF viewer shows "It may have been moved, edited, or deleted."
  it('does not revoke the object URL just because the caller temporarily stops requesting it', async () => {
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' })
    mocked.fetchDrawingBlob.mockResolvedValue(blob)
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake-url')
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    const { result, rerender } = renderHook(
      ({ fileKey }: { fileKey: string | null }) => useDrawingPdfUrl(fileKey),
      { wrapper, initialProps: { fileKey: 'drawings/P1/Z1/B1/rev1/plan-A.pdf' as string | null } },
    )
    await waitFor(() => expect(result.current.data).toBe('blob:fake-url'))

    rerender({ fileKey: null }) // simulates switching to the DWG tab

    expect(revokeSpy).not.toHaveBeenCalledWith('blob:fake-url')

    createSpy.mockRestore()
    revokeSpy.mockRestore()
  })
})
