// Which department may edit which progress field group. Display only — the
// backend enforces the same map (backend/src/modules/projects/
// progress-department.ts); keep the two in sync. Department = user.role;
// "admin" edits everything, any other department is view-only.
//   2026-09-29: per-section owners, remapped the same day (Payment = BCD,
//   Transport = BSC, Erection = BTC).
//   2026-09-30: each section's Plan/Actual dates became their own group,
//   editable by the section owner AND BCD.
export type ProgressGroupKey =
  | 'fabrication' | 'fab_dates' | 'payment' | 'transport' | 'transport_dates' | 'erection' | 'erection_dates'

export const GROUP_DEPARTMENTS: Record<ProgressGroupKey, string[]> = {
  fabrication: ['BDP'],
  fab_dates: ['BDP', 'BCD'],
  payment: ['BCD'],
  transport: ['BSC'],
  transport_dates: ['BSC', 'BCD'],
  erection: ['BTC'],
  erection_dates: ['BTC', 'BCD'],
}

export function editableGroups(role: string | null | undefined): Set<ProgressGroupKey> {
  const keys = Object.keys(GROUP_DEPARTMENTS) as ProgressGroupKey[]
  if (role === 'admin') return new Set(keys) // exact, same as the backend/guard
  const r = (role ?? '').trim().toUpperCase()
  return new Set(keys.filter(k => GROUP_DEPARTMENTS[k].includes(r)))
}

// Notes shown next to a section header, one per group the user can't edit
// (each rendered with a trailing red "*"). `main` is the section's own work;
// `dates` its Plan/Actual dates group, if it has one.
export function lockedNotes(can: Set<ProgressGroupKey>, main: ProgressGroupKey, dates?: ProgressGroupKey): string[] {
  const notes: string[] = []
  if (!can.has(main)) notes.push(`Editable by ${GROUP_DEPARTMENTS[main].join(' / ')} only`)
  if (dates && !can.has(dates)) notes.push(`Dates: editable by ${GROUP_DEPARTMENTS[dates].join(' / ')} only`)
  return notes
}
