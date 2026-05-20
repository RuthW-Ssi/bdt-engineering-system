import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Search, Plus, MoreHorizontal, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { useProducts } from '../hooks/useProducts'
import { useProjects } from '../hooks/useProjects'
import { ProductStatePill } from '../components/product/ProductStatePill'
import { NewStandardProductModal } from '../components/product/NewStandardProductModal'
import { NewCustomProductModal } from '../components/product/NewCustomProductModal'
import type { ProductDTO, ProductType, ProductState } from '../api/types'
import { PRODUCT_STATE_LABELS, PRODUCT_STATE_COLORS } from '../api/types'

const STATES: ProductState[] = ['draft', 'in_design', 'in_review', 'approved', 'released', 'obsolete']
const PAGE_SIZE = 20

export function ProductList() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const tab = (searchParams.get('tab') as ProductType) || 'standard'
  const stateFilter = searchParams.get('state') || ''
  const searchQ = searchParams.get('q') || ''
  const projectFilter = searchParams.get('project_id') || ''
  const pageParam = parseInt(searchParams.get('page') || '1')

  const [showModal, setShowModal] = useState<'standard' | 'custom' | null>(null)

  const { data: projectsData } = useProjects({ limit: 100 })
  const projects = projectsData?.items ?? []

  const { data, isLoading, isError } = useProducts({
    product_type: tab,
    state: stateFilter || undefined,
    q: searchQ || undefined,
    project_id: projectFilter ? parseInt(projectFilter) : undefined,
    page: pageParam,
    limit: PAGE_SIZE,
  })

  const items: ProductDTO[] = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = data?.pages ?? 1

  const setParam = (key: string, value: string) => {
    const p = new URLSearchParams(searchParams)
    if (value) p.set(key, value)
    else p.delete(key)
    if (key !== 'page') p.set('page', '1')
    setSearchParams(p)
  }

  const markDisplay = (p: ProductDTO) => {
    const parts = [p.erection_zone?.code, p.mark_prefix, p.mark_number].filter(Boolean)
    return parts.join('-') || '-'
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      {/* Header */}
      <div className="bg-white flex items-center justify-between border-b border-chrome-100 px-6" style={{ height: 56, flexShrink: 0 }}>
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 18, fontWeight: 600, color: '#1F1F1F' }}>Engineer Products</span>
          <span style={{ color: '#C2C2C2' }}>·</span>
          <span style={{ background: '#F5F5F5', border: '1px solid #E0E0E0', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 500, color: '#555' }}>
            {isLoading ? '...' : `${total} items`}
          </span>
        </div>
        <button onClick={() => setShowModal(tab)} className="flex items-center gap-1.5 rounded-md text-white"
          style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, background: tab === 'standard' ? '#0C447C' : '#B45309' }}>
          <Plus size={14} />Add {tab === 'standard' ? 'Standard' : 'Custom'} Product
        </button>
      </div>

      {/* Tabs + Filters */}
      <div className="border-b border-chrome-100" style={{ background: '#F5F5F5', flexShrink: 0 }}>
        {/* Type tabs */}
        <div className="flex px-6" style={{ borderBottom: '1px solid #E0E0E0' }}>
          {(['standard', 'custom'] as ProductType[]).map(t => (
            <button key={t} onClick={() => setParam('tab', t)}
              style={{
                padding: '10px 20px', fontSize: 13, fontWeight: tab === t ? 600 : 400,
                color: tab === t ? (t === 'standard' ? '#0C447C' : '#B45309') : '#8E8E8E',
                borderBottom: `2px solid ${tab === t ? (t === 'standard' ? '#0C447C' : '#B45309') : 'transparent'}`,
              }}>
              {t === 'standard' ? 'Standard' : 'Custom'}
            </button>
          ))}
        </div>

        {/* Search + State filter */}
        <div className="flex items-center gap-2 px-6" style={{ height: 44, borderBottom: '1px solid #E0E0E0' }}>
          <div className="relative">
            <Search size={14} className="absolute text-chrome-400 pointer-events-none" style={{ left: 10, top: '50%', transform: 'translateY(-50%)' }} />
            <input className="border border-chrome-200 rounded-md bg-white focus:outline-none focus:border-steel-600"
              style={{ height: 32, padding: '0 10px 0 32px', fontSize: 13, width: 240 }}
              placeholder="Search code / name..."
              value={searchQ} onChange={e => setParam('q', e.target.value)} />
          </div>
          {tab === 'custom' && (
            <select className="border border-chrome-200 rounded-md bg-white focus:outline-none"
              style={{ height: 32, padding: '0 8px', fontSize: 12, borderColor: projectFilter ? '#B45309' : '#E0E0E0', minWidth: 160 }}
              value={projectFilter} onChange={e => setParam('project_id', e.target.value)}>
              <option value="">All Projects</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.project_code} — {p.name}</option>)}
            </select>
          )}
          {(stateFilter || searchQ || projectFilter) && (
            <button onClick={() => { setParam('state', ''); setParam('q', ''); setParam('project_id', '') }} className="text-steel-600 hover:underline" style={{ fontSize: 12 }}>Clear filters</button>
          )}
          <span className="flex-1" />
          {!isLoading && <span style={{ fontSize: 12, color: '#8E8E8E' }}>Page {pageParam} / {totalPages} · {total} items</span>}
        </div>

        {/* State chips */}
        <div className="flex items-center gap-1.5 flex-wrap" style={{ padding: '8px 24px' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 4 }}>Status:</span>
          {STATES.map(st => {
            const colors = PRODUCT_STATE_COLORS[st]
            const active = stateFilter === st
            return (
              <button key={st} onClick={() => setParam('state', active ? '' : st)}
                className="inline-flex items-center gap-1 rounded-full transition-all"
                style={{
                  padding: '3px 10px', fontSize: 12, fontWeight: 500,
                  background: active ? colors.bg : 'white', color: active ? colors.text : '#555',
                  border: `${active ? 2 : 1}px solid ${active ? colors.text : '#E0E0E0'}`,
                }}>
                {PRODUCT_STATE_LABELS[st]}
              </button>
            )
          })}
        </div>
      </div>

      {/* Table — only this area scrolls */}
      <div className="bg-white flex-1" style={{ overflowY: 'auto', minHeight: 0 }}>
        {/* Column Header — sticky within scroll container */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 10,
          display: 'grid',
          gridTemplateColumns: tab === 'standard'
            ? '140px 1fr 140px 120px 100px 120px 48px'
            : '140px 1fr 160px 120px 100px 120px 48px',
          alignItems: 'center', padding: '0 12px', height: 36, background: '#F5F5F5', borderBottom: '1px solid #E0E0E0',
        }}>
          {tab === 'standard' ? (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase' }}>Code</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase' }}>Name</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase' }}>Eng. Code</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase' }}>Category</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase' }}>Status</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase' }}>Updated</div>
              <div />
            </>
          ) : (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase' }}>Code</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase' }}>Name</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase' }}>Project / Mark</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase' }}>Category</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase' }}>Status</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase' }}>Updated</div>
              <div />
            </>
          )}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center gap-2" style={{ padding: 64, color: '#8E8E8E', fontSize: 13 }}>
            <Loader2 size={20} className="animate-spin" />Loading data...
          </div>
        )}

        {/* Error */}
        {isError && !isLoading && (
          <div className="flex flex-col items-center justify-center gap-2" style={{ padding: 64, color: '#C8202A', fontSize: 13 }}>
            Unable to load data — verify that the backend is running
          </div>
        )}

        {/* Empty */}
        {!isLoading && !isError && items.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3" style={{ padding: 64, color: '#8E8E8E', fontSize: 13 }}>
            <Search size={32} style={{ opacity: 0.3 }} />
            <div>No Products match the current filters</div>
          </div>
        )}

        {/* Rows */}
        {!isLoading && !isError && items.map(p => (
          <div key={p.product_code} onClick={() => navigate(`/engineer-products/${p.product_code}`)}
            className="cursor-pointer transition-colors hover:bg-chrome-50"
            style={{
              display: 'grid',
              gridTemplateColumns: tab === 'standard'
                ? '140px 1fr 140px 120px 100px 120px 48px'
                : '140px 1fr 160px 120px 100px 120px 48px',
              alignItems: 'center', padding: '0 12px', height: 52, borderBottom: '1px solid #E0E0E0',
            }}>
            {/* Code */}
            <div className="font-mono" style={{ fontSize: 13, fontWeight: 600, color: '#1F1F1F' }}>{p.product_code}</div>

            {/* Name */}
            <div className="min-w-0 pr-4">
              <div className="truncate" style={{ fontSize: 13, fontWeight: 500, color: '#1F1F1F' }}>{p.name}</div>
            </div>

            {/* Standard: Eng Code / Custom: Project+Mark */}
            {tab === 'standard' ? (
              <div className="font-mono" style={{ fontSize: 12, color: p.engineering_code ? '#555' : '#C2C2C2' }}>
                {p.engineering_code ?? '—'}
              </div>
            ) : (
              <div style={{ fontSize: 12 }}>
                <div style={{ color: '#555' }}>{p.project?.project_code ?? '—'}</div>
                <div className="font-mono" style={{ color: '#B45309', fontWeight: 500 }}>{markDisplay(p)}</div>
              </div>
            )}

            {/* Category */}
            <div style={{ fontSize: 12, color: '#555' }}>{p.category?.name ?? '-'}</div>

            {/* State */}
            <div><ProductStatePill state={p.state} /></div>

            {/* Updated */}
            <div style={{ fontSize: 12, color: '#8E8E8E' }}>
              <div>{new Date(p.write_date).toLocaleDateString('en-GB')}</div>
              <div style={{ fontSize: 11, color: '#C2C2C2' }}>{p.write_user?.name ?? '-'}</div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-center" onClick={e => e.stopPropagation()}>
              <button className="flex items-center justify-center rounded hover:bg-chrome-50" style={{ width: 28, height: 28, color: '#8E8E8E' }}>
                <MoreHorizontal size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination — always at bottom */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-chrome-100 px-6 bg-white" style={{ height: 44, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: '#8E8E8E' }}>Page {pageParam} / {totalPages} · {total} items</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setParam('page', String(Math.max(1, pageParam - 1)))} disabled={pageParam === 1}
              className="flex items-center justify-center rounded hover:bg-chrome-50 disabled:opacity-40" style={{ width: 32, height: 32 }}>
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map(p => (
              <button key={p} onClick={() => setParam('page', String(p))} className="flex items-center justify-center rounded font-mono"
                style={{ width: 32, height: 32, fontSize: 13, background: pageParam === p ? '#C8202A' : 'transparent', color: pageParam === p ? 'white' : '#555' }}>
                {p}
              </button>
            ))}
            <button onClick={() => setParam('page', String(Math.min(totalPages, pageParam + 1)))} disabled={pageParam === totalPages}
              className="flex items-center justify-center rounded hover:bg-chrome-50 disabled:opacity-40" style={{ width: 32, height: 32 }}>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Status bar — always at bottom */}
      <div className="flex items-center border-t border-chrome-100 px-6 bg-chrome-50" style={{ height: 32, fontSize: 12, color: '#8E8E8E', flexShrink: 0 }}>
        {isLoading ? 'Loading...' : `Showing ${items.length} of ${total} items`}
      </div>

      {/* Modals */}
      {showModal === 'standard' && <NewStandardProductModal onClose={() => setShowModal(null)} />}
      {showModal === 'custom' && <NewCustomProductModal onClose={() => setShowModal(null)} />}
    </div>
  )
}
