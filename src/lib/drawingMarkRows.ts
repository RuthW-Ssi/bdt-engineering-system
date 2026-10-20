import type { Drawing } from '../api/drawings'

// Drawings page (Task 6, wiki: features/drawing-revision-plan.md) — one row
// per mark instead of a flat file list, each row holding every rev (not just
// current) so the per-row rev <select> can offer them. Pure so the page and
// this test can both run without a backend.

export interface MarkRevGroup {
  rev: number
  // Newest first within the rev — mirrors drawings.service.ts's own
  // orderBy ({ create_date: 'desc' }) for the same (mark, rev) group.
  files: Drawing[]
  // The newest create_date among this rev's files — files[0].create_date
  // once files is sorted, not a separate scan.
  uploadedAt: string
}

export interface MarkRow {
  mark: string | null
  // Highest rev first — current is revs[0], same definition as the
  // backend's currentRevRows (highest rev per mark, never a stored flag).
  revs: MarkRevGroup[]
}

// A handful of legacy rows predate the mark/rev backfill and have rev ===
// null (no "Rev" token in their filename at all — see drawingFileName.ts).
// Every upload path since Task 5 forces the user to type a rev before
// confirming, so this only ever fires for that pre-existing, un-bucketable
// data; folding it into rev 0 ("first issue") keeps every row displayable
// without inventing a second "unparsed" bucket the MarkRow type doesn't have.
function groupByRev(items: Drawing[]): MarkRevGroup[] {
  const byRev = new Map<number, Drawing[]>()
  for (const d of items) {
    const rev = d.rev ?? 0
    const list = byRev.get(rev)
    if (list) list.push(d)
    else byRev.set(rev, [d])
  }
  return [...byRev.entries()]
    .sort(([a], [b]) => b - a)
    .map(([rev, files]) => {
      const sorted = [...files].sort((a, b) => Date.parse(b.create_date) - Date.parse(a.create_date))
      return { rev, files: sorted, uploadedAt: sorted[0].create_date }
    })
}

// Rows sorted by mark, natural order (numeric: true — same convention
// ProjectProgress.tsx already uses for position strings) so "CTR2" sorts
// before "CTR10" rather than after it. Null marks never participate in that
// sort — they collect into one row, always last.
//
// Grouped case-insensitively — the same "same mark" rule the rest of the
// branch already uses (backend's current-rev.ts's own top-rev computation,
// the upload review table's classifyUpload): marks are persisted verbatim,
// so "abc" and "ABC" are the same physical mark that happened to get typed
// with different casing on different uploads, not two marks. The row's
// displayed casing is whichever casing the newest file in the current
// (highest) rev used — the casing that's actually "in force" right now,
// not just whichever upload happened to come first.
export function buildMarkRows(drawings: Drawing[]): MarkRow[] {
  const byMark = new Map<string, Drawing[]>() // key: mark.toLowerCase()
  const unmarked: Drawing[] = []
  for (const d of drawings) {
    if (d.mark === null) { unmarked.push(d); continue }
    const key = d.mark.toLowerCase()
    const list = byMark.get(key)
    if (list) list.push(d)
    else byMark.set(key, [d])
  }

  const marked: MarkRow[] = [...byMark.values()]
    .map(items => {
      const revs = groupByRev(items)
      const mark = revs[0].files[0].mark! // highest rev, newest file — its casing wins
      return { mark, revs }
    })
    .sort((a, b) => a.mark!.localeCompare(b.mark!, undefined, { numeric: true }))

  if (unmarked.length > 0) marked.push({ mark: null, revs: groupByRev(unmarked) })

  return marked
}
