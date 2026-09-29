// Which department may edit which progress section (2026-09-29). Display
// only — the backend enforces the same map (backend/src/modules/projects/
// progress-department.ts); keep the two in sync. Department = user.role;
// "admin" edits everything, any other department is view-only.
export type ProgressSectionKey = 'fabrication' | 'payment_transport' | 'erection'

export const SECTION_DEPARTMENT: Record<ProgressSectionKey, string> = {
  fabrication: 'BDP',
  payment_transport: 'BSC',
  erection: 'BCD',
}

export function editableSections(role: string | null | undefined): Set<ProgressSectionKey> {
  const r = (role ?? '').trim().toUpperCase()
  const keys = Object.keys(SECTION_DEPARTMENT) as ProgressSectionKey[]
  return new Set(r === 'ADMIN' ? keys : keys.filter(k => SECTION_DEPARTMENT[k] === r))
}

// Shown next to a locked section's header.
export const lockedNote = (key: ProgressSectionKey) => `🔒 แก้ได้เฉพาะแผนก ${SECTION_DEPARTMENT[key]}`
