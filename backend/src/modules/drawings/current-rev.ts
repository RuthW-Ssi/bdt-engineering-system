// current-rev.ts — "current" is computed, never stored: per mark, every row
// at its highest rev (a rev can be several sheets). Deleting the top rev's
// files makes the previous rev current with no extra write.
export function currentRevRows<T extends { mark: string | null; rev: number | null }>(rows: T[]): T[] {
  const top = new Map<string, number>()
  for (const r of rows) if (r.mark != null && r.rev != null) {
    const k = r.mark.toLowerCase()
    top.set(k, Math.max(top.get(k) ?? -1, r.rev))
  }
  return rows.filter(r => r.mark == null || r.rev == null || r.rev === top.get(r.mark.toLowerCase()))
}
