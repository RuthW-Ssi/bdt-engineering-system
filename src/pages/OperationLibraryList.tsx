import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import { apiClient } from '../api/client'

interface OpTemplateListItem {
  id: number; op_code: string; name: string; status: string
  time_mode: string
  workcenter: { code: string; name: string } | null
  op_type: { label: string; color: string } | null
  _count: { activities: number }
}

const STATUS_STYLE: Record<string, React.CSSProperties> = {
  draft:  { background: '#FFF8E1', color: '#F57F17', border: '1px solid #FFE082' },
  active: { background: '#E8F5E9', color: '#2E7D32', border: '1px solid #A5D6A7' },
}

export default function OperationLibraryList() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')

  const { data = [], isLoading } = useQuery<OpTemplateListItem[]>({
    queryKey: ['operation-templates'],
    queryFn: async () => {
      const { data } = await apiClient.get('/operation-templates')
      return Array.isArray(data) ? data : []
    },
    staleTime: 2 * 60 * 1000,
  })

  const q = search.trim().toLowerCase()
  const filtered = q
    ? data.filter(t =>
        t.op_code.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        (t.op_type?.label ?? '').toLowerCase().includes(q)
      )
    : data

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#F8F8F8', fontFamily: 'inherit' }}>

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E0E0E0', height: 56, padding: '0 24px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1F1F1F' }}>Operation Library</div>
          <div style={{ fontSize: 11, color: '#9E9E9E' }}>Standard operations — building blocks for routing templates</div>
        </div>
        <button
          onClick={() => navigate('/admin/operation-library/new')}
          style={{ height: 34, padding: '0 16px', borderRadius: 6, border: 'none', background: '#C8202A', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Plus size={14} />New Operation
        </button>
      </div>

      {/* Filter bar */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E0E0E0', height: 44, padding: '0 24px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, position: 'sticky', top: 56, zIndex: 10 }}>
        <div style={{ position: 'relative' }}>
          <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#BDBDBD', pointerEvents: 'none' }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search op code, name…"
            style={{ border: '1px solid #E0E0E0', borderRadius: 6, padding: '0 10px 0 28px', height: 30, fontSize: 12, outline: 'none', fontFamily: 'inherit', width: 220 }}
          />
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: '#9E9E9E' }}>{filtered.length} operation{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
        {/* Header row */}
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 140px 110px 90px 80px', gap: 12, padding: '0 16px', marginBottom: 6 }}>
          {['Op Code', 'Name', 'Work Station', 'Op Type', 'Time Mode', 'Activities'].map(h => (
            <div key={h} style={{ fontSize: 10, fontWeight: 700, color: '#9E9E9E', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
          ))}
        </div>

        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: '#9E9E9E' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: '#9E9E9E' }}>
            {data.length === 0 ? 'No operations yet — create the first one' : 'No results'}
          </div>
        ) : (
          filtered.map(t => (
            <div
              key={t.id}
              onClick={() => navigate(`/admin/operation-library/${t.id}/edit`)}
              style={{
                display: 'grid', gridTemplateColumns: '140px 1fr 140px 110px 90px 80px', gap: 12,
                padding: '0 16px', height: 52, alignItems: 'center',
                background: '#fff', borderRadius: 8, marginBottom: 4,
                border: '1px solid #E8E8E8', cursor: 'pointer',
                transition: 'box-shadow 0.1s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 3, height: 32, borderRadius: 2, background: t.op_type?.color ?? '#9E9E9E', flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#1F1F1F', fontFamily: 'monospace' }}>{t.op_code}</span>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#1F1F1F' }}>{t.name}</div>
              </div>
              <div style={{ fontSize: 12, color: '#555' }}>{t.workcenter ? `${t.workcenter.code}` : <span style={{ color: '#BDBDBD' }}>—</span>}</div>
              <div>
                {t.op_type
                  ? <span style={{ fontSize: 11, background: `${t.op_type.color}18`, color: t.op_type.color, borderRadius: 4, padding: '2px 7px', fontWeight: 600 }}>{t.op_type.label}</span>
                  : <span style={{ color: '#BDBDBD', fontSize: 11 }}>—</span>
                }
              </div>
              <div style={{ fontSize: 11, color: '#555', textTransform: 'capitalize' }}>{t.time_mode.replace('_', ' ')}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: '#555' }}>{t._count.activities}</span>
                <span style={{ ...STATUS_STYLE[t.status] ?? STATUS_STYLE.draft, fontSize: 9, borderRadius: 4, padding: '2px 6px', fontWeight: 700 }}>
                  {t.status.toUpperCase()}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
