import { daysRemainingLabel } from '../lib/dateMath'

// Shared "days remaining until Plan Finish" badge (2026-09-28) — same dot +
// color-coded text used across MoDetail, WoDetail, WoList, MoList, and
// MoDetail's WorkOrdersTab, so all 5 places read consistently.
export default function DaysRemainingBadge({ planFinish }: { planFinish: string | null }) {
  const label = daysRemainingLabel(planFinish)
  if (!label) return null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, color: label.color }}>
      <span style={{ fontSize: 10 }}>{label.dot}</span>
      <span>{label.text}</span>
    </span>
  )
}
