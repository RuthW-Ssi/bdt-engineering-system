// Server-side port of WoVisualTab.tsx's listMarkDrawingRevs (frontend),
// filtered to .pdf instead of .dwg — the MO print packet embeds the
// print-ready PDF companion file, never the raw .dwg. Matched by the row's
// own `mark` column, falling back to the filename convention only for the
// handful of legacy rows that predate the mark/rev backfill (mark === null):
// a drawing's filename leads with its mark, e.g. "DBN-A1-CTR1 - - Rev 1.pdf".
// Split on " - " (the CAD export tool's own field separator) rather than a
// prefix/substring check, so "CTR1" never matches a file actually named
// "CTR10 - ...".
export interface DrawingRow {
  file_name: string
  mark: string | null
  rev: number | null
  create_date: Date | string
}

function extractMarkFromFilename(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^.]+$/, '')
  return withoutExt.split(' - ')[0].trim()
}

// The mark's own newest .pdf (2026-10-05, print option A — same rule as the
// WO Visual tab's listMarkDrawingRevs default): filter by mark FIRST, then
// take the highest rev. Revs are sparse (one upload = one rev holding only
// that batch's files), so the old "zone's newest version, then the mark"
// rule returned null — and blocked the whole packet with a 409 — whenever a
// later batch didn't happen to re-upload this mark. Several matches at one
// rev → the most recently uploaded. A legacy row with rev === null folds
// into rev 0, same convention as the frontend twin.
export function findLatestPdfForMark<T extends DrawingRow>(drawings: T[], mark: string): T | null {
  const target = mark.toLowerCase()
  const matches = drawings.filter(d => {
    if (!d.file_name.toLowerCase().endsWith('.pdf')) return false
    const drawingMark = d.mark ?? extractMarkFromFilename(d.file_name)
    return drawingMark.toLowerCase() === target
  })
  if (matches.length === 0) return null
  const rev = (d: T) => d.rev ?? 0
  return matches.reduce((best, d) =>
    rev(d) > rev(best) || (rev(d) === rev(best) && new Date(d.create_date) > new Date(best.create_date)) ? d : best,
  )
}
