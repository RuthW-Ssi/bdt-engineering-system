import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Search, Plus, MoreHorizontal, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { PRODUCT_STATUS_META } from '../data/meta'
import { ProductStatusPill } from '../components/ui/ProductStatusPill'
import { useMaterials } from '../hooks/useMaterials'
import { MaterialRegisterModal } from './MaterialRegisterModal'
import type { ProductStatus } from '../types'
import type { MaterialDTO } from '../api/types'
import { STATE_TO_PRODUCT_STATUS } from '../api/types'

const STATUSES: ProductStatus[] = ['Draft', 'PendingReview', 'Active', 'Rejected', 'Blocked']
const STATE_REVERSE: Record<string, string> = {
  Draft: 'draft',
  PendingReview: 'to_approve',
  Active: 'confirmed',
  Rejected: 'cancel',
  Blocked: 'blocked',
}

const TYPE_TABS = [
  { key: '',        label: 'All' },
  { key: 'product', label: 'Product' },
  { key: 'consu',   label: 'Consumable' },
  { key: 'service', label: 'Service' },
] as const

type TypeKey = '' | 'product' | 'consu' | 'service'

// Column layout per type
const COLS: Record<TypeKey, { template: string; headers: string[] }> = {
  '':        { template: '140px 1fr 180px 100px 120px 48px',         headers: ['Code', 'Name', 'Category', 'Status', 'Updated', ''] },
  product:   { template: '140px 1fr 160px 180px 100px 120px 48px',   headers: ['Code', 'Name', 'Specs', 'Category', 'Status', 'Updated', ''] },
  consu:     { template: '140px 1fr 80px 180px 100px 120px 48px',    headers: ['Code', 'Name', 'UoM', 'Category', 'Status', 'Updated', ''] },
  service:   { template: '140px 1fr 180px 100px 120px 48px',         headers: ['Code', 'Name', 'Category', 'Status', 'Updated', ''] },
}

function fmt(n: number | null | undefined, digits = 0) {
  if (n == null) return null
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: digits })
}

function SpecsCell({ mat }: { mat: MaterialDTO }) {
  const parts: string[] = []
  if (mat.grade) parts.push(mat.grade)
  if (mat.thickness_mm) parts.push(`${fmt(mat.thickness_mm)}mm`)
  if (!parts.length && mat.width_mm) parts.push(`W${fmt(mat.width_mm)}`)
  if (!parts.length && mat.length_mm) parts.push(`L${fmt(mat.length_mm)}`)
  if (!parts.length) return <span style={{ color: '#C2C2C2', fontSize: 12 }}>—</span>
  return (
    <div style={{ fontSize: 12, color: '#555' }}>
      <span style={{ fontWeight: 600, color: '#1F1F1F' }}>{parts[0]}</span>
      {parts[1] && <span style={{ color: '#8E8E8E' }}> · {parts[1]}</span>}
    </div>
  )
}

const PAGE_SIZE = 20

export function MaterialList() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [showRegister, setShowRegister] = useState(false)

  const typeFilter = (searchParams.get('type') || '') as TypeKey
  const stateFilter = searchParams.get('state') || ''
  const searchQ = searchParams.get('q') || ''
  const pageParam = parseInt(searchParams.get('page') || '1')

  const backendState = stateFilter ? STATE_REVERSE[stateFilter] : undefined

  const { data, isLoading, isError } = useMaterials({
    type: typeFilter || undefined,
    q: searchQ || undefined,
    state: backendState,
    page: pageParam,
    limit: PAGE_SIZE,
  })

  const items: MaterialDTO[] = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = data?.pages ?? 1

  const setParam = (key: string, value: string) => {
    const p = new URLSearchParams(searchParams)
    if (value) p.set(key, value)
    else p.delete(key)
    if (key !== 'page') p.set('page', '1')
    setSearchParams(p)
  }

  const toUiStatus = (state: string): ProductStatus =>
    (STATE_TO_PRODUCT_STATUS[state] as ProductStatus) ?? 'Draft'

  const hasFilters = !!stateFilter || !!searchQ
  const col = COLS[typeFilter] ?? COLS['']

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)', overflow: 'hidden' }}>

      {/* Header */}
      <div className="bg-white flex items-center justify-between border-b border-chrome-100 px-6" style={{ height: 56, flexShrink: 0 }}>
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 18, fontWeight: 600, color: '#1F1F1F' }}>Materials</span>
          <span style={{ color: '#C2C2C2' }}>·</span>
          <span style={{ background: '#F5F5F5', border: '1px solid #E0E0E0', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 500, color: '#555' }}>
            {isLoading ? '...' : `${total} items`}
          </span>
        </div>
        <button onClick={() => setShowRegister(true)} className="flex items-center gap-1.5 rounded-md text-white"
          style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, background: '#C8202A' }}>
          <Plus size={14} />Add Material
        </button>
      </div>

      {/* Type Tabs */}
      <div className="bg-white border-b border-chrome-100 px-6 flex gap-0" style={{ flexShrink: 0 }}>
        {TYPE_TABS.map(t => {
          const active = typeFilter === t.key
          return (
            <button key={t.key} onClick={() => setParam('type', t.key)}
              style={{
                padding: '10px 16px', fontSize: 13,
                fontWeight: active ? 600 : 400,
                color: active ? '#C8202A' : '#8E8E8E',
                background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: `2px solid ${active ? '#C8202A' : 'transparent'}`,
              }}>
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Filter Bar */}
      <div className="border-b border-chrome-100" style={{ background: '#F5F5F5', flexShrink: 0 }}>
        <div className="flex items-center gap-2 px-6" style={{ height: 44, borderBottom: '1px solid #E0E0E0' }}>
          <div className="relative">
            <Search size={14} className="absolute text-chrome-400 pointer-events-none" style={{ left: 10, top: '50%', transform: 'translateY(-50%)' }} />
            <input className="border border-chrome-200 rounded-md bg-white focus:outline-none focus:border-steel-600"
              style={{ height: 32, padding: '0 10px 0 32px', fontSize: 13, width: 240 }}
              placeholder="Search code / name..."
              value={searchQ} onChange={e => setParam('q', e.target.value)} />
          </div>
          {hasFilters && (
            <button onClick={() => { setParam('state', ''); setParam('q', '') }} className="text-steel-600 hover:underline" style={{ fontSize: 12 }}>Clear filters</button>
          )}
          <span className="flex-1" />
          {!isLoading && <span style={{ fontSize: 12, color: '#8E8E8E' }}>Page {pageParam} / {totalPages} · {total} items</span>}
        </div>

        {/* Status chips */}
        <div className="flex items-center gap-1.5 flex-wrap" style={{ padding: '8px 24px' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 4 }}>Status:</span>
          {STATUSES.map(st => {
            const m = PRODUCT_STATUS_META[st]
            const active = stateFilter === st
            return (
              <button key={st} onClick={() => setParam('state', active ? '' : st)}
                className="inline-flex items-center gap-1 rounded-full transition-all"
                style={{
                  padding: '3px 10px', fontSize: 12, fontWeight: 500,
                  background: active ? m.bg : 'white', color: active ? m.text : '#555',
                  border: `${active ? 2 : 1}px solid ${active ? m.text : '#E0E0E0'}`,
                }}>
                {m.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white flex-1" style={{ overflowY: 'auto', minHeight: 0 }}>

        {/* Column headers */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 10,
          display: 'grid', gridTemplateColumns: col.template,
          alignItems: 'center', padding: '0 12px', height: 36,
          background: '#F5F5F5', borderBottom: '1px solid #E0E0E0',
        }}>
          {col.headers.map((h, i) => (
            <div key={i} style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase' }}>{h}</div>
          ))}
        </div>

        {isLoading && (
          <div className="flex items-center justify-center gap-2" style={{ padding: 64, color: '#8E8E8E', fontSize: 13 }}>
            <Loader2 size={20} className="animate-spin" />Loading data...
          </div>
        )}

        {isError && !isLoading && (
          <div className="flex flex-col items-center justify-center gap-2" style={{ padding: 64, color: '#C8202A', fontSize: 13 }}>
            Unable to load data — verify that the backend is running
          </div>
        )}

        {!isLoading && !isError && items.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3" style={{ padding: 64, color: '#8E8E8E', fontSize: 13 }}>
            <Search size={32} style={{ opacity: 0.3 }} />
            <div>No materials match the current filters</div>
          </div>
        )}

        {!isLoading && !isError && items.map(p => (
          <div key={p.default_code} onClick={() => navigate(`/materials/${p.default_code}`)}
            className="cursor-pointer transition-colors hover:bg-chrome-50"
            style={{
              display: 'grid', gridTemplateColumns: col.template,
              alignItems: 'center', padding: '0 12px', height: 52, borderBottom: '1px solid #E0E0E0',
            }}>
            <div className="font-mono" style={{ fontSize: 13, fontWeight: 600, color: '#1F1F1F' }}>{p.default_code}</div>

            <div className="min-w-0 pr-4">
              <div className="truncate" style={{ fontSize: 13, fontWeight: 500, color: '#1F1F1F' }}>{p.name}</div>
              <div className="truncate" style={{ fontSize: 12, color: '#8E8E8E' }}>{p.description_sale}</div>
            </div>

            {/* Type-specific middle column */}
            {typeFilter === 'product' && <SpecsCell mat={p} />}
            {typeFilter === 'consu'   && <div style={{ fontSize: 12, color: '#555' }}>{p.uom?.name ?? '—'}</div>}

            <div style={{ fontSize: 12, color: '#555' }}>{p.category?.name ?? `categ #${p.categ_id}`}</div>
            <div><ProductStatusPill status={toUiStatus(p.state)} /></div>
            <div style={{ fontSize: 12, color: '#8E8E8E' }}>
              <div>{new Date(p.write_date).toLocaleDateString('en-GB')}</div>
              <div style={{ fontSize: 11, color: '#C2C2C2' }}>{p.write_user?.name ?? '-'}</div>
            </div>
            <div className="flex items-center justify-center" onClick={e => e.stopPropagation()}>
              <button className="flex items-center justify-center rounded hover:bg-chrome-50" style={{ width: 28, height: 28, color: '#8E8E8E' }}>
                <MoreHorizontal size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-chrome-100 px-6 bg-white" style={{ height: 44, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: '#8E8E8E' }}>Page {pageParam} / {totalPages} · {total} items</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setParam('page', String(Math.max(1, pageParam - 1)))} disabled={pageParam === 1}
              className="flex items-center justify-center rounded hover:bg-chrome-50 disabled:opacity-40" style={{ width: 32, height: 32 }}>
              <ChevronLeft size={16} />
            </button>
            {(() => {
              const window = 7
              const start = Math.max(1, Math.min(pageParam - Math.floor(window / 2), totalPages - window + 1))
              const end   = Math.min(totalPages, start + window - 1)
              const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i)
              return (
                <>
                  {start > 1 && (
                    <>
                      <button onClick={() => setParam('page', '1')} className="flex items-center justify-center rounded font-mono"
                        style={{ width: 32, height: 32, fontSize: 13, color: '#555' }}>1</button>
                      {start > 2 && <span style={{ fontSize: 13, color: '#8E8E8E', padding: '0 2px' }}>…</span>}
                    </>
                  )}
                  {pages.map(pg => (
                    <button key={pg} onClick={() => setParam('page', String(pg))} className="flex items-center justify-center rounded font-mono"
                      style={{ width: 32, height: 32, fontSize: 13, background: pageParam === pg ? '#C8202A' : 'transparent', color: pageParam === pg ? 'white' : '#555' }}>
                      {pg}
                    </button>
                  ))}
                  {end < totalPages && (
                    <>
                      {end < totalPages - 1 && <span style={{ fontSize: 13, color: '#8E8E8E', padding: '0 2px' }}>…</span>}
                      <button onClick={() => setParam('page', String(totalPages))} className="flex items-center justify-center rounded font-mono"
                        style={{ width: 32, height: 32, fontSize: 13, color: '#555' }}>{totalPages}</button>
                    </>
                  )}
                </>
              )
            })()}
            <button onClick={() => setParam('page', String(Math.min(totalPages, pageParam + 1)))} disabled={pageParam === totalPages}
              className="flex items-center justify-center rounded hover:bg-chrome-50 disabled:opacity-40" style={{ width: 32, height: 32 }}>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Status bar */}
      <div className="flex items-center border-t border-chrome-100 px-6 bg-chrome-50" style={{ height: 32, fontSize: 12, color: '#8E8E8E', flexShrink: 0 }}>
        {isLoading ? 'Loading...' : `Showing ${items.length} of ${total} items`}
      </div>

      {showRegister && <MaterialRegisterModal onClose={() => setShowRegister(false)} />}
    </div>
  )
}
