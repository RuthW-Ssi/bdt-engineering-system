import { AlertTriangle, FileText, Loader2 } from 'lucide-react'
import type { Drawing } from '../../api/drawings'
import { useDrawingPdfUrl } from '../../hooks/useDrawings'

interface Props {
  drawing: Drawing | null
}

const EMPTY_STATE_STYLE = {
  display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center',
  gap: 8, height: '100%', color: '#8E8E8E', fontSize: 13, textAlign: 'center' as const, padding: 24,
}

function isPdf(drawing: Drawing): boolean {
  return drawing.file_name.toLowerCase().endsWith('.pdf')
}

// .pdf is the only previewable format — fetched as an authenticated blob
// and rendered directly in an iframe (browser-native PDF rendering, see
// useDrawingPdfUrl). .dwg has no in-page preview (the Autodesk APS 2D-preview
// push was removed 2026-09-15 — every upload was an unconditional billed
// Model Derivative job, and a bug in that push path burned real Flex-token
// budget confirming it; see wiki/features/drawing.md): honest "download to
// view" empty state instead, same pattern as every other unavailable-preview
// case on this panel.
export function DrawingPreviewPanel({ drawing }: Props) {
  const { data: pdfUrl, isLoading: pdfLoading, isError: pdfError } = useDrawingPdfUrl(drawing && isPdf(drawing) ? drawing.file_key : null)

  if (!drawing) {
    return (
      <div style={EMPTY_STATE_STYLE}>
        <FileText size={32} style={{ opacity: 0.3 }} />
        Select a drawing to preview
      </div>
    )
  }

  if (isPdf(drawing)) {
    if (pdfError) {
      return (
        <div style={{ ...EMPTY_STATE_STYLE, color: '#C8202A' }}>
          <AlertTriangle size={24} />
          <div style={{ fontWeight: 600, color: '#1F1F1F' }}>{drawing.file_name}</div>
          <div>Failed to load preview — download to view</div>
        </div>
      )
    }
    if (pdfLoading || !pdfUrl) {
      return (
        <div style={EMPTY_STATE_STYLE}>
          <Loader2 size={20} className="animate-spin" />Loading preview...
        </div>
      )
    }
    // #navpanes=0 is a standard PDF open parameter Chrome/Edge's built-in
    // viewer honors — collapses the thumbnail/outline side panel it opens
    // by default, so the sheet fills the available width instead of
    // competing with a second, app-level side panel for space.
    //
    // No `sandbox` attribute: tried `sandbox=""` as a defense-in-depth layer
    // against content-type spoofing (security finding F-001) and reverted it
    // — Chromium's native PDF viewer does not run inside a sandboxed iframe
    // at all (a real, long-standing engine limitation, not a config we got
    // wrong; no combination of sandbox tokens restores it), so it silently
    // blocked every real preview ("This page has been blocked by Chrome").
    // The actual fix for F-001 lives one layer down instead: useDrawingPdfUrl
    // re-wraps the fetched blob as `application/pdf` unconditionally before
    // this src is ever built, so what the browser renders here can never be
    // driven by a spoofed content-type regardless of what's stored server-side.
    return (
      <iframe
        src={`${pdfUrl}#navpanes=0`}
        title={drawing.file_name}
        style={{ width: '100%', height: '100%', border: 'none' }}
      />
    )
  }

  return (
    <div style={EMPTY_STATE_STYLE}>
      <FileText size={32} style={{ opacity: 0.3 }} />
      <div style={{ fontWeight: 600, color: '#1F1F1F' }}>{drawing.file_name}</div>
      <div>No in-page preview for .dwg — download to view, or upload a matching .pdf</div>
    </div>
  )
}
