import { vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Drawing } from '../../api/drawings'
import { DrawingPreviewPanel } from './DrawingPreviewPanel'
import { useDrawingApsStatus, useDrawingApsViewerToken, useDrawingPdfUrl } from '../../hooks/useDrawings'

vi.mock('../../hooks/useDrawings', () => ({
  useDrawingApsStatus: vi.fn(),
  useDrawingApsViewerToken: vi.fn(),
  useDrawingPdfUrl: vi.fn(),
}))

vi.mock('./DrawingApsPreview', () => ({
  DrawingApsPreview: ({ urn }: { urn: string }) => <div data-testid="aps-preview">{urn}</div>,
}))

const mockedApsStatus = vi.mocked(useDrawingApsStatus)
const mockedApsToken = vi.mocked(useDrawingApsViewerToken)
const mockedPdfUrl = vi.mocked(useDrawingPdfUrl)

function makeDrawing(overrides: Partial<Drawing> = {}): Drawing {
  return {
    id: 1, project_id: 1, zone_id: 7, sub_zone_id: null, version: 1,
    file_key: 'drawings/0X220/Z1/v1/plan-A.dwg', file_name: 'plan-A.dwg',
    mime_type: null, uploaded_by_id: 1, create_date: '2026-01-01T00:00:00Z',
    aps_urn: null, aps_translation_status: null, aps_translation_error: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApsStatus.mockReturnValue({ data: undefined } as any)
  mockedApsToken.mockReturnValue({ data: undefined } as any)
  mockedPdfUrl.mockReturnValue({ data: undefined, isLoading: false, isError: false } as any)
})

describe('DrawingPreviewPanel', () => {
  it('shows an empty state when no drawing is selected', () => {
    render(<DrawingPreviewPanel drawing={null} />)
    expect(screen.getByText(/select a drawing to preview/i)).toBeInTheDocument()
  })

  it('renders the APS viewer for a .dwg once translation is complete (unchanged behavior)', () => {
    mockedApsStatus.mockReturnValue({ data: { id: 1, status: 'complete', error: null } } as any)
    mockedApsToken.mockReturnValue({ data: { urn: 'urn:abc', access_token: 'tok' } } as any)

    render(<DrawingPreviewPanel drawing={makeDrawing()} />)

    expect(screen.getByTestId('aps-preview')).toHaveTextContent('urn:abc')
  })

  it('renders a PDF in an iframe instead of going through APS', () => {
    mockedPdfUrl.mockReturnValue({ data: 'blob:fake-url', isLoading: false, isError: false } as any)

    render(<DrawingPreviewPanel drawing={makeDrawing({ file_name: 'plan-A.pdf', file_key: 'drawings/0X220/Z1/v1/plan-A.pdf' })} />)

    expect(screen.getByTitle('plan-A.pdf')).toBeInTheDocument()
    expect(screen.queryByTestId('aps-preview')).not.toBeInTheDocument()
  })

  // Security finding F-001 (docs/security/findings/2026-09-14-drawing-pdf-upload.md):
  // a `sandbox=""` iframe was tried here as defense in depth and reverted —
  // Chromium's native PDF viewer does not run inside a sandboxed iframe at
  // all (confirmed live: "This page has been blocked by Chrome" on every
  // real PDF), so it isn't a viable mitigation. The actual fix lives in
  // useDrawingPdfUrl (forces the blob's type to application/pdf regardless
  // of the server-declared content-type) — this component must NOT gain a
  // sandbox attribute back without re-verifying live in Chrome first.
  it('does not sandbox the PDF iframe (Chromium does not run its native PDF viewer inside a sandboxed iframe — verified live)', () => {
    mockedPdfUrl.mockReturnValue({ data: 'blob:fake-url', isLoading: false, isError: false } as any)

    render(<DrawingPreviewPanel drawing={makeDrawing({ file_name: 'plan-A.pdf', file_key: 'drawings/0X220/Z1/v1/plan-A.pdf' })} />)

    const iframe = screen.getByTitle('plan-A.pdf') as HTMLIFrameElement
    expect(iframe.hasAttribute('sandbox')).toBe(false)
  })

  it('opens the PDF with the built-in viewer\'s thumbnail/outline side panel collapsed, so the sheet fills the space', () => {
    mockedPdfUrl.mockReturnValue({ data: 'blob:fake-url', isLoading: false, isError: false } as any)

    render(<DrawingPreviewPanel drawing={makeDrawing({ file_name: 'plan-A.pdf', file_key: 'drawings/0X220/Z1/v1/plan-A.pdf' })} />)

    const iframe = screen.getByTitle('plan-A.pdf') as HTMLIFrameElement
    expect(iframe.src).toBe('blob:fake-url#navpanes=0')
  })

  it('shows a loading state for a PDF whose blob is still being fetched', () => {
    mockedPdfUrl.mockReturnValue({ data: undefined, isLoading: true, isError: false } as any)

    render(<DrawingPreviewPanel drawing={makeDrawing({ file_name: 'plan-A.pdf', file_key: 'drawings/0X220/Z1/v1/plan-A.pdf' })} />)

    expect(screen.queryByTitle('plan-A.pdf')).not.toBeInTheDocument()
  })

  it('shows a download-instead error state when the PDF blob fails to fetch (QA-03)', () => {
    mockedPdfUrl.mockReturnValue({ data: undefined, isLoading: false, isError: true } as any)

    render(<DrawingPreviewPanel drawing={makeDrawing({ file_name: 'plan-A.pdf', file_key: 'drawings/0X220/Z1/v1/plan-A.pdf' })} />)

    expect(screen.queryByTitle('plan-A.pdf')).not.toBeInTheDocument()
    expect(screen.getByText(/failed to load preview/i)).toBeInTheDocument()
    expect(screen.getByText('plan-A.pdf')).toBeInTheDocument()
  })
})
