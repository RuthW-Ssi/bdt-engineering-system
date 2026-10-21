import { vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import * as drawingsApi from '../api/drawings'
import { stagingUploadKey, type Drawing } from '../api/drawings'
import { useUploadDrawings, useDrawingPdfUrl, useDrawingBomMarks, type StagedDrawing } from './useDrawings'

// uploadDrawing resolves with the created row — these tests only assert on
// what gets sent (the request), not on the response shape, so a single
// minimal-but-real Drawing fixture stands in for every resolved call.
function makeDrawing(overrides: Partial<Drawing> = {}): Drawing {
  return {
    id: 1, project_id: 1, zone_id: 7, sub_zone_id: null, mark: 'B1', rev: 1, version: 1,
    file_key: 'drawings/P1/Z1/B1/rev1/x.pdf', file_name: 'x.pdf', mime_type: 'application/pdf',
    uploaded_by_id: 1, create_date: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

// Partial mock: `stagingUploadKey` is a pure function whose own shape is
// verified directly below (real implementation), everything else that
// touches the network is replaced with a spy. `getLatestDrawingVersion` is
// back — Tao reversed the "drop version" decision (Task 3/4) the same day it
// shipped: `version` is the upload BATCH number, orthogonal to mark/rev.
vi.mock('../api/drawings', async importOriginal => {
  const actual = await importOriginal<typeof import('../api/drawings')>()
  return {
    ...actual,
    getDrawingsByZone: vi.fn(),
    getLatestDrawingVersion: vi.fn(),
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
  // Sane default for every useUploadDrawings test below — individual tests
  // override it when the specific version number matters.
  mocked.getLatestDrawingVersion.mockResolvedValue({ version: null })
})

// Task 11 fix round 1, finding 1 (2026-10-20): the upload target is now a
// disposable STAGING key, not the final per-mark/rev key — the server builds
// that itself (backend file-key.ts) only once the upload is proven valid.
describe('stagingUploadKey', () => {
  it('builds drawings/_incoming/<projectCode>/<uuid>/<fileName>', () => {
    const uuidSpy = vi.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-1111-1111-1111-111111111111')
    expect(stagingUploadKey('P1', 'plan-A.pdf')).toBe('drawings/_incoming/P1/11111111-1111-1111-1111-111111111111/plan-A.pdf')
    uuidSpy.mockRestore()
  })

  it('sanitizes / and \\ in the file name so it cannot add extra path segments', () => {
    const uuidSpy = vi.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-1111-1111-1111-111111111111')
    expect(stagingUploadKey('P1', 'a/b\\c.pdf')).toBe('drawings/_incoming/P1/11111111-1111-1111-1111-111111111111/a_b_c.pdf')
    uuidSpy.mockRestore()
  })

  it('uses a real, distinct UUID per call (no mock)', () => {
    const a = stagingUploadKey('P1', 'x.pdf')
    const b = stagingUploadKey('P1', 'x.pdf')
    expect(a).not.toBe(b)
    expect(a).toMatch(/^drawings\/_incoming\/P1\/[0-9a-f-]{36}\/x\.pdf$/)
  })
})

describe('useUploadDrawings', () => {
  it('uploads each staged item with its own mark + rev, tagged with the batch version fetched once', async () => {
    mocked.getLatestDrawingVersion.mockResolvedValue({ version: 4 })
    mocked.uploadDrawing.mockResolvedValue(makeDrawing())
    const file = new File(['x'], '2BUH1A-1 - BEAM - Rev 2.pdf')
    const items: StagedDrawing[] = [{ file, fileName: '2BUH1A-1 - BEAM - Rev 2.pdf', mark: '2BUH1A-1', rev: 2 }]

    const { result } = renderHook(() => useUploadDrawings(scope), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(items)
    })

    expect(mocked.getLatestDrawingVersion).toHaveBeenCalledTimes(1)
    expect(mocked.getLatestDrawingVersion).toHaveBeenCalledWith(7, null)
    expect(mocked.uploadDrawing).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 1, projectCode: 'P1', zoneId: 7, zoneCode: 'Z1', subZoneId: null, subZoneCode: null,
        mark: '2BUH1A-1', rev: 2, version: 5, fileName: '2BUH1A-1 - BEAM - Rev 2.pdf', file,
      }),
    )
    // This test only needs to prove the hook plumbs mark/rev through
    // untouched; `uploadDrawing` (mocked here) owns staging the upload and
    // sending it to the server.
  })

  it('fetches the latest version once per batch and sends the same version on every file, even across different marks/revs', async () => {
    mocked.getLatestDrawingVersion.mockResolvedValue({ version: null }) // no prior .pdf upload for this zone yet
    mocked.uploadDrawing.mockResolvedValue(makeDrawing())
    const items: StagedDrawing[] = [
      { file: new File(['a'], 'a.pdf'), fileName: 'a.pdf', mark: 'B1', rev: 1 },
      { file: new File(['b'], 'b.pdf'), fileName: 'b.pdf', mark: 'B2', rev: 3 },
    ]

    const { result } = renderHook(() => useUploadDrawings(scope), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(items)
    })

    expect(mocked.getLatestDrawingVersion).toHaveBeenCalledTimes(1)
    expect(mocked.uploadDrawing).toHaveBeenNthCalledWith(1, expect.objectContaining({ mark: 'B1', rev: 1, version: 1 }))
    expect(mocked.uploadDrawing).toHaveBeenNthCalledWith(2, expect.objectContaining({ mark: 'B2', rev: 3, version: 1 }))
  })

  it('dedupes identical file names only within the same (mark, rev) pair', async () => {
    mocked.uploadDrawing.mockResolvedValue(makeDrawing())
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
      .mockResolvedValueOnce(makeDrawing())
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
