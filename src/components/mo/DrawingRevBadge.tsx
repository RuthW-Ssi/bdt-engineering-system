import { useMoDrawingRevStatus } from '../../hooks/useMo'

// MO print "drawing rev" warning (2026-10-21, Task 4) — small pill next to
// the header Print button, same style as the pre-shop source pill in
// MoDetail's Assemblies tab (`bg-molten-50 text-molten-600`, pill radius
// 999). N = distinct WOs with a stale printed drawing (not the row count —
// several marks on one WO still count as one WO). Hidden while loading, on
// error, or when there's nothing stale (warn-only, never a blocking state).
export function DrawingRevBadge({ moId }: { moId: number }) {
  const { data, isLoading, isError } = useMoDrawingRevStatus(moId)
  if (isLoading || isError) return null
  const items = data?.items ?? []
  if (items.length === 0) return null
  const woCount = new Set(items.map(i => i.wo_id)).size
  return (
    <span
      className="bg-molten-50 text-molten-600"
      style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 999 }}
    >
      Drawing ใหม่ {woCount}
    </span>
  )
}
