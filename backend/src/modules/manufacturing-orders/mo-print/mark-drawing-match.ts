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

// Every sheet of the mark's own current rev (2026-10-21, "print every sheet
// and every page of the current rev" — this is currentRevSheetsForMark,
// replacing the old picker that returned a single winning file): filter by
// mark FIRST, then take every .pdf row at the highest rev found among those
// matches — a batch upload can hold several sheets of the same mark/rev
// (e.g. multiple views of one assembly), and every one of them must print,
// not just the most-recently-uploaded. Revs are sparse (one upload = one rev
// holding only that batch's files), so the old "zone's newest version, then
// the mark" rule returned nothing whenever a later batch didn't happen to
// re-upload this mark — this still filters by mark before picking a rev,
// same fix as before. Natural sort by file_name ('en' locale, numeric-aware
// + case-insensitive), same comparator as the frontend twin
// (src/lib/markDrawingRevs.ts's listMarkDrawingRevs) so print and the UI
// never disagree on sheet order; a trailing plain-string comparison breaks
// ties deterministically for case-only-different names. A legacy row with
// rev === null folds into rev 0, same convention as the frontend twin.
export function currentRevSheetsForMark<T extends DrawingRow>(drawings: T[], mark: string): T[] {
  const target = mark.toLowerCase()
  const matches = drawings.filter(d => {
    if (!d.file_name.toLowerCase().endsWith('.pdf')) return false
    const drawingMark = d.mark ?? extractMarkFromFilename(d.file_name)
    return drawingMark.toLowerCase() === target
  })
  if (matches.length === 0) return []
  const rev = (d: T) => d.rev ?? 0
  const currentRev = Math.max(...matches.map(rev))
  return matches
    .filter(d => rev(d) === currentRev)
    .sort((a, b) =>
      a.file_name.localeCompare(b.file_name, 'en', { numeric: true, sensitivity: 'base' }) ||
      (a.file_name < b.file_name ? -1 : a.file_name > b.file_name ? 1 : 0))
}
