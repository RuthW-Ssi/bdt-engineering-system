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

export function findLatestPdfForMark<T extends DrawingRow>(drawings: T[], mark: string): T | null {
  const pdfs = drawings.filter(d => d.file_name.toLowerCase().endsWith('.pdf'))
  if (pdfs.length === 0) return null
  const latestVersion = Math.max(...pdfs.map(d => d.version))
  const matches = pdfs.filter(
    d => d.version === latestVersion && extractMarkFromFilename(d.file_name).toLowerCase() === mark.toLowerCase(),
  )
  if (matches.length === 0) return null
  return matches.reduce((newest, d) => (new Date(d.create_date) > new Date(newest.create_date) ? d : newest))
}
