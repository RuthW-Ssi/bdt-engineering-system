// Server value is a UTC ISO string; datetime-local inputs read/write in the
// browser's own local time, so this reads it back with local getters (not
// getUTC*, and not toISOString().slice — that's UTC, 7h off in Thailand) to
// land on the same wall-clock value the user originally picked.
export function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// datetime-local's value has no timezone — new Date(...) reads it in the
// browser's local time, .toISOString() turns it into an unambiguous UTC instant.
export function datetimeLocalToIso(v: string): string {
  return new Date(v).toISOString()
}
