import { vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import * as drawingsApi from '../api/drawings'
import { useUploadDrawings, useDrawingPdfUrl } from './useDrawings'

vi.mock('../api/drawings', () => ({
  getDrawingsByZone: vi.fn(),
  getLatestDrawingVersion: vi.fn(),
  uploadDrawing: vi.fn(),
  deleteDrawing: vi.fn(),
  getDrawingApsStatus: vi.fn(),
  getDrawingApsViewerToken: vi.fn(),
  fetchDrawingBlob: vi.fn(),
}))

const mocked = vi.mocked(drawingsApi)

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

const scope = {
  projectId: 1, projectCode: '0X220',
  zoneId: 7, zoneCode: 'Z1',
  subZoneId: null, subZoneCode: null,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useUploadDrawings', () => {
  it('looks up the next version scoped to the selected file type before uploading', async () => {
    mocked.getLatestDrawingVersion.mockResolvedValue({ version: 2 })
    mocked.uploadDrawing.mockResolvedValue({} as any)
    const file = new File(['x'], 'plan-A.pdf')

    const { result } = renderHook(() => useUploadDrawings(scope), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ files: [file], fileType: 'pdf' })
    })

    expect(mocked.getLatestDrawingVersion).toHaveBeenCalledWith(7, null, 'pdf')
    expect(mocked.uploadDrawing).toHaveBeenCalledWith(expect.objectContaining({ version: 3 }))
  })

  it('DWG and PDF uploads look up their next version independently of each other', async () => {
    mocked.getLatestDrawingVersion.mockResolvedValue({ version: null })
    mocked.uploadDrawing.mockResolvedValue({} as any)
    const file = new File(['x'], 'plan-A.dwg')

    const { result } = renderHook(() => useUploadDrawings(scope), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ files: [file], fileType: 'dwg' })
    })

    expect(mocked.getLatestDrawingVersion).toHaveBeenCalledWith(7, null, 'dwg')
    expect(mocked.uploadDrawing).toHaveBeenCalledWith(expect.objectContaining({ version: 1 }))
  })
})

describe('useDrawingPdfUrl', () => {
  it('fetches the file as a blob and exposes an object URL', async () => {
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' })
    mocked.fetchDrawingBlob.mockResolvedValue(blob)
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake-url')

    const { result } = renderHook(() => useDrawingPdfUrl('drawings/0X220/Z1/v1/plan-A.pdf'), { wrapper })

    await waitFor(() => expect(result.current.data).toBe('blob:fake-url'))
    expect(mocked.fetchDrawingBlob).toHaveBeenCalledWith('drawings/0X220/Z1/v1/plan-A.pdf')
    createSpy.mockRestore()
  })

  // Security finding F-001 (docs/security/findings/2026-09-14-drawing-pdf-upload.md):
  // the backend now allowlists upload contentType, but this hook doesn't
  // trust the *fetched* blob's declared type either — it's re-wrapped as
  // application/pdf unconditionally before becoming an object URL. This
  // hook only ever runs for files this dispatch already decided are PDFs
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

    const { result } = renderHook(() => useDrawingPdfUrl('drawings/0X220/Z1/v1/plan-A.pdf'), { wrapper })

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
      { wrapper, initialProps: { fileKey: 'drawings/0X220/Z1/v1/plan-A.pdf' } },
    )
    await waitFor(() => expect(result.current.data).toBe('blob:fake-url'))

    rerender({ fileKey: null }) // simulates switching to the DWG tab

    expect(revokeSpy).not.toHaveBeenCalledWith('blob:fake-url')

    createSpy.mockRestore()
    revokeSpy.mockRestore()
  })
})
