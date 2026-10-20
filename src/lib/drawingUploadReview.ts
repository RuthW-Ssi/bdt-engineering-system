import type { Drawing } from '../api/drawings'

// Upload review table (wiki: features/drawing-revision-plan.md) — classifies
// each staged file against the zone's existing drawings before the user
// confirms the upload. Pure so Task 5's modal and its tests can both call it
// without a backend.
export type ReviewStatus = 'needs-input' | 'new-mark' | 'new-rev' | 'add-sheet' | 'replace' | 'lower-rev'

export function classifyUpload(
  item: { mark: string | null; rev: number | null; fileName: string },
  existing: Drawing[],
): { status: ReviewStatus; currentRev: number | null } {
  const { mark, rev, fileName } = item
  if (mark === null || rev === null) return { status: 'needs-input', currentRev: null }

  // Case-insensitive — same rule markDrawingVersions/mark-drawing-match
  // always used, so "a" and "A" are the same mark.
  const markRows = existing.filter(d => d.mark !== null && d.mark.toLowerCase() === mark.toLowerCase())
  const knownRevs = markRows.map(d => d.rev).filter((r): r is number => r !== null)
  const currentRev = knownRevs.length > 0 ? Math.max(...knownRevs) : null

  if (currentRev === null) return { status: 'new-mark', currentRev: null }
  if (rev > currentRev) return { status: 'new-rev', currentRev }
  if (rev < currentRev) return { status: 'lower-rev', currentRev }

  // rev === currentRev: same zone + mark + rev + file name replaces the old
  // file; a different file name at the same rev is another sheet.
  const sameFileName = markRows.some(d => d.rev === rev && d.file_name === fileName)
  return { status: sameFileName ? 'replace' : 'add-sheet', currentRev }
}
