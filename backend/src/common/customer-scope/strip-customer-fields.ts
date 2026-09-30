// Customers never see weights or any dates/schedule data (2026-09-30 decision, see wiki
// features/customer-user-scope). Stripped by key name, recursively, from every response
// served to a customer — so new fields following the same naming are hidden by default.
// Case-sensitive on purpose: `Date$` must not match "update"/"can_update".
const HIDDEN_KEY =
  /[Ww]eight|(^|_)dates?($|_)|Date$|_at$|[a-z]At$|^target_|^window_|_breakdown$|^schedule_progress$|_days$/

export function isHiddenCustomerKey(key: string): boolean {
  return HIDDEN_KEY.test(key)
}

export function stripCustomerFields<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripCustomerFields) as T
  if (value === null || typeof value !== 'object' || value instanceof Date) return value
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (!isHiddenCustomerKey(k)) out[k] = stripCustomerFields(v)
  }
  return out as T
}
