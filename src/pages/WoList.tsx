import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Loader2, AlertTriangle } from 'lucide-react'
import { useWos } from '../hooks/useWo'
import { WoStatusPill } from '../components/wo/WoStatusPill'
import type { WoStatus } from '../api/wo'

const STATUSES: (WoStatus | 'ALL')[] = [
  'ALL', 'NOT_STARTED', 'RELEASED', 'IN_PROGRESS', 'PAUSED', 'DONE', 'CANCELLED',
]

function fmtDay(d: string | null) {
  return d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—'
}

const GRID = '150px 110px 50px 1.2fr 130px 1fr 110px 70px'

/** WO list — flat, filterable. Rendered inside the Order Hub (no own title). */
export function WoList() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<WoStatus | 'ALL'>('ALL')
  const [workCenterId, setWorkCenterId] = useState<number | ''>('')
  const [moId, setMoId] = useState<number | ''>('')

  // Unfiltered universe for dropdown options (one query); the list below is server-filtered.
  const { data: all } = useWos({})
  const { data, isLoading } = useWos({
    search: search || undefined,
    status: status === 'ALL' ? undefined : status,
    work_center_id: workCenterId || undefined,
    mo_id: moId || undefined,
  })
  const items = data ?? []

  const workCenters = useMemo(() => {
    const m = new Map<number, string>()
    ;(all ?? []).forEach((w) => m.set(w.work_center.id, w.work_center.code))
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [all])
  const mos = useMemo(() => {
    const m = new Map<number, string>()
    ;(all ?? []).forEach((w) => m.set(w.mo.id, w.mo.mo_code))
    return [...m.entries()].sort((a, b) => b[0] - a[0])
  }, [all])

  const selectStyle = { height: 32, fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4, background: '#fff', padding: '0 8px' }

  return (
    <div className="flex flex-col" style={{ height: '100%', overflow: 'hidden' }}>
      {/* Filters */}
      <div className="border-b border-chrome-100 px-6 flex items-center gap-3" style={{ minHeight: 48, background: '#F5F5F5', flexShrink: 0, flexWrap: 'wrap', paddingTop: 8, paddingBottom: 8 }}>
        <div className="relative">
          <Search size={14} className="absolute text-chrome-400 pointer-events-none" style={{ left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search WO code..."
            style={{ paddingLeft: 32, paddingRight: 12, height: 32, fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4, background: '#fff', width: 200 }}
          />
        </div>
        <select value={workCenterId} onChange={(e) => setWorkCenterId(e.target.value ? Number(e.target.value) : '')} style={selectStyle}>
          <option value="">All work centers</option>
          {workCenters.map(([id, code]) => <option key={id} value={id}>{code}</option>)}
        </select>
        <select value={moId} onChange={(e) => setMoId(e.target.value ? Number(e.target.value) : '')} style={selectStyle}>
          <option value="">All MOs</option>
          {mos.map(([id, code]) => <option key={id} value={id}>{code}</option>)}
        </select>
        <div className="flex items-center gap-1" style={{ flexWrap: 'wrap' }}>
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              style={{
                height: 28, padding: '0 12px', fontSize: 12, fontWeight: 600, borderRadius: 999,
                border: '1px solid ' + (status === s ? '#C8202A' : '#D8D8D8'),
                background: status === s ? '#FCEBEB' : '#fff',
                color: status === s ? '#C8202A' : '#666', cursor: 'pointer',
              }}
            >
              {s === 'ALL' ? 'All' : s.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: GRID, background: '#F5F5F5', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#888', position: 'sticky', top: 0, zIndex: 1 }}>
          {['WO Code', 'MO', 'Seq', 'Work Center', 'Status', 'Assigned', 'Target End', 'BOM'].map((h) => (
            <div key={h} style={{ padding: '9px 12px' }}>{h}</div>
          ))}
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center" style={{ height: 200 }}><Loader2 size={20} className="animate-spin" style={{ color: '#C2C2C2' }} /></div>
        ) : items.length === 0 ? (
          <div className="flex items-center justify-center" style={{ height: 200, color: '#8E8E8E', fontSize: 14 }}>No work orders found</div>
        ) : (
          items.map((w) => (
            <div
              key={w.id}
              onClick={() => navigate(`/order/wo/${w.id}`)}
              style={{ display: 'grid', gridTemplateColumns: GRID, borderTop: '1px solid #EEE', fontSize: 13, alignItems: 'center', cursor: 'pointer' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#FAFAFA')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
            >
              <div style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 700, color: '#1A1A1A' }}>{w.wo_code}</div>
              <div style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 12, color: '#555' }}>{w.mo.mo_code}</div>
              <div style={{ padding: '10px 12px', color: '#999' }}>{String(w.sequence).padStart(3, '0')}</div>
              <div style={{ padding: '10px 12px' }}>
                <div style={{ fontWeight: 600, color: '#333' }}>{w.work_center.code}</div>
                <div style={{ fontSize: 11, color: '#999' }}>{w.assembly_mark}</div>
              </div>
              <div style={{ padding: '10px 12px' }}><WoStatusPill status={w.status} /></div>
              <div style={{ padding: '10px 12px', fontSize: 12, color: '#666' }}>{w.assigned_to || '—'}</div>
              <div style={{ padding: '10px 12px', fontSize: 12, color: '#555' }}>{fmtDay(w.target_end_at)}</div>
              <div style={{ padding: '10px 12px' }}>
                {w.is_outdated ? (
                  <span title="Newer BOM version available" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#C62828', fontSize: 11, fontWeight: 700 }}>
                    <AlertTriangle size={12} /> v+
                  </span>
                ) : (
                  <span style={{ color: '#C8C8C8' }}>—</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
