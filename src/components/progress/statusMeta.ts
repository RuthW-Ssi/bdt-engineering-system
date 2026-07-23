import type { ProgressStatus } from '../../api/projectProgress'

// Order matters — rendered left→right as the isolate button strip.
export const STATUS_ORDER: ProgressStatus[] = ['notstart', 'qcinsp', 'qcfinal', 'load', 'install', 'done']

// Status palette is deliberately separate from the brand red — semantic
// state colors, matching the approved mockup.
export const STATUS_META: Record<ProgressStatus, { label: string; color: string }> = {
  notstart: { label: 'Not Start', color: '#C7CBD1' },
  qcinsp: { label: 'QC Insp', color: '#E3A73D' },
  qcfinal: { label: 'QC Final', color: '#D97A3A' },
  load: { label: 'Load', color: '#4A85C4' },
  install: { label: 'Install', color: '#7C6FCE' },
  done: { label: 'Done', color: '#2E9E5F' },
}
