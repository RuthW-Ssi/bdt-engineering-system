import type { WoStatus } from '../../api/wo'

const STYLES: Record<WoStatus, { bg: string; fg: string; label: string }> = {
  NOT_STARTED: { bg: '#F0F0F0', fg: '#555555', label: 'Not Started' },
  RELEASED: { bg: '#E3EEF8', fg: '#0C447C', label: 'Released' },
  IN_PROGRESS: { bg: '#FAEEDA', fg: '#854F0B', label: 'In Progress' },
  PAUSED: { bg: '#F3E8FB', fg: '#6B2E8F', label: 'Paused' },
  DONE: { bg: '#E3F4E8', fg: '#1E6B36', label: 'Done' },
  CANCELLED: { bg: '#FCEBEB', fg: '#C8202A', label: 'Cancelled' },
}

export function WoStatusPill({ status }: { status: WoStatus }) {
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
