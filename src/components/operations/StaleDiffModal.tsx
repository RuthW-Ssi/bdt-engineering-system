import { useUpdateFromLibrary } from '../../hooks/useOperationTemplates'

interface StaleOpAct {
  id?: number
  name: string
  per_minute: string | null
  machine?: { name: string } | null
  source_activity_code: string | null
  snapshot_at?: string | null
}

interface StaleDiffModalProps {
  templateId: number
  opAct: StaleOpAct
  onClose: () => void
}

export default function StaleDiffModal({ templateId, opAct, onClose }: StaleDiffModalProps) {
  const updateMut = useUpdateFromLibrary(templateId)

  const rows: { field: string; snapshot: string | null }[] = [
    { field: 'Name',           snapshot: opAct.name },
    { field: 'Duration (min)', snapshot: opAct.per_minute },
    { field: 'Machine',        snapshot: opAct.machine?.name ?? '—' },
    { field: 'Source',         snapshot: opAct.source_activity_code },
    { field: 'Snapshot at',    snapshot: opAct.snapshot_at ? new Date(opAct.snapshot_at).toLocaleString() : '—' },
  ]

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
      tabIndex={-1}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
    >
      <div
        role="dialog"
        aria-labelledby="stale-modal-title"
        style={{
          background: '#fff', borderRadius: 8, padding: 24,
          width: 480, maxHeight: '80vh', overflowY: 'auto',
          boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
        }}
      >
        <h3 id="stale-modal-title" style={{ margin: '0 0 4px' }}>
          {opAct.source_activity_code} — Library Updated
        </h3>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#666' }}>
          The source activity has changed since this snapshot was taken.
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #eee' }}>
              <th style={{ textAlign: 'left', padding: '4px 8px', color: '#888' }}>Field</th>
              <th style={{ textAlign: 'left', padding: '4px 8px', color: '#888' }}>Your snapshot</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.field} style={{ borderBottom: '1px solid #f5f5f5' }}>
                <td style={{ padding: '6px 8px', fontWeight: 500 }}>{r.field}</td>
                <td style={{ padding: '6px 8px', color: '#444' }}>{r.snapshot ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{
          marginTop: 16, padding: 12, background: '#FFF3E0',
          borderRadius: 6, fontSize: 12, color: '#BF360C',
        }}>
          ⚠ "Update from library" will overwrite all snapshot fields with the current library values.
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '6px 16px', borderRadius: 4, border: '1px solid #ccc', cursor: 'pointer' }}>
            Dismiss · keep snapshot
          </button>
          <button
            onClick={() => { if (opAct.id !== undefined) updateMut.mutate(opAct.id, { onSuccess: onClose }) }}
            disabled={updateMut.isPending}
            style={{ padding: '6px 16px', borderRadius: 4, border: 'none', background: '#1976D2', color: '#fff', cursor: updateMut.isPending ? 'default' : 'pointer' }}
          >
            {updateMut.isPending ? 'Updating…' : 'Update from library'}
          </button>
        </div>
      </div>
    </div>
  )
}
