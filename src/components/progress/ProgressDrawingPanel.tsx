import { useState } from 'react'
import { FileText, Loader2 } from 'lucide-react'
import { useZoneDrawings } from '../../hooks/useDrawings'
import { DrawingPreviewPanel } from '../drawings/DrawingPreviewPanel'
import type { Drawing } from '../../api/drawings'

interface Props {
  zoneId: number
  // Currently-selected assembly's mark (from the same selection state 3D
  // isolate-by-row already uses) — null when no row is selected. Matched
  // against each drawing's own `mark` column (falling back to the filename
  // only for legacy rows that predate the mark/rev backfill — see
  // matchesMark below), not an id/relation.
  mark: string | null
}

const EMPTY_STATE_STYLE = {
  display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center',
  gap: 8, height: '100%', background: '#F0F0F0', border: '0.5px solid #E0E0E0', borderRadius: 12,
  color: '#ABABAB', fontSize: 13, textAlign: 'center' as const, padding: 16,
}

// A drawing's filename leads with its mark, e.g. "DBN-B1-CTR10 - - Rev 1.pdf"
// — used only as a fallback for the handful of legacy rows that predate the
// mark/rev backfill (d.mark == null), same rule as lib/markDrawingRevs.ts:
// every row since then carries a real `mark` column, matched directly
// instead. Split on " - " (the CAD export tool's own field separator)
// rather than a prefix/substring check, so "CTR1" never matches a file
// actually named "CTR10 - ...".
function extractMarkFromFilename(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^.]+$/, '')
  return withoutExt.split(' - ')[0].trim()
}

function matchesMark(d: Drawing, mark: string): boolean {
  const drawingMark = d.mark ?? extractMarkFromFilename(d.file_name)
  return drawingMark.toLowerCase() === mark.toLowerCase()
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
  // .pdf only — .dwg has no in-page preview since the Autodesk APS pipeline's
  // 2026-09-15 removal (DrawingPreviewPanel would just show its "download to
  // view" empty state for one). DWG and PDF are independent version
  // sequences per zone (see wiki/features/drawing.md), so picking "latest
  // version across both" could pick a higher-numbered .dwg over a real,
  // viewable lower-numbered .pdf — filtering to .pdf first avoids that.
  const markMatches = mark == null ? [] : list.filter(d => d.file_name.toLowerCase().endsWith('.pdf') && matchesMark(d, mark))
  // A legacy row with rev === null (no "Rev" token at all) folds into rev 0
  // — same "first issue" convention markDrawingRevs.ts/drawingMarkRows.ts
  // already use — so it still shows up instead of silently disappearing.
  const revs = [...new Set(markMatches.map(d => d.rev ?? 0))].sort((a, b) => b - a)
  const latestRev = revs[0] ?? null
  const visibleDrawings = latestRev == null ? [] : markMatches.filter(d => (d.rev ?? 0) === latestRev)
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
