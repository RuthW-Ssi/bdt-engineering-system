import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Layers, AlertCircle, Plus, Trash2 } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiClient } from '../api/client'
import { useMarkPrefixes } from '../hooks/useMarkPrefixes'
import { useConfirm } from '../components/ui/ConfirmDialog'
import { PaginationBar } from '../components/PaginationBar'

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

interface PaginatedRoutings {
  data: RoutingTemplateSummary[]
  total: number
  page: number
  limit: number
  totalPages: number
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

const LIMIT = 10

// ── Component ──────────────────────────────────────────────────

export function RoutingList() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [filterState, setFilterState] = useState('all')
  const [page, setPage] = useState(1)

  const { data: paged, isLoading, error } = useQuery<PaginatedRoutings>({
    queryKey: ['routing-templates', search, filterState, page],
    queryFn: async () => {
      const { data } = await apiClient.get('/routing-templates', {
        params: {
          search: search || undefined,
          state: filterState !== 'all' ? filterState : undefined,
          page,
          limit: LIMIT,
        },
      })
      return data
    },
    staleTime: 2 * 60 * 1000,
    placeholderData: (prev) => prev,
  })

  const items = paged?.data ?? []
  const total = paged?.total ?? 0
  const totalPages = paged?.totalPages ?? 1

  const { data: markPrefixes = [] } = useMarkPrefixes()
  const prefixMap = new Map(markPrefixes.map(p => [p.code, p.label]))

  const confirm = useConfirm()

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/routing-templates/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['routing-templates'] })
      toast.success('Routing template deleted')
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message ?? 'Failed to delete routing template — please try again')
      console.error(e)
    },
    meta: { skipGlobalErrorToast: true },
  })

  async function handleDelete(e: React.MouseEvent, r: RoutingTemplateSummary) {
    e.stopPropagation()
    const ok = await confirm({
      title: 'Delete routing template?',
      message: `"${r.code} — ${r.name}" will be permanently deleted.`,
      variant: 'danger',
      confirmLabel: 'Delete',
    })
    if (!ok) return
    deleteMut.mutate(r.id)
  }

  function handleSearch(q: string) {
    setSearch(q)
    setPage(1)
  }

  function handleStateFilter(s: string) {
    setFilterState(s)
    setPage(1)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', overflow: 'hidden', background: '#F5F5F5', fontFamily: 'inherit' }}>

      {/* Header */}
      <div className="bg-white border-b border-chrome-100" style={{ height: 56, padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 18, fontWeight: 600, color: '#1F1F1F' }}>Routing Templates</span>
          <span style={{ background: '#F5F5F5', border: '1px solid #E0E0E0', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 500, color: '#555' }}>
            {total} templates
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => navigate('/routings/new')}
            style={{ height: 32, padding: '0 14px', fontSize: 12, fontWeight: 600, background: '#C8202A', color: '#fff', border: 'none', cursor: 'pointer', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6 }}
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

      {/* Filter bar */}
      <div style={{ height: 44, padding: '0 24px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, background: '#F5F5F5', borderBottom: '1px solid #E0E0E0' }}>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#BDBDBD', pointerEvents: 'none' }} />
          <input
            className="border border-chrome-200 rounded-md bg-white focus:outline-none focus:border-steel-600"
            style={{ height: 32, padding: '0 10px 0 32px', fontSize: 13, width: 280 }}
            placeholder="Search template code or name..."
            value={search}
            onChange={e => handleSearch(e.target.value)}
          />
        </div>
        <select
          value={filterState}
          onChange={e => handleStateFilter(e.target.value)}
          className="border border-chrome-200 rounded-md bg-white cursor-pointer focus:outline-none"
          style={{ height: 32, padding: '0 10px', fontSize: 13 }}
        >
          <option value="all">Status — All</option>
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="obsolete">Obsolete</option>
        </select>
        {(search || filterState !== 'all') && (
          <button onClick={() => { handleSearch(''); handleStateFilter('all') }} className="text-steel-600 hover:underline" style={{ fontSize: 12 }}>Reset</button>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: '#8E8E8E' }}>{total} results</span>
      </div>

      {/* Column headers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 70px 80px 110px 120px 36px', padding: '0 20px', height: 36, background: '#F5F5F5', borderBottom: '1px solid #E0E0E0', alignItems: 'center', flexShrink: 0 }}>
        {['Template', 'Mark Prefix', 'Ops', 'Bound', 'State', 'Updated', ''].map((h, i) => (
          <span key={i} style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
        ))}
      </div>

      {/* Scrollable rows */}
      <div style={{ flex: 1, overflowY: 'auto', background: '#fff' }}>
        {isLoading ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#8E8E8E', fontSize: 13 }}>Loading...</div>
        ) : error ? (
          <div style={{ padding: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#C8202A', fontSize: 13 }}>
            <AlertCircle size={16} /> Failed to load data
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#8E8E8E', fontSize: 13 }}>
            {total === 0 && !search && filterState === 'all' ? 'No routing templates in the system' : 'No templates match the current filters'}
          </div>
        ) : (
          items.map(r => (
            <div
              key={r.id}
              className="hover:bg-chrome-50 transition-colors cursor-pointer"
              onClick={() => navigate(`/routings/${r.id}/edit`)}
              style={{ display: 'grid', gridTemplateColumns: '1fr 160px 70px 80px 110px 120px 36px', alignItems: 'center', padding: '0 20px', height: 52, borderBottom: '1px solid #E0E0E0' }}
            >
              <div>
                <div className="font-mono" style={{ fontSize: 13, fontWeight: 600, color: '#1F1F1F' }}>{r.code}</div>
                <div className="truncate" style={{ fontSize: 12, color: '#555', maxWidth: 300 }}>{r.name}</div>
              </div>
              <div style={{ fontSize: 12, color: '#555' }}>
                {r.applies_to_product_type
                  ? <>
                      <span className="font-mono" style={{ fontWeight: 600, color: '#1F1F1F' }}>{r.applies_to_product_type}</span>
                      {prefixMap.has(r.applies_to_product_type) && (
                        <span style={{ color: '#8E8E8E' }}> · {prefixMap.get(r.applies_to_product_type)}</span>
                      )}
                    </>
                  : <span style={{ color: '#BDBDBD' }}>—</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: '#555' }}>
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
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button
                  onClick={e => handleDelete(e, r)}
                  disabled={deleteMut.isPending}
                  title="Delete this routing template"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#BDBDBD', padding: 4, display: 'flex', alignItems: 'center', borderRadius: 4 }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#C8202A' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#BDBDBD' }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <PaginationBar page={page} totalPages={totalPages} total={total} limit={LIMIT} onChange={setPage} />
    </div>
  )
}
