import type { Drawing } from '../api/drawings'

// A drawing's filename leads with its mark, e.g. "DBN-B1-CTR10 - - Rev 1.dwg"
// — there is no mark/WO association in the drawing schema (see
// wiki/features/drawing.md's Constraints list), so this is filename
// convention, not a stored relation. Split on " - " (the CAD export tool's
// own field separator) rather than a prefix/substring check, so "CTR1"
// never matches a file actually named "CTR10 - ...".
function extractMarkFromFilename(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^.]+$/, '')
  return withoutExt.split(' - ')[0].trim()
}

export interface MarkDrawingVersion {
  version: number
  drawing: Drawing
}

// Every drawing version that contains this mark's PDF, newest first — feeds
// the WO Visual tab's drawing version picker (2026-10-05), whose default is
// [0]. Filters by mark BEFORE picking versions: drawing versions are sparse
// (one upload action = one version holding only that batch's files), so a
// newer batch that skipped this mark must not hide the mark's own older
// drawing. The old findLatestPdfForMark took the zone's newest version first
// and returned null in exactly that case (its backend twin,
// mo-print/mark-drawing-match.ts, still does). .pdf, not .dwg — the Autodesk
// APS 2D-preview pipeline was removed 2026-09-15 (see
// wiki/features/drawing.md), so .pdf is the only format DrawingPreviewPanel
// can actually show. Several matches inside one version → keep the most
// recently uploaded.
export function listMarkDrawingVersions(drawings: Drawing[], mark: string): MarkDrawingVersion[] {
  const byVersion = new Map<number, Drawing>()
  for (const d of drawings) {
    if (!d.file_name.toLowerCase().endsWith('.pdf')) continue
    if (extractMarkFromFilename(d.file_name).toLowerCase() !== mark.toLowerCase()) continue
    const kept = byVersion.get(d.version)
    if (!kept || new Date(d.create_date) > new Date(kept.create_date)) byVersion.set(d.version, d)
  }
  return [...byVersion.entries()].sort(([a], [b]) => b - a).map(([version, drawing]) => ({ version, drawing }))
}
