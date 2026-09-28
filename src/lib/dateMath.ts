// Shared date-math for "days remaining" countdowns (2026-09-28: "แสดงจำนวน
// นับตั้งแต่วันล่าสุดจนถึง plan finished ว่าเหลือกี่วันแล้ว") — lifted out of
// components/mo/AssemblyPicker.tsx's own local daysUntil()/ItemDateBadge,
// which had the same logic private to that one file. Used by MoDetail,
// WoDetail, WoList, MoList and MoDetail's WorkOrdersTab.
export function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  // plan_start/plan_finish are real timestamptz instants, not bare dates
  // (WoDetail shows them with fmtDateTime) — normalize the target's
  // time-of-day to midnight too, same as `today`, so this is purely a
  // calendar-day difference. Without this, a genuinely-overdue date with a
  // later time-of-day (e.g. yesterday 20:00) computed to 0 and displayed
  // "today" instead of "1D overdue" (QA-F-002, 2026-09-28).
  const d = new Date(dateStr)
  d.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export function daysRemainingLabel(dateStr: string | null): { text: string; color: string; dot: string } | null {
  const days = daysUntil(dateStr)
  if (days === null) return null

  const isOverdue = days < 0
  const isToday = days === 0
  const isUrgent = days <= 30

  const dot = isOverdue || isToday ? '🔴' : isUrgent ? '🟡' : '🟢'
  const text = isOverdue ? `${Math.abs(days)}D overdue` : isToday ? 'today' : `${days}D`
  const color = isOverdue || isToday ? '#B91C1C' : isUrgent ? '#92400E' : '#166534'
  return { text, color, dot }
}
