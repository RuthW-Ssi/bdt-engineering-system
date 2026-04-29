import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { History, X, ChevronDown, ChevronRight } from 'lucide-react'
import { getTemplateHistory, getActivityTemplateHistory, getOverrideHistory } from '../api/routings'
import type { HistoryEntryDTO, OverrideHistoryEntryDTO } from '../api/routings'

interface TemplateHistoryDrawerProps {
  type: 'template'
  id: number
  name: string
}
interface ActivityHistoryDrawerProps {
  type: 'activity'
  id: number
  name: string
}
interface OverrideHistoryDrawerProps {
  type: 'override'
  productCode: string
  activityId: number
  name: string
  onRollback?: (snapshot: Record<string, unknown>) => void
}

type HistoryDrawerProps =
  | TemplateHistoryDrawerProps
  | ActivityHistoryDrawerProps
  | OverrideHistoryDrawerProps

const ACTION_COLORS: Record<string, string> = {
  create: '#2e7d32',
  update: '#e65100',
  delete: '#c62828',
}

function SnapshotRow({
  entry, isOverride, onRollback,
}: {
  entry: HistoryEntryDTO | OverrideHistoryEntryDTO
  isOverride: boolean
  onRollback?: (snapshot: Record<string, unknown>) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const action = isOverride ? (entry as OverrideHistoryEntryDTO).action : 'update'
  const color = ACTION_COLORS[action] ?? '#555'

  return (
    <div style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: 1 }}
          onClick={() => setExpanded(v => !v)}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span style={{ fontSize: 11, color: '#888', minWidth: 140 }}>
            {new Date(entry.changed_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, color, minWidth: 60 }}>{action.toUpperCase()}</span>
          <span style={{ fontSize: 11, color: '#555' }}>by {entry.changed_by.name}</span>
          {!isOverride && (entry as HistoryEntryDTO).reason && (
            <span style={{ fontSize: 11, color: '#888', fontStyle: 'italic' }}>
              — {(entry as HistoryEntryDTO).reason}
            </span>
          )}
        </div>
        {isOverride && onRollback && (
          <button
            onClick={() => onRollback(entry.snapshot)}
            style={{
              fontSize: 10,
              padding: '2px 8px',
              border: '1px solid #90caf9',
              borderRadius: 4,
              background: '#e3f2fd',
              color: '#1565c0',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            Restore
          </button>
        )}
      </div>
      {expanded && (
        <pre
          style={{
            marginTop: 6,
            marginLeft: 22,
            background: '#fafafa',
            border: '1px solid #eee',
            borderRadius: 4,
            padding: '6px 8px',
            fontSize: 11,
            overflowX: 'auto',
            maxHeight: 200,
          }}
        >
          {JSON.stringify(entry.snapshot, null, 2)}
        </pre>
      )}
    </div>
  )
}

export function HistoryDrawer(props: HistoryDrawerProps) {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(1)

  const queryKey =
    props.type === 'template'
      ? ['template-history', props.id, page]
      : props.type === 'activity'
        ? ['activity-history', props.id, page]
        : ['override-history', props.productCode, props.activityId, page]

  const { data, isFetching } = useQuery({
    queryKey,
    queryFn: () => {
      if (props.type === 'template') return getTemplateHistory(props.id, page)
      if (props.type === 'activity') return getActivityTemplateHistory(props.id, page)
      return getOverrideHistory(props.productCode, props.activityId, page)
    },
    enabled: open,
  })

  const entries = (data ?? []) as (HistoryEntryDTO | OverrideHistoryEntryDTO)[]
  const isOverride = props.type === 'override'

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Show history"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '3px 8px',
          fontSize: 12,
          color: '#555',
          background: 'none',
          border: '1px solid #ddd',
          borderRadius: 4,
          cursor: 'pointer',
        }}
      >
        <History size={13} /> History
      </button>

      {open && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            width: 480,
            height: '100vh',
            background: '#fff',
            boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 16px',
              borderBottom: '1px solid #eee',
              background: '#fafafa',
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Change History</div>
              <div style={{ fontSize: 12, color: '#888' }}>{props.name}</div>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
            {isFetching && <div style={{ color: '#888', fontSize: 13, padding: '16px 0' }}>Loading...</div>}
            {!isFetching && entries.length === 0 && (
              <div style={{ color: '#aaa', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>
                No history recorded yet
              </div>
            )}
            {entries.map(e => (
              <SnapshotRow
                key={e.id}
                entry={e}
                isOverride={isOverride}
                onRollback={isOverride && props.type === 'override' ? props.onRollback : undefined}
              />
            ))}
          </div>

          {/* Pagination */}
          {entries.length === 50 && (
            <div style={{ padding: '8px 16px', borderTop: '1px solid #eee', display: 'flex', gap: 8 }}>
              {page > 1 && (
                <button onClick={() => setPage(p => p - 1)} style={{ fontSize: 12, cursor: 'pointer' }}>
                  ← Prev
                </button>
              )}
              <span style={{ fontSize: 12, color: '#888' }}>Page {page}</span>
              <button onClick={() => setPage(p => p + 1)} style={{ fontSize: 12, cursor: 'pointer' }}>
                Next →
              </button>
            </div>
          )}
        </div>
      )}
    </>
  )
}
