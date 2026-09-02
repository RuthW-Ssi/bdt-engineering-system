import { useState } from 'react'
import { FileText, Loader2 } from 'lucide-react'
import { useZoneDrawings } from '../../hooks/useDrawings'
import { DrawingPreviewPanel } from '../drawings/DrawingPreviewPanel'

interface Props {
  zoneId: number
  // Currently-selected assembly's mark (from the same selection state 3D
  // isolate-by-row already uses) — null when no row is selected. Drawing
  // files are named "<mark> - <suffix> - Rev N.dwg", so this is a prefix
  // match, not an id/relation (Drawing itself is zone-scoped, not per-mark,
  // per its DB schema — the mark association only exists in the filename).
  mark: string | null
}

const EMPTY_STATE_STYLE = {
  display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center',
  gap: 8, height: '100%', background: '#F0F0F0', border: '0.5px solid #E0E0E0', borderRadius: 12,
  color: '#ABABAB', fontSize: 13, textAlign: 'center' as const, padding: 16,
}

// Prefix match with a boundary check — plain startsWith would let mark
// "DBN-B1-CTR1" wrongly match a file named "DBN-B1-CTR10 - ...".
function fileMatchesMark(fileName: string, mark: string): boolean {
  return fileName.startsWith(mark) && (fileName.length === mark.length || !/[A-Za-z0-9]/.test(fileName[mark.length]))
}

// Drawing's toggle sibling to the 3D viewport in ProjectProgress — zone-level
// fetch (sub_zone_id: null, since this page has no sub-zone selector at all),
// then filtered down to the selected assembly's mark so this mirrors 3D's
// per-assembly isolate behavior instead of dumping every drawing in the zone.
// Always shows the latest version's files; no version picker here, this is a
// quick-look panel, not the full Drawing management page (that's /drawings).
export function ProgressDrawingPanel({ zoneId, mark }: Props) {
  const { data: drawingsList, isLoading } = useZoneDrawings(zoneId, null)
  // Caller keys this component by mark (key={mark}), so a manual pick from
  // one mark's file list can't leak into another — switching marks fully
  // remounts this component instead of needing an effect to reset state.
  const [manualDrawingId, setManualDrawingId] = useState<number | null>(null)

  const list = drawingsList ?? []
  const markMatches = mark == null ? [] : list.filter(d => fileMatchesMark(d.file_name, mark))
  const versions = [...new Set(markMatches.map(d => d.version))].sort((a, b) => b - a)
  const latestVersion = versions[0] ?? null
  const visibleDrawings = latestVersion == null ? [] : markMatches.filter(d => d.version === latestVersion)
  const selectedDrawing = visibleDrawings.find(d => d.id === manualDrawingId) ?? visibleDrawings[0] ?? null

  if (mark == null) {
    return (
      <div style={EMPTY_STATE_STYLE}>
        <FileText size={28} style={{ opacity: 0.3 }} />
        <span>Select an assembly to view its drawing</span>
      </div>
    )
  }

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
        <span>No drawing found for {mark}</span>
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
