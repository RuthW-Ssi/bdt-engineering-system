import { useMemo } from 'react'
import { Activity, Flag, GitCompare, Layers, Pencil, Sparkles } from 'lucide-react'
import type { WoEvent } from '../../api/wo'
import { woHistoryView, type WoHistoryKind } from '../../lib/woHistory'
import { HistoryList, type HistoryBadge } from '../mo/MoHistoryTimeline'

// WO History (2026-10-09, user: "events ของ wo … เปลี่ยนเป็น history … theme
// เดียวกัน") — the MO History list and cards, fed by work_order_event.

const KIND: Record<WoHistoryKind, HistoryBadge> = {
  status: { label: 'สถานะ', bg: '#FCEBEB', fg: '#C8202A', icon: Flag },
  create: { label: 'สร้าง', bg: '#EAF3DE', fg: '#27500A', icon: Sparkles },
  progress: { label: 'ความคืบหน้า', bg: '#EAF3DE', fg: '#27500A', icon: Activity },
  mo: { label: 'ตาม MO', bg: '#E6F1FB', fg: '#0C447C', icon: GitCompare },
  edit: { label: 'แก้ไข WO', bg: '#FAEEDA', fg: '#854F0B', icon: Pencil },
  mark: { label: 'Mark', bg: '#F0F0F0', fg: '#3A3A3A', icon: Layers },
}
const FILTERS: { key: 'all' | WoHistoryKind; label: string }[] = [
  { key: 'all', label: 'ทั้งหมด' }, { key: 'progress', label: 'ความคืบหน้า' }, { key: 'status', label: 'สถานะ' },
  { key: 'mo', label: 'ตาม MO' }, { key: 'edit', label: 'แก้ไข WO' }, { key: 'mark', label: 'Mark' }, { key: 'create', label: 'สร้าง' },
]

export function WoHistoryTimeline({ events, marks }: { events: WoEvent[]; marks: { id: number; mark: string }[] }) {
  const items = useMemo(() => [...events]
    .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at) || b.id - a.id) // newest first
    .map(e => {
      const v = woHistoryView(e, marks)
      return { key: e.id, kind: v.kind, title: v.title, who: e.recorded_by, when: e.recorded_at, v }
    }), [events, marks])
  return <HistoryList items={items} kinds={KIND} filters={FILTERS} />
}
