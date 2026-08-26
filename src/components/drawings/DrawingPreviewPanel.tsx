import { AlertTriangle, FileText, Loader2 } from 'lucide-react'
import type { Drawing } from '../../api/drawings'
import { useDrawingApsStatus, useDrawingApsViewerToken } from '../../hooks/useDrawings'
import { DrawingApsPreview } from './DrawingApsPreview'

interface Props {
  drawing: Drawing | null
}

const EMPTY_STATE_STYLE = {
  display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center',
  gap: 8, height: '100%', color: '#8E8E8E', fontSize: 13, textAlign: 'center' as const, padding: 24,
}

// Every drawing is a .dwg — DrawingUploadModal only ever offers that
// extension since 2026-08-26, when DXF/PDF/PNG/JPG support (and the
// per-extension dispatch that used to live here) was removed as dead weight
// once .dwg became the only real use case for this feature. Preview is
// always the APS-translated 2D view, polled while translation is running.
export function DrawingPreviewPanel({ drawing }: Props) {
  const { data: apsStatus } = useDrawingApsStatus(drawing?.id ?? null)
  const status = apsStatus?.status ?? drawing?.aps_translation_status ?? null
  const { data: viewerToken } = useDrawingApsViewerToken(status === 'complete' ? drawing!.id : null)

  if (!drawing) {
    return (
      <div style={EMPTY_STATE_STYLE}>
        <FileText size={32} style={{ opacity: 0.3 }} />
        Select a drawing to preview
      </div>
    )
  }

  if (status === 'complete' && viewerToken?.urn) {
    return <DrawingApsPreview urn={viewerToken.urn} accessToken={viewerToken.access_token} />
  }

  if (status === 'failed') {
    return (
      <div style={{ ...EMPTY_STATE_STYLE, color: '#C8202A' }}>
        <AlertTriangle size={24} />
        <div style={{ fontWeight: 600, color: '#1F1F1F' }}>{drawing.file_name}</div>
        <div>{apsStatus?.error ?? 'Preview generation failed'} — download to view</div>
      </div>
    )
  }

  // null/processing — the upload just landed and the async APS push hasn't
  // reported a terminal state yet.
  return (
    <div style={EMPTY_STATE_STYLE}>
      <Loader2 size={20} className="animate-spin" />Generating preview...
    </div>
  )
}
