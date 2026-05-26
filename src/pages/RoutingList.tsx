import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Layers, AlertCircle, Plus } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../api/client'

// ── Types ──────────────────────────────────────────────────────

interface RoutingTemplateSummary {
  id: number
  code: string
  name: string
  state: string
  applies_to_product_type: string | null
  operation_count: number
  bound_product_count: number
  write_date: string
}

// ── State pill ─────────────────────────────────────────────────

const STATE_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  draft:    { bg: '#F5F5F5', text: '#555', label: 'Draft' },
  active:   { bg: '#EAF5E9', text: '#2E7D32', label: 'Active' },
  obsolete: { bg: '#FFF3E0', text: '#E65100', label: 'Obsolete' },
}

function StatePill({ state }: { state: string }) {
  const s = STATE_STYLE[state] ?? STATE_STYLE.draft
  return (
    <span style={{ background: s.bg, color: s.text, borderRadius: 999, padding: '2px 10px', fontSize: 11, fontWeight: 600 }}>
      {s.label}
    </span>
  )
}

// ── Fetch routing templates ────────────────────────────────────

async function fetchRoutingTemplates(): Promise<RoutingTemplateSummary[]> {
  const { data } = await apiClient.get<RoutingTemplateSummary[]>('/routing-templates')
  return Array.isArray(data) ? data : []
}

// ── Component ──────────────────────────────────────────────────

export function RoutingList() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [filterState, setFilterState] = useState<string>('all')

  const { data = [], isLoading, error } = useQuery({
    queryKey: ['routing-templates'],
    queryFn: fetchRoutingTemplates,
    staleTime: 2 * 60 * 1000,
  })

  const filtered = data.filter(r => {
    const matchState = filterState === 'all' || r.state === filterState
    const q = search.toLowerCase()
    const matchSearch = !q ||
      r.code.toLowerCase().includes(q) ||
      r.name.toLowerCase().includes(q)
    return matchState && matchSearch
  })

  return (
    <div className="flex flex-col min-h-[calc(100vh-56px)]">
      {/* Header */}
      <div className="bg-white flex items-center justify-between sticky top-14 z-40 border-b border-chrome-100 px-6" style={{ height: 56 }}>
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 18, fontWeight: 600, color: '#1F1F1F' }}>Routing Templates</span>
          <span style={{ background: '#F5F5F5', border: '1px solid #E0E0E0', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 500, color: '#555' }}>
            {data.length} templates
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/routings/new')}
            className="rounded-md flex items-center gap-1.5"
            style={{ height: 32, padding: '0 14px', fontSize: 12, fontWeight: 600, background: '#C8202A', color: '#fff', border: 'none', cursor: 'pointer' }}
          >
            <Plus size={13} /> New Template
          </button>
          <button
            onClick={() => navigate('/admin/workcenters')}
            className="rounded-md border border-chrome-200 bg-white hover:bg-chrome-50 text-chrome-700"
            style={{ height: 32, padding: '0 14px', fontSize: 12, fontWeight: 500 }}
          >
            Work Centers
          </button>
          <button
            onClick={() => navigate('/admin/binding-rules')}
            className="rounded-md border border-chrome-200 bg-white hover:bg-chrome-50 text-chrome-700"
            style={{ height: 32, padding: '0 14px', fontSize: 12, fontWeight: 500 }}
          >
            Binding Rules
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center sticky z-30 border-b border-chrome-100 px-6 gap-2" style={{ height: 44, top: 110, background: '#F5F5F5' }}>
        <div className="relative">
          <Search size={14} className="absolute text-chrome-400 pointer-events-none" style={{ left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            className="border border-chrome-200 rounded-md bg-white focus:outline-none focus:border-steel-600"
            style={{ height: 32, padding: '0 10px 0 32px', fontSize: 13, width: 280 }}
            placeholder="Search template code or name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <select
          value={filterState}
          onChange={e => setFilterState(e.target.value)}
          className="border border-chrome-200 rounded-md bg-white cursor-pointer focus:outline-none"
          style={{ height: 32, padding: '0 10px', fontSize: 13 }}
        >
          <option value="all">Status — All</option>
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="obsolete">Obsolete</option>
        </select>

        {(search || filterState !== 'all') && (
          <button onClick={() => { setSearch(''); setFilterState('all') }} className="text-steel-600 hover:underline" style={{ fontSize: 12 }}>Reset</button>
        )}

        <span className="flex-1" />
        <span style={{ fontSize: 12, color: '#8E8E8E' }}>Showing {filtered.length} of {data.length}</span>
      </div>

      {/* Table */}
      <div className="bg-white flex-1">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 70px 80px 110px 120px', padding: '0 20px', height: 36, background: '#F5F5F5', borderBottom: '1px solid #E0E0E0', alignItems: 'center' }}>
          {['Template', 'Type', 'Ops', 'Bound', 'State', 'Updated'].map((h, i) => (
            <span key={i} style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
          ))}
        </div>

        {isLoading ? (
          <div className="text-center" style={{ padding: 48, color: '#8E8E8E', fontSize: 13 }}>Loading...</div>
        ) : error ? (
          <div className="flex items-center justify-center gap-2" style={{ padding: 48, color: '#C8202A', fontSize: 13 }}>
            <AlertCircle size={16} /> Failed to load data
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center" style={{ padding: 48, color: '#8E8E8E', fontSize: 13 }}>
            {data.length === 0 ? 'No routing templates in the system' : 'No templates match the current filters'}
          </div>
        ) : (
          filtered.map(r => (
            <div
              key={r.id}
              className="hover:bg-chrome-50 transition-colors cursor-pointer"
              onClick={() => navigate(`/routings/${r.id}/edit`)}
              style={{ display: 'grid', gridTemplateColumns: '1fr 110px 70px 80px 110px 120px', alignItems: 'center', padding: '0 20px', height: 52, borderBottom: '1px solid #E0E0E0' }}
            >
              <div>
                <div className="font-mono" style={{ fontSize: 13, fontWeight: 600, color: '#1F1F1F' }}>{r.code}</div>
                <div className="truncate" style={{ fontSize: 12, color: '#555', maxWidth: 300 }}>{r.name}</div>
              </div>

              <div style={{ fontSize: 12, color: '#555' }}>
                {r.applies_to_product_type ?? <span style={{ color: '#BDBDBD' }}>All types</span>}
              </div>

              <div className="flex items-center gap-1" style={{ fontSize: 13, color: '#555' }}>
                <Layers size={13} style={{ color: '#8E8E8E' }} />
                {r.operation_count}
              </div>

              <div style={{ fontSize: 13, color: '#555' }}>
                {r.bound_product_count > 0
                  ? <span style={{ fontWeight: 600, color: '#1F1F1F' }}>{r.bound_product_count}</span>
                  : <span style={{ color: '#BDBDBD' }}>—</span>}
              </div>

              <div><StatePill state={r.state} /></div>

              <div style={{ fontSize: 12, color: '#8E8E8E' }}>
                {new Date(r.write_date).toLocaleDateString('en-GB')}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="sticky flex items-center border-t border-chrome-100 px-6 bg-chrome-50" style={{ bottom: 0, height: 32, fontSize: 12, color: '#8E8E8E', zIndex: 30 }}>
        Showing {filtered.length} templates
      </div>
    </div>
  )
}
