import { useState } from 'react'
import { FileText, Loader2 } from 'lucide-react'
import { useZoneDrawings } from '../../hooks/useDrawings'
import { DrawingPreviewPanel } from '../drawings/DrawingPreviewPanel'

interface Props {
  zoneId: number
}

const EMPTY_STATE_STYLE = {
  display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center',
  gap: 8, height: '100%', background: '#F0F0F0', border: '0.5px solid #E0E0E0', borderRadius: 12,
  color: '#ABABAB', fontSize: 13, textAlign: 'center' as const, padding: 16,
}

// Drawing's toggle sibling to the 3D viewport in ProjectProgress — zone-level
// only (sub_zone_id: null), since this page has no sub-zone selector at all
// (unlike DrawingList's full zone+sub-zone scoping). Always shows the latest
// version's files; no version picker here, this is a quick-look panel, not
// the full Drawing management page (that's still /drawings for full history).
export function ProgressDrawingPanel({ zoneId }: Props) {
  const { data: drawingsList, isLoading } = useZoneDrawings(zoneId, null)
  const [manualDrawingId, setManualDrawingId] = useState<number | null>(null)

  const list = drawingsList ?? []
  const versions = [...new Set(list.map(d => d.version))].sort((a, b) => b - a)
  const latestVersion = versions[0] ?? null
  const visibleDrawings = latestVersion == null ? [] : list.filter(d => d.version === latestVersion)
  const selectedDrawing = visibleDrawings.find(d => d.id === manualDrawingId) ?? visibleDrawings[0] ?? null

  if (isLoading) {
    return (
      <div style={EMPTY_STATE_STYLE}>
        <Loader2 size={20} className="animate-spin" />
      </div>
    )
  }

  if (visibleDrawings.length === 0) {
    return (
      <div style={EMPTY_STATE_STYLE}>
        <FileText size={28} style={{ opacity: 0.3 }} />
        <span>No drawings uploaded for this zone yet</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col" style={{ height: '100%', minHeight: 0 }}>
      {visibleDrawings.length > 1 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', paddingBottom: 8, flexShrink: 0 }}>
          {visibleDrawings.map(d => (
            <button
              key={d.id}
              onClick={() => setManualDrawingId(d.id)}
              style={{
                font: 'inherit', fontSize: 11, padding: '4px 8px', borderRadius: 6, cursor: 'pointer',
                border: `1px solid ${selectedDrawing?.id === d.id ? '#C8202A' : '#E0E0E0'}`,
                background: selectedDrawing?.id === d.id ? '#FCEBEB' : 'white',
                color: selectedDrawing?.id === d.id ? '#C8202A' : '#555',
                whiteSpace: 'nowrap',
              }}
            >
              {d.file_name}
            </button>
          ))}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, borderRadius: 12, overflow: 'hidden', background: '#F0F0F0', border: '0.5px solid #E0E0E0' }}>
        <DrawingPreviewPanel drawing={selectedDrawing} />
      </div>
    </div>
  )
}
