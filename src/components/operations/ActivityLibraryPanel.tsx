import { useState } from 'react'
import { useActivities } from '../../hooks/useActivities'
import { useAddFromLibrary } from '../../hooks/useOperationTemplates'

interface ActivityLibraryPanelProps {
  templateId: number | null
  existingSourceIds: Set<number>
}

export default function ActivityLibraryPanel({ templateId, existingSourceIds }: ActivityLibraryPanelProps) {
  const [search, setSearch] = useState('')
  const { data: paged, isLoading } = useActivities({ q: search || undefined })
  const activities = paged?.data ?? []
  const addMut = useAddFromLibrary(templateId ?? 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#FAFAFA', borderLeft: '1px solid #E0E0E0' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #E0E0E0', background: '#fff' }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Activity Library</div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search activities…"
          aria-label="Search activities"
          style={{ width: '100%', padding: '6px 10px', border: '1px solid #DDD', borderRadius: 4, fontSize: 12, boxSizing: 'border-box' }}
        />
      </div>

      {templateId === null && (
        <div style={{ padding: 16, background: '#FFF8E1', borderBottom: '1px solid #FFE082', fontSize: 12, color: '#795548' }}>
          Save the operation as Draft first to enable the Activity Library.
        </div>
      )}

      {/* Flat activity list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
        {isLoading && <div style={{ padding: 16, fontSize: 12, color: '#888' }}>Loading…</div>}
        {activities.map(act => {
          const alreadyAdded = existingSourceIds.has(act.id)
          return (
            <div key={act.id} style={{
              borderRadius: 4, marginBottom: 2,
              background: alreadyAdded ? '#F5F5F5' : '#fff',
              border: '1px solid #EEE',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: '#999', fontFamily: 'monospace' }}>{act.activity_code}</div>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{act.name}</div>
                  <div style={{ marginTop: 4 }}>
                    <span style={{ fontSize: 11, background: '#E8F5E9', color: '#2E7D32', border: '1px solid #A5D6A7', borderRadius: 10, padding: '1px 7px', fontWeight: 600 }}>
                      {Number(act.duration_min).toFixed(2)} min
                    </span>
                  </div>
                </div>
                <button
                  disabled={templateId === null || alreadyAdded || addMut.isPending}
                  onClick={() => addMut.mutate(act.id)}
                  title={alreadyAdded ? 'Already added' : 'Add to operation'}
                  style={{
                    padding: '4px 10px', fontSize: 11, borderRadius: 4, border: 'none',
                    background: alreadyAdded ? '#E0E0E0' : '#1976D2',
                    color: alreadyAdded ? '#999' : '#fff',
                    cursor: templateId === null || alreadyAdded || addMut.isPending ? 'default' : 'pointer',
                    flexShrink: 0,
                  }}
                >
                  {alreadyAdded ? 'Added' : '+ Add'}
                </button>
              </div>
            </div>
          )
        })}
        {!isLoading && activities.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: '#999' }}>
            No activities found.{' '}
            <a href="/activity-library" style={{ color: '#1976D2' }}>Create in Activity Library →</a>
          </div>
        )}
      </div>
    </div>
  )
}
