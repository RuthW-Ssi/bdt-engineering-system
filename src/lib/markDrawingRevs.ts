import type { Drawing } from '../api/drawings'

// A drawing's filename leads with its mark, e.g. "DBN-B1-CTR10 - - Rev 1.dwg"
// — used only as a fallback for the handful of legacy rows that predate the
// mark/rev backfill (d.mark === null, see wiki/features/drawing-revision-plan.md);
// every row since then carries a real `mark` column, matched directly
// instead. Split on " - " (the CAD export tool's own field separator)
// rather than a prefix/substring check, so "CTR1" never matches a file
// actually named "CTR10 - ...".
function extractMarkFromFilename(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^.]+$/, '')
  return withoutExt.split(' - ')[0].trim()
}

export interface MarkDrawingRev {
  rev: number
  drawing: Drawing
}

// Every rev that holds this mark's PDF, newest first — feeds the WO Visual
// tab's drawing rev picker, whose default is [0]. Filters by mark BEFORE
// picking revs: revs are sparse (one upload action = one rev holding only
// that batch's files), so a newer upload that skipped this mark must not
// hide the mark's own older drawing. The old findLatestPdfForMark took the
// zone's newest version first and returned null in exactly that case (its
// backend twin, mo-print/mark-drawing-match.ts, still does). .pdf, not
// .dwg — the Autodesk APS 2D-preview pipeline was removed 2026-09-15 (see
// wiki/features/drawing.md), so .pdf is the only format DrawingPreviewPanel
// can actually show. Several matches for one rev → keep the most recently
// uploaded. A legacy row with rev === null (no "Rev" token at all) folds
// into rev 0 — same "first issue" convention drawingMarkRows.ts's
// groupByRev already uses — so it still shows up instead of silently
// disappearing from the picker. Mark match is case-insensitive, same rule
// as mark-drawing-match.ts / drawingUploadReview.ts / drawingMarkRows.ts.
export function listMarkDrawingRevs(drawings: Drawing[], mark: string): MarkDrawingRev[] {
  const target = mark.toLowerCase()
  const byRev = new Map<number, Drawing>()
  for (const d of drawings) {
    if (!d.file_name.toLowerCase().endsWith('.pdf')) continue
    const drawingMark = d.mark ?? extractMarkFromFilename(d.file_name)
    if (drawingMark.toLowerCase() !== target) continue
    const rev = d.rev ?? 0
    const kept = byRev.get(rev)
    if (!kept || new Date(d.create_date) > new Date(kept.create_date)) byRev.set(rev, d)
  }
  return [...byRev.entries()].sort(([a], [b]) => b - a).map(([rev, drawing]) => ({ rev, drawing }))
}
