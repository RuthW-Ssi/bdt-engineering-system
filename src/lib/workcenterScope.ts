// Work Station options for an Operation Type (OperationBuilder + RoutingBuilder).
// There's no op_type↔workcenter many-to-many, only one default_wc per type, so
// the list is scoped to that default's category name (e.g. "Cutting").
// The default only counts when it is in `workcenters` (GET /workcenters = active
// only): op types still point at retired workcenters — Drill at the old cutting
// WC 6 hid WC-DRILL behind the "Cutting" category (2026-10-06). A retired
// default means no scope and nothing to auto-fill.

export interface WorkcenterLike { id: number; name: string }

export function scopeWorkcenters<W extends WorkcenterLike>(
  defaultWcId: number | null | undefined,
  workcenters: W[],
  selectedId: number | null,
): { category: string | null; options: W[]; defaultId: number | null } {
  const def = workcenters.find(w => w.id === defaultWcId)
  const category = def?.name ?? null
  const scoped = category ? workcenters.filter(w => w.name === category) : workcenters
  // Keep whatever's already selected visible even if it falls outside the scope
  // (e.g. picked before switching Operation Type) — otherwise the <select> shows
  // blank while form state still holds it.
  const selected = workcenters.find(w => w.id === selectedId)
  const options = selected && !scoped.includes(selected) ? [selected, ...scoped] : scoped
  return { category, options, defaultId: def?.id ?? null }
}
