import type { MoStatus } from '../../api/mo'

const STYLES: Record<MoStatus, { bg: string; fg: string; label: string }> = {
  DRAFT: { bg: '#F0F0F0', fg: '#555555', label: 'Draft' },
  CONFIRMED: { bg: '#E3EEF8', fg: '#0C447C', label: 'Confirmed' },
  IN_PROGRESS: { bg: '#FAEEDA', fg: '#854F0B', label: 'In Progress' },
  DONE: { bg: '#E3F4E8', fg: '#1E6B36', label: 'Done' },
  CANCELLED: { bg: '#FCEBEB', fg: '#C8202A', label: 'Cancelled' },
}

export function MoStatusPill({ status }: { status: MoStatus }) {
  const s = STYLES[status]
  return (
    <span
      style={{
        background: s.bg,
        color: s.fg,
        borderRadius: 999,
        padding: '2px 10px',
        fontSize: 11,
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      {s.label}
    </span>
  )
}
