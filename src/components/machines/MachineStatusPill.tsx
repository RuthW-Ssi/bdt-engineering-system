import type { EquipmentStatus } from '../../api/machines'

const CONFIG: Record<EquipmentStatus, { label: string; bg: string; color: string }> = {
  OPERATIONAL: { label: 'กำลังทำงาน', bg: '#dcfce7', color: '#16a34a' },
  MAINTENANCE: { label: 'ซ่อมบำรุง', bg: '#fef3c7', color: '#d97706' },
  REPAIR: { label: 'ซ่อม', bg: '#ffedd5', color: '#ea580c' },
  UNAVAILABLE: { label: 'ไม่พร้อม', bg: '#f3f4f6', color: '#6b7280' },
  RETIRED: { label: 'ปลดระวาง', bg: '#f1f5f9', color: '#111827' },
}

interface Props {
  status: EquipmentStatus
  size?: 'sm' | 'md'
}

export function MachineStatusPill({ status, size = 'md' }: Props) {
  const c = CONFIG[status]
  return (
    <span
      style={{
        background: c.bg,
        color: c.color,
        borderRadius: 999,
        padding: size === 'sm' ? '1px 8px' : '2px 12px',
        fontSize: size === 'sm' ? 11 : 12,
        fontWeight: 600,
        display: 'inline-block',
        whiteSpace: 'nowrap',
      }}
    >
      {c.label}
    </span>
  )
}
