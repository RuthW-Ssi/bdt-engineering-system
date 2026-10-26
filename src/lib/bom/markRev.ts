// Per-mark BOM rev helpers (2026-10-26, wiki features/bom-mark-revision-plan.md).

export type RevMove = { from: number; to: number }

/** "Rev 1 → 2", or "Rev 1 → 2 · ข้อมูล BOM ไม่เปลี่ยน" when only the rev moved. */
export function revMoveText(rev: RevMove | null, dataSame: boolean): string | null {
  if (!rev) return null
  return `Rev ${rev.from} → ${rev.to}${dataSame ? ' · ข้อมูล BOM ไม่เปลี่ยน' : ''}`
}

/** The REV_UP move out of a WO bom-version status, if any. */
export function revUpOf(bom: { delta_types: string[]; delta_details: Record<string, unknown> | null } | null | undefined): RevMove | null {
  const r = (bom?.delta_details as { rev?: RevMove } | null)?.rev
  return bom?.delta_types.includes('REV_UP') && r ? { from: r.from, to: r.to } : null
}
