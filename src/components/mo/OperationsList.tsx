import { Zap } from 'lucide-react'
import { useUpdateOpStatus } from '../../hooks/useMo'
import type { MoOperation, MoOperationStatus } from '../../api/mo'

const OP_STATUS_STYLE: Record<MoOperationStatus, { bg: string; fg: string; label: string }> = {
  NOT_STARTED: { bg: '#F0F0F0', fg: '#777', label: 'Not started' },
  IN_PROGRESS: { bg: '#FAEEDA', fg: '#854F0B', label: 'In progress' },
  DONE: { bg: '#E3F4E8', fg: '#1E6B36', label: 'Done' },
}
const NEXT: Record<MoOperationStatus, MoOperationStatus> = {
  NOT_STARTED: 'IN_PROGRESS',
  IN_PROGRESS: 'DONE',
  DONE: 'NOT_STARTED',
}

/** Detail Tab 2 · structure-only op list (P22/P23 — no timestamps, no Gantt). */
export function OperationsList({
  moId,
  operations,
  bottleneckOpId,
}: {
  moId: number
  operations: MoOperation[]
  bottleneckOpId: number | null
}) {
  const updateStatus = useUpdateOpStatus(moId)

  if (!operations.length) {
    return <div style={{ color: '#8E8E8E', fontSize: 13, padding: '12px 0' }}>No operations snapshotted.</div>
  }

  return (
    <div style={{ border: '1px solid #E8E8E8', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '50px 1.4fr 1fr 110px 90px 130px', gap: 0, background: '#F5F5F5', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#888' }}>
        {['Seq', 'Work Center', 'Source Op', 'Duration', 'Setup', 'Status'].map(h => (
          <div key={h} style={{ padding: '8px 12px' }}>{h}</div>
        ))}
      </div>
      {operations.map(op => {
        const isBottleneck = bottleneckOpId != null && op.id === bottleneckOpId
        const st = OP_STATUS_STYLE[op.status]
        return (
          <div key={op.id} style={{ display: 'grid', gridTemplateColumns: '50px 1.4fr 1fr 110px 90px 130px', borderTop: '1px solid #EEE', background: isBottleneck ? '#FFF7F7' : '#fff', alignItems: 'center', fontSize: 13 }}>
            <div style={{ padding: '10px 12px', color: '#999' }}>{op.sequence}</div>
            <div style={{ padding: '10px 12px', fontWeight: 600, color: '#1A1A1A', display: 'flex', alignItems: 'center', gap: 6 }}>
              {isBottleneck && <Zap size={13} style={{ color: '#C8202A' }} />}
              {op.work_center?.name ?? `WC ${op.work_center_id}`}
            </div>
            <div style={{ padding: '10px 12px', color: '#888', fontSize: 12 }}>{op.source_routing_op_id ?? '—'}</div>
            <div style={{ padding: '10px 12px', color: '#555' }}>{op.expected_duration_min} min</div>
            <div style={{ padding: '10px 12px', color: '#555' }}>{op.setup_time_min} min</div>
            <div style={{ padding: '10px 12px' }}>
              <button
                onClick={() => updateStatus.mutate({ opId: op.id, status: NEXT[op.status] })}
                title="Click to advance status"
                style={{ background: st.bg, color: st.fg, borderRadius: 999, padding: '3px 12px', fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer' }}
              >
                {st.label}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
