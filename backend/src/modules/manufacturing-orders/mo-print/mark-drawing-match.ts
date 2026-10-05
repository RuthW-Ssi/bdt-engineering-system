// Server-side port of WoVisualTab.tsx's findLatestDwgForMark (frontend),
// filtered to .pdf instead of .dwg — the MO print packet embeds the
// print-ready PDF companion file, never the raw .dwg. Same filename
// convention: a drawing's filename leads with its mark, e.g.
// "DBN-A1-CTR1 - - Rev 1.pdf" — there is no mark/WO relation stored in the
// drawing schema (see wiki/features/drawing.md's Constraints list), split
// on " - " (the CAD export tool's own field separator) rather than a
// prefix/substring check, so "CTR1" never matches a file actually named
// "CTR10 - ...".
export interface DrawingRow {
  file_name: string
  version: number
  create_date: Date | string
}

function extractMarkFromFilename(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^.]+$/, '')
  return withoutExt.split(' - ')[0].trim()
}

// The mark's own newest .pdf (2026-10-05, print option A — same rule as the
// WO Visual tab's listMarkDrawingVersions default): filter by mark FIRST,
// then take the highest version. Drawing versions are sparse (one upload =
// one version holding only that batch's files), so the old "zone's newest
// version, then the mark" rule returned null — and blocked the whole packet
// with a 409 — whenever a later batch didn't happen to re-upload this mark.
// Several matches in one version → the most recently uploaded.
export function findLatestPdfForMark<T extends DrawingRow>(drawings: T[], mark: string): T | null {
  const matches = drawings.filter(
    d => d.file_name.toLowerCase().endsWith('.pdf') && extractMarkFromFilename(d.file_name).toLowerCase() === mark.toLowerCase(),
  )
  if (matches.length === 0) return null
  return matches.reduce((best, d) =>
    d.version > best.version || (d.version === best.version && new Date(d.create_date) > new Date(best.create_date)) ? d : best,
  )
}
