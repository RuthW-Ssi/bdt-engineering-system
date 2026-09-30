import { ForbiddenException } from '@nestjs/common'
import { FAB_STAGES } from './progress-shared'

// Which department may edit which part of an assembly's progress. Each
// group lists every department allowed to edit it; "admin" (exact) edits
// everything and any other department is view-only. This sits on top of the
// project-tracking:update module permission, not instead of it. The
// frontend mirrors this for display in src/lib/progressDepartments.ts; keep
// the two in sync.
//   2026-09-29: first per-section version, then remapped (Payment = BCD,
//   Transport = BSC, Erection = BTC), matching the legacy tracking sheet.
//   2026-09-30: the Plan/Actual dates of Fabrication, Transport and
//   Erection became their own groups, editable by the section owner AND
//   BCD (user request).
export const PROGRESS_GROUPS = [
  { key: 'fabrication', label: 'Fabrication', departments: ['BDP'], fields: [...FAB_STAGES] as string[] },
  { key: 'fab_dates', label: 'Fabrication dates', departments: ['BDP', 'BCD'],
    fields: ['fab_plan_finish_date', 'fab_actual_finish_date'] },
  { key: 'payment', label: 'Material Payment', departments: ['BCD'], fields: ['payment_status'] },
  { key: 'transport', label: 'Transport', departments: ['BSC'], fields: ['loaded_pcs'] },
  { key: 'transport_dates', label: 'Transport dates', departments: ['BSC', 'BCD'],
    fields: ['plan_load_date', 'actual_load_date'] },
  { key: 'erection', label: 'Erection', departments: ['BTC'], fields: ['erected_pcs'] },
  { key: 'erection_dates', label: 'Erection dates', departments: ['BTC', 'BCD'],
    fields: ['erection_plan_finish_date', 'erection_actual_finish_date'] },
] as const

export type ProgressGroupKey = (typeof PROGRESS_GROUPS)[number]['key']

const norm = (role: string | null | undefined) => (role ?? '').trim().toUpperCase()

export function editableGroups(role: string | null | undefined): ProgressGroupKey[] {
  // Admin must be the exact literal 'admin', the same test as the
  // permission guard (permission-map.ts / admin.guard.ts), so 'Admin' or
  // 'admin ' is NOT admin here either (security F-002, 2026-09-29).
  // Department names match leniently (trim + case) since they're free text.
  if (role === 'admin') return PROGRESS_GROUPS.map(g => g.key)
  const r = norm(role)
  return PROGRESS_GROUPS.filter(g => (g.departments as readonly string[]).includes(r)).map(g => g.key)
}

// `changedFields` must be the fields whose value actually changes (the
// change-log diff); a field resent unchanged is not an edit.
export function assertDepartmentCanEdit(role: string | null | undefined, changedFields: string[]): void {
  const allowed = new Set(editableGroups(role))
  const denied = PROGRESS_GROUPS.filter(g => !allowed.has(g.key) && g.fields.some(f => changedFields.includes(f)))
  if (!denied.length) return
  const dept = (role ?? '').trim() || '(none)'
  throw new ForbiddenException(
    `แผนก ${dept} ไม่มีสิทธิ์แก้ไขส่วน: ${denied.map(g => `${g.label} (เฉพาะแผนก ${g.departments.join(' / ')})`).join(', ')}`,
  )
}
