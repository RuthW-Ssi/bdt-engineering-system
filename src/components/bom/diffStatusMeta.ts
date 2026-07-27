import type { DiffStatus } from '../../api/dispatches'

// Shared with the 3D diff comparison panel (DiffBimComparePanel) so the
// BIM viewport colors match this table's badges exactly — single source
// of truth, not two hand-typed copies that can drift.
export const DIFF_STATUS_META: Record<DiffStatus, { label: string; color: string; bg: string }> = {
  added:     { label: '+', color: '#065F46', bg: '#D1F2E0' },
  removed:   { label: '-', color: '#991B1B', bg: '#FEE2E2' },
  changed:   { label: '~', color: '#92400E', bg: '#FEF3C7' },
  unchanged: { label: '=', color: '#9CA3AF', bg: '#F3F4F6' },
}
