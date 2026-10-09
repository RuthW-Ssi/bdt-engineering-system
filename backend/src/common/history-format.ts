/** A date/time as the plant reads it in History lines: Bangkok time,
 *  "YYYY-MM-DD HH:mm", or "—" when empty. */
export function fmtBkk(d: Date | string | null | undefined): string {
  if (!d) return '—'
  const t = new Date(new Date(d).getTime() + 7 * 3600_000)
  return t.toISOString().slice(0, 16).replace('T', ' ')
}
