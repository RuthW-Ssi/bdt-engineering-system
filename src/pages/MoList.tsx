import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Loader2, Package, ChevronRight } from 'lucide-react'
import { useMos } from '../hooks/useMo'
import { MoStatusPill } from '../components/mo/MoStatusPill'
import type { MoStatus } from '../api/mo'

const STATUSES: (MoStatus | 'ALL')[] = ['ALL', 'DRAFT', 'CONFIRMED', 'IN_PROGRESS', 'DONE', 'CANCELLED']

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

export function MoList({ embedded = false }: { embedded?: boolean } = {}) {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<MoStatus | 'ALL'>('ALL')

  const { data, isLoading } = useMos({
    search: search || undefined,
    status: status === 'ALL' ? undefined : status,
  })
  const items = data ?? []

  return (
    <div className="flex flex-col" style={{ height: embedded ? '100%' : 'calc(100vh - 56px)', overflow: 'hidden' }}>
      {/* Header — hidden when embedded in the Order Hub (the hub provides title + New MO) */}
      {!embedded && (
        <div className="bg-white flex items-center justify-between border-b border-chrome-100 px-6" style={{ height: 56, flexShrink: 0 }}>
          <div className="flex items-center gap-3">
            <span style={{ fontSize: 18, fontWeight: 600, color: '#1F1F1F' }}>Manufacturing Orders</span>
            <span style={{ color: '#C2C2C2' }}>·</span>
            <span style={{ background: '#F5F5F5', border: '1px solid #E0E0E0', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 500, color: '#555' }}>
              {isLoading ? '...' : `${items.length} orders`}
            </span>
          </div>
          <button
            onClick={() => navigate('/mo/new')}
            className="flex items-center gap-1.5 rounded-md text-white"
            style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, background: '#C8202A', border: 'none', cursor: 'pointer' }}
          >
            <Plus size={14} />New MO
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="border-b border-chrome-100 px-6 flex items-center gap-3" style={{ minHeight: 48, background: '#F5F5F5', flexShrink: 0, flexWrap: 'wrap', paddingTop: 8, paddingBottom: 8 }}>
        <div className="relative">
          <Search size={14} className="absolute text-chrome-400 pointer-events-none" style={{ left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search MO code..."
            style={{ paddingLeft: 32, paddingRight: 12, height: 32, fontSize: 13, border: '1px solid #C2C2C2', borderRadius: 4, background: '#fff', width: 240 }}
          />
        </div>
        <div className="flex items-center gap-1">
          {STATUSES.map(s => (
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

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {isLoading ? (
          <div className="flex items-center justify-center" style={{ height: 200 }}>
            <Loader2 size={20} className="animate-spin" style={{ color: '#C2C2C2' }} />
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-center justify-center" style={{ height: 200, color: '#8E8E8E', fontSize: 14 }}>
            No manufacturing orders found
          </div>
        ) : (
          items.map(mo => (
            <div
              key={mo.id}
              onClick={() => navigate(`/mo/${mo.id}`)}
              className="group"
              style={{
                border: '1px solid #E0E0E0', borderRadius: 8, background: '#fff',
                padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#FAFAFA')}
              onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
            >
              <div style={{ width: 40, height: 40, borderRadius: 8, flexShrink: 0, background: '#F5F5F5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Package size={18} style={{ color: '#8E8E8E' }} />
              </div>
              <div style={{ minWidth: 120 }}>
                <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#1A1A1A' }}>{mo.mo_code}</div>
                <div style={{ fontSize: 12, color: '#8E8E8E', marginTop: 2 }}>
                  {mo.mark_prefix?.code} · {mo.routing_template?.name}
                </div>
              </div>
              <div style={{ flex: 1, display: 'flex', gap: 24, fontSize: 12, color: '#666' }}>
                <span><strong style={{ color: '#333' }}>{mo.assembly_count}</strong> assemblies</span>
                <span><strong style={{ color: '#333' }}>{mo.operation_count}</strong> ops</span>
                <span>Due: <strong style={{ color: '#333' }}>{fmtDate(mo.due_date)}</strong></span>
              </div>
              <MoStatusPill status={mo.status} />
              <ChevronRight size={16} style={{ color: '#C2C2C2', flexShrink: 0 }} />
            </div>
          ))
        )}
      </div>
    </div>
  )
}
