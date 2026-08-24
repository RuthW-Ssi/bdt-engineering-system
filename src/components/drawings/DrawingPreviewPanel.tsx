import { useEffect, useState } from 'react'
import { AlertTriangle, FileText, Loader2 } from 'lucide-react'
import { fetchDrawingBlob, type Drawing } from '../../api/drawings'
import { DxfPreview, type DxfMetadata } from './DxfPreview'

interface Props {
  drawing: Drawing | null
}

const EMPTY_STATE_STYLE = {
  display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center',
  gap: 8, height: '100%', color: '#8E8E8E', fontSize: 13, textAlign: 'center' as const, padding: 24,
}

function fileExt(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot > 0 ? fileName.slice(dot + 1).toLowerCase() : ''
}

// Dispatches by file extension: PDF/PNG/JPG render via the browser's own
// native <iframe>/<img> support (no extra library needed); DXF renders via
// DxfPreview (dxf-viewer, a real WebGL parse+render — DXF is an open format
// a browser-side parser can actually read). DWG is a closed binary CAD
// format with no viable browser-side parser — falls back to a file-details
// card rather than a broken/fake preview.
export function DrawingPreviewPanel({ drawing }: Props) {
  const [blob, setBlob] = useState<Blob | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [dxfMeta, setDxfMeta] = useState<DxfMetadata | null>(null)

  useEffect(() => {
    setDxfMeta(null) // stale metadata belongs to whatever was previously selected
    if (!drawing) {
      setBlob(null)
      setStatus('idle')
      return
    }
    let cancelled = false
    setStatus('loading')
    setBlob(null)
    fetchDrawingBlob(drawing.file_key)
      .then(b => {
        if (cancelled) return
        setBlob(b)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [drawing?.id, drawing?.file_key])

  // Object URL for the browser-native viewers (PDF/image) — DxfPreview
  // manages its own internally, it just needs the raw Blob.
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!blob) {
      setBlobUrl(null)
      return
    }
    const url = URL.createObjectURL(blob)
    setBlobUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [blob])

  if (!drawing) {
    return (
      <div style={EMPTY_STATE_STYLE}>
        <FileText size={32} style={{ opacity: 0.3 }} />
        Select a drawing to preview
      </div>
    )
  }

  if (status === 'loading') {
    return (
      <div style={EMPTY_STATE_STYLE}>
        <Loader2 size={20} className="animate-spin" />Loading preview...
      </div>
    )
  }

  if (status === 'error' || !blob) {
    return (
      <div style={{ ...EMPTY_STATE_STYLE, color: '#C8202A' }}>
        <AlertTriangle size={24} />Couldn't load this file for preview
      </div>
    )
  }

  const ext = fileExt(drawing.file_name)

  if (ext === 'dxf') {
    return (
      <div className="flex flex-col" style={{ height: '100%' }}>
        <div style={{ flex: 1, minHeight: 0 }}>
          <DxfPreview blob={blob} onMetadata={setDxfMeta} />
        </div>
        {dxfMeta && (
          <div
            className="flex items-center gap-4 border-t border-chrome-100"
            style={{ padding: '8px 16px', fontSize: 12, color: '#8E8E8E', flexShrink: 0, fontFamily: 'IBM Plex Mono, ui-monospace, monospace' }}
          >
            <span>W <span style={{ color: '#1F1F1F', fontWeight: 600 }}>{dxfMeta.width.toFixed(1)}</span></span>
            <span>H <span style={{ color: '#1F1F1F', fontWeight: 600 }}>{dxfMeta.height.toFixed(1)}</span></span>
            <span>{dxfMeta.layerCount} layer{dxfMeta.layerCount === 1 ? '' : 's'}</span>
          </div>
        )}
      </div>
    )
  }

  if (ext === 'pdf' && blobUrl) {
    return <iframe src={blobUrl} title={drawing.file_name} style={{ width: '100%', height: '100%', border: 'none' }} />
  }

  if ((ext === 'png' || ext === 'jpg' || ext === 'jpeg') && blobUrl) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 16, background: '#FAFAF8' }}>
        <img src={blobUrl} alt={drawing.file_name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
      </div>
    )
  }

  // DWG (or anything else) — no browser-side renderer exists for it.
  return (
    <div style={EMPTY_STATE_STYLE}>
      <FileText size={32} style={{ opacity: 0.3 }} />
      <div style={{ fontWeight: 600, color: '#1F1F1F' }}>{drawing.file_name}</div>
      <div>Preview not available for .{ext || 'this'} files — download to view</div>
    </div>
  )
}
