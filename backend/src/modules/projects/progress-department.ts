import { ForbiddenException } from '@nestjs/common'
import { FAB_STAGES } from './progress-shared'

// Which department may edit which part of an assembly's progress
// (2026-09-29): each section is filled in by a different department.
// Department = res_users.role (free text); "admin" edits everything, every
// other department is view-only. This is on top of — not instead of — the
// project-tracking:update module permission. Mirrored for display in the
// frontend's src/lib/progressDepartments.ts — keep the two in sync.
export const PROGRESS_SECTIONS = [
  { key: 'fabrication', label: 'Fabrication', department: 'BDP',
    fields: [...FAB_STAGES, 'fab_plan_finish_date', 'fab_actual_finish_date'] as string[] },
  { key: 'payment_transport', label: 'Material Payment / Transport', department: 'BSC',
    fields: ['payment_status', 'plan_load_date', 'actual_load_date', 'loaded_pcs'] },
  { key: 'erection', label: 'Erection', department: 'BCD',
    fields: ['erection_plan_finish_date', 'erection_actual_finish_date', 'erected_pcs'] },
] as const

export type ProgressSectionKey = (typeof PROGRESS_SECTIONS)[number]['key']

const norm = (role: string | null | undefined) => (role ?? '').trim().toUpperCase()

export function editableSections(role: string | null | undefined): ProgressSectionKey[] {
  const r = norm(role)
  if (r === 'ADMIN') return PROGRESS_SECTIONS.map(s => s.key)
  return PROGRESS_SECTIONS.filter(s => s.department === r).map(s => s.key)
}

// `changedFields` must be the fields whose value actually changes (the
// change-log diff) — a field resent unchanged is not an edit.
export function assertDepartmentCanEdit(role: string | null | undefined, changedFields: string[]): void {
  const allowed = new Set(editableSections(role))
  const denied = PROGRESS_SECTIONS.filter(s => !allowed.has(s.key) && s.fields.some(f => changedFields.includes(f)))
  if (!denied.length) return
  const dept = (role ?? '').trim() || '(none)'
  throw new ForbiddenException(
    `แผนก ${dept} ไม่มีสิทธิ์แก้ไขส่วน: ${denied.map(s => `${s.label} (เฉพาะแผนก ${s.department})`).join(', ')}`,
  )
}
