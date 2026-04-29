import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Clock, Layers, AlertCircle } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../api/client'
import type { RoutingOpDTO } from '../api/routings'

// ── Types ──────────────────────────────────────────────────────

interface ProductRoutingSummary {
  product_code: string
  product_name: string
  state: string
  op_count: number
  total_time_min: number
  last_computed_at: string | null
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

function fmtTime(min: number) {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// ── Fetch all products that have routing ops ───────────────────

async function fetchRoutingSummaries(): Promise<ProductRoutingSummary[]> {
  // Paginate through all custom products (API max limit=100)
  let allProducts: Array<{ product_code: string; name: string }> = []
  let page = 1
  while (true) {
    const { data } = await apiClient.get('/products', {
      params: { product_type: 'custom', limit: 100, page },
    })
    const items = (data.items ?? data) as Array<{ product_code: string; name: string }>
    allProducts = allProducts.concat(items)
    const meta = data.meta
    if (!meta || page >= meta.pages) break
    page++
  }

  const results: ProductRoutingSummary[] = []
  await Promise.all(
    allProducts.map(async (p) => {
      try {
        const { data: ops } = await apiClient.get<RoutingOpDTO[]>(`/products/${p.product_code}/routing`)
        if (!Array.isArray(ops) || ops.length === 0) return
        results.push({
          product_code: p.product_code,
          product_name: p.name,
          state: ops[0]?.state ?? 'draft',
          op_count: ops.length,
          total_time_min: ops.reduce((s, o) => s + Number(o.time_cycle), 0),
          last_computed_at: ops[0]?.last_computed_at ?? null,
        })
      } catch {
        // product has no routing — skip silently
      }
    }),
  )
  results.sort((a, b) => a.product_code.localeCompare(b.product_code))
  return results
}

// ── Component ──────────────────────────────────────────────────

export function RoutingList() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [filterState, setFilterState] = useState<string>('all')

  const { data = [], isLoading, error } = useQuery({
    queryKey: ['routing-summaries'],
    queryFn: fetchRoutingSummaries,
    staleTime: 2 * 60 * 1000,
  })

  const filtered = data.filter(r => {
    const matchState = filterState === 'all' || r.state === filterState
    const q = search.toLowerCase()
    const matchSearch = !q ||
      r.product_code.toLowerCase().includes(q) ||
      r.product_name.toLowerCase().includes(q)
    return matchState && matchSearch
  })

  return (
    <div className="flex flex-col min-h-[calc(100vh-56px)]">
      {/* Header */}
      <div className="bg-white flex items-center justify-between sticky top-14 z-40 border-b border-chrome-100 px-6" style={{ height: 56 }}>
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 18, fontWeight: 600, color: '#1F1F1F' }}>Routings</span>
          <span style={{ background: '#F5F5F5', border: '1px solid #E0E0E0', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 500, color: '#555' }}>
            {data.length} รายการ
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/admin/workcenters')}
            className="rounded-md border border-chrome-200 bg-white hover:bg-chrome-50 text-chrome-700"
            style={{ height: 32, padding: '0 14px', fontSize: 12, fontWeight: 500 }}
          >
            Work Centers
          </button>
          <button
            onClick={() => navigate('/admin/activity-templates')}
            className="rounded-md border border-chrome-200 bg-white hover:bg-chrome-50 text-chrome-700"
            style={{ height: 32, padding: '0 14px', fontSize: 12, fontWeight: 500 }}
          >
            Activity Templates
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
            placeholder="ค้นหา รหัสชิ้นงาน หรือ ชื่อ..."
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
          <option value="all">สถานะ — ทั้งหมด</option>
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="obsolete">Obsolete</option>
        </select>

        {(search || filterState !== 'all') && (
          <button onClick={() => { setSearch(''); setFilterState('all') }} className="text-steel-600 hover:underline" style={{ fontSize: 12 }}>รีเซ็ต</button>
        )}

        <span className="flex-1" />
        <span style={{ fontSize: 12, color: '#8E8E8E' }}>แสดง {filtered.length} จาก {data.length}</span>
      </div>

      {/* Table */}
      <div className="bg-white flex-1">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 130px 140px 140px', padding: '0 20px', height: 36, background: '#F5F5F5', borderBottom: '1px solid #E0E0E0', alignItems: 'center' }}>
          {['ชิ้นงาน', 'Ops', 'เวลารวม', 'สถานะ', 'Computed'].map((h, i) => (
            <span key={i} style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
          ))}
        </div>

        {isLoading ? (
          <div className="text-center" style={{ padding: 48, color: '#8E8E8E', fontSize: 13 }}>กำลังโหลด...</div>
        ) : error ? (
          <div className="flex items-center justify-center gap-2" style={{ padding: 48, color: '#C8202A', fontSize: 13 }}>
            <AlertCircle size={16} /> โหลดข้อมูลไม่สำเร็จ
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center" style={{ padding: 48, color: '#8E8E8E', fontSize: 13 }}>
            {data.length === 0 ? 'ยังไม่มี routing ในระบบ' : 'ไม่พบ routing ที่ตรงกับเงื่อนไข'}
          </div>
        ) : (
          filtered.map(r => (
            <div
              key={r.product_code}
              onClick={() => navigate(`/routings/${r.product_code}`)}
              className="cursor-pointer hover:bg-chrome-50 transition-colors"
              style={{ display: 'grid', gridTemplateColumns: '1fr 80px 130px 140px 140px', alignItems: 'center', padding: '0 20px', height: 52, borderBottom: '1px solid #E0E0E0' }}
            >
              <div>
                <div className="font-mono" style={{ fontSize: 13, fontWeight: 600, color: '#1F1F1F' }}>{r.product_code}</div>
                <div className="truncate" style={{ fontSize: 12, color: '#555', maxWidth: 280 }}>{r.product_name}</div>
              </div>

              <div className="flex items-center gap-1" style={{ fontSize: 13, color: '#555' }}>
                <Layers size={13} style={{ color: '#8E8E8E' }} />
                {r.op_count}
              </div>

              <div>
                <div className="flex items-center gap-1 font-mono" style={{ fontSize: 13, fontWeight: 500, color: '#3A3A3A' }}>
                  <Clock size={12} style={{ color: '#8E8E8E' }} />
                  {r.total_time_min > 0 ? fmtTime(r.total_time_min) : '—'}
                </div>
                {r.total_time_min > 0 && (
                  <div style={{ fontSize: 11, color: '#8E8E8E' }}>{Math.round(r.total_time_min)} นาที</div>
                )}
              </div>

              <div><StatePill state={r.state} /></div>

              <div style={{ fontSize: 12, color: '#8E8E8E' }}>
                {r.last_computed_at ? new Date(r.last_computed_at).toLocaleDateString('th-TH') : '—'}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="sticky flex items-center border-t border-chrome-100 px-6 bg-chrome-50" style={{ bottom: 0, height: 32, fontSize: 12, color: '#8E8E8E', zIndex: 30 }}>
        แสดง {filtered.length} routing
      </div>
    </div>
  )
}
