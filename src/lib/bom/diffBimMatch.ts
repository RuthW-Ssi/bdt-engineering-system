import type { DiffRowDto, AssemblyDiffItemDto, DiffStatus } from '../../api/dispatches'
import type { BimFocusRequest } from '../../components/bim/BimViewport'
import { DIFF_STATUS_META } from '../../components/bom/diffStatusMeta'

// mark -> its diff status, preferring curr over prev (an "unchanged"/"changed"
// row has both; "added" has curr only; "removed" has prev only).
export function buildAssemblyStatusMap(assembly_diff: DiffRowDto<AssemblyDiffItemDto>[]): Map<string, DiffStatus> {
  const map = new Map<string, DiffStatus>()
  for (const row of assembly_diff) {
    const mark = (row.curr ?? row.prev)?.assembly_mark
    if (mark) map.set(mark, row.status)
  }
  return map
}

// globalId -> diff-status color hex, for one model's match set. Marks with
// no diff status (shouldn't happen — matches are already filtered to the
// diff's own marks server-side — but defensively skipped) are left uncolored
// here; the caller's defaultColor base layer covers everything else.
export function buildDiffColorMap(
  matches: Record<string, string[]> | undefined,
  statusByMark: Map<string, DiffStatus>,
): Map<string, string> {
  const map = new Map<string, string>()
  if (!matches) return map
  for (const [mark, globalIds] of Object.entries(matches)) {
    const status = statusByMark.get(mark)
    if (!status) continue
    const color = DIFF_STATUS_META[status].color
    for (const id of globalIds) map.set(id, color)
  }
  return map
}

// null mark -> null (no focus request at all). A mark with no global_ids in
// this particular model's match set still returns a request with an empty
// array — BimViewport's own focusRequest effect treats an empty globalIds
// array as "clear selection / show all", which is exactly the right
// degradation when a clicked mark doesn't exist in this panel's model.
export function buildDiffFocusRequest(
  matches: Record<string, string[]> | undefined,
  mark: string | null,
): BimFocusRequest | null {
  if (mark == null) return null
  return { globalIds: matches?.[mark] ?? [], hideRest: false }
}
