import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Plus, Search, Clock } from 'lucide-react'
import { useActivities, useDeleteActivity } from '../hooks/useActivities'
import { ActivityBuilderModal } from './ActivityBuilder'

export function ActivityLibraryList() {
  const { id: paramId } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const [searchQ, setSearchQ] = useState('')
  const [modal, setModal] = useState<{ id?: number } | null>(
    paramId ? { id: Number(paramId) } : null,
  )

  const { data: activities = [], isLoading, isError } = useActivities({ q: searchQ || undefined })
  const deleteMutation = useDeleteActivity()

  function handleDelete(id: number, name: string) {
    if (!confirm(`Delete "${name}"?`)) return
    deleteMutation.mutate(id)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#F8F8F8', fontFamily: 'inherit' }}>

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E0E0E0', height: 56, padding: '0 24px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1F1F1F' }}>Activity Library</div>
          <div style={{ fontSize: 11, color: '#9E9E9E' }}>Reusable activities — assigned to machines with consumed materials</div>
        </div>
        <button
          onClick={() => setModal({})}
          style={{ height: 34, padding: '0 16px', borderRadius: 6, border: 'none', background: '#C8202A', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Plus size={14} />Add Activity
        </button>
      </div>

      {/* Filter bar */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E0E0E0', height: 44, padding: '0 24px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, position: 'sticky', top: 56, zIndex: 10 }}>
        <div style={{ position: 'relative' }}>
          <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#BDBDBD', pointerEvents: 'none' }} />
          <input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Search by name…"
            style={{ border: '1px solid #E0E0E0', borderRadius: 6, padding: '0 10px 0 28px', height: 30, fontSize: 12, outline: 'none', fontFamily: 'inherit', width: 220 }}
          />
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: '#9E9E9E' }}>
          {activities.length} activit{activities.length !== 1 ? 'ies' : 'y'}
        </span>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>

        {/* Header row */}
        <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 110px 1fr 80px 90px 90px', gap: 12, padding: '0 16px', marginBottom: 6 }}>
          {['Code', 'Name', 'Machine', 'Consumes', 'Skill', 'Duration', ''].map((h) => (
            <div key={h} style={{ fontSize: 10, fontWeight: 700, color: '#9E9E9E', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
          ))}
        </div>

        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: '#9E9E9E' }}>Loading…</div>
        ) : isError ? (
          <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: '#C8202A' }}>Failed to load activities</div>
        ) : activities.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: '#9E9E9E' }}>
            No activities yet — create the first one
          </div>
        ) : (
          activities.map((act) => (
            <div
              key={act.id}
              style={{
                display: 'grid', gridTemplateColumns: '130px 1fr 110px 1fr 80px 90px 90px', gap: 12,
                padding: '0 16px', height: 52, alignItems: 'center',
                background: '#fff', borderRadius: 8, marginBottom: 4,
                border: '1px solid #E8E8E8', transition: 'box-shadow 0.1s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: '#1F1F1F', fontFamily: 'monospace' }}>{act.activity_code}</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#1F1F1F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{act.name}</div>
              <div style={{ fontSize: 12, color: '#555' }}>{act.machine?.code ?? <span style={{ color: '#BDBDBD' }}>—</span>}</div>
              <div style={{ fontSize: 11, color: '#8E8E8E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {act.consumes.length > 0 ? act.consumes.map((c) => c.material.name).join(', ') : <span style={{ color: '#BDBDBD' }}>—</span>}
              </div>
              <div style={{ fontSize: 11, color: '#1B5E20', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {act.skills && act.skills.length > 0
                  ? act.skills.map((l) => `${l.skill}${l.level ? ` (${l.level})` : ''} ×${l.qty}`).join(', ')
                  : <span style={{ color: '#BDBDBD' }}>—</span>}
              </div>
              <div>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: '#E8F5E9', color: '#1B5E20',
                  borderRadius: 20, padding: '3px 9px',
                  fontSize: 11, fontWeight: 600, border: '1px solid #A5D6A7',
                }}>
                  <Clock size={10} />
                  {act.duration_min} min
                </span>
              </div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setModal({ id: act.id })}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#185FA5', fontSize: 12, fontWeight: 500, padding: 0 }}
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(act.id, act.name)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C8202A', fontSize: 12, fontWeight: 500, padding: 0 }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {modal !== null && (
        <ActivityBuilderModal
          activityId={modal.id}
          onClose={() => {
            setModal(null)
            if (paramId) navigate('/activity-library', { replace: true })
          }}
        />
      )}
    </div>
  )
}
