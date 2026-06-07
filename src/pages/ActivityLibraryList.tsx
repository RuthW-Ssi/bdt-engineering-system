import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { useActivities, useDeleteActivity } from '../hooks/useActivities'

export function ActivityLibraryList() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const q = searchParams.get('q') || undefined
  const machine_id = searchParams.get('machine_id') ? Number(searchParams.get('machine_id')) : undefined
  const material_id = searchParams.get('material_id') ? Number(searchParams.get('material_id')) : undefined

  const { data: activities = [], isLoading, isError } = useActivities({ q, machine_id, material_id })
  const deleteMutation = useDeleteActivity()

  function handleSearch(value: string) {
    setSearchParams((prev) => {
      if (value) prev.set('q', value)
      else prev.delete('q')
      return prev
    })
  }

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
          onClick={() => navigate('/activity-library/new')}
          style={{ height: 34, padding: '0 16px', borderRadius: 6, border: 'none', background: '#C8202A', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Plus size={14} />New Activity
        </button>
      </div>

      {/* Filter bar */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E0E0E0', height: 44, padding: '0 24px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, position: 'sticky', top: 56, zIndex: 10 }}>
        <div style={{ position: 'relative' }}>
          <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#BDBDBD', pointerEvents: 'none' }} />
          <input
            defaultValue={q}
            onChange={(e) => handleSearch(e.target.value)}
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
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 120px 1fr 110px 100px', gap: 12, padding: '0 16px', marginBottom: 6 }}>
          {['Code', 'Name', 'Machine', 'Consumes', 'Duration (min)', ''].map((h) => (
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
                display: 'grid', gridTemplateColumns: '140px 1fr 120px 1fr 110px 100px', gap: 12,
                padding: '0 16px', height: 52, alignItems: 'center',
                background: '#fff', borderRadius: 8, marginBottom: 4,
                border: '1px solid #E8E8E8',
                transition: 'box-shadow 0.1s',
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
              <div style={{ fontSize: 13, color: '#1F1F1F' }}>{act.duration_min}</div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => navigate(`/activity-library/${act.id}/edit`)}
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
    </div>
  )
}
