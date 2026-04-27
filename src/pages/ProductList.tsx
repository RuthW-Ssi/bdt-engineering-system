import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, MoreHorizontal, ArrowUpDown, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
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

const PAGE_SIZE = 20

type SortKey = 'write_date' | 'default_code'

export function ProductList() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [filterStatuses, setFilterStatuses] = useState<Set<ProductStatus>>(new Set())
  const [sortKey] = useState<SortKey>('write_date')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)
  const [showRegister, setShowRegister] = useState(false)

  const stateFilter = filterStatuses.size === 1
    ? STATE_REVERSE[Array.from(filterStatuses)[0]]
    : undefined

  const { data, isLoading, isError } = useMaterials({
    q: search || undefined,
    state: stateFilter,
    page,
    limit: PAGE_SIZE,
  })

  const items: MaterialDTO[] = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = data?.pages ?? 1

  const toggleStatus = (s: ProductStatus) => {
    setFilterStatuses(prev => {
      const n = new Set(prev)
      n.has(s) ? n.delete(s) : n.add(s)
      return n
    })
    setPage(1)
  }

  const allSelected = items.length > 0 && items.every(p => selected.has(p.default_code))
  const toggleAll = () => {
    if (allSelected) setSelected(prev => { const n = new Set(prev); items.forEach(p => n.delete(p.default_code)); return n })
    else setSelected(prev => { const n = new Set(prev); items.forEach(p => n.add(p.default_code)); return n })
  }
  const toggleRow = (code: string) =>
    setSelected(prev => { const n = new Set(prev); n.has(code) ? n.delete(code) : n.add(code); return n })

  const hasFilters = filterStatuses.size > 0 || !!search
  const clearFilters = () => { setFilterStatuses(new Set()); setSearch(''); setPage(1) }

  const toUiStatus = (state: string): ProductStatus =>
    (STATE_TO_PRODUCT_STATUS[state] as ProductStatus) ?? 'Draft'

  return (
    <div className="flex flex-col min-h-[calc(100vh-56px)]">
      {/* Page Header */}
      <div className="bg-white flex items-center justify-between sticky top-14 z-40 border-b border-chrome-100 px-6" style={{ height: 56 }}>
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 18, fontWeight: 600, color: '#1F1F1F' }}>Materials</span>
          <span style={{ color: '#C2C2C2' }}>·</span>
          <span style={{ background: '#F5F5F5', border: '1px solid #E0E0E0', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 500, color: '#555' }}>
            {isLoading ? '...' : `${total} รายการ`}
          </span>
        </div>
        <button
          onClick={() => setShowRegister(true)}
          className="flex items-center gap-1.5 rounded-md text-white"
          style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, background: '#C8202A' }}
        >
          <Plus size={14} />เพิ่มชิ้นงาน
        </button>
      </div>

      {/* Filter Bar */}
      <div className="sticky z-30 border-b border-chrome-100" style={{ top: 110, background: '#F5F5F5' }}>
        <div className="flex items-center gap-2 px-6" style={{ height: 44, borderBottom: '1px solid #E0E0E0' }}>
          <div className="relative">
            <Search size={14} className="absolute text-chrome-400 pointer-events-none" style={{ left: 10, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              className="border border-chrome-200 rounded-md bg-white focus:outline-none focus:border-steel-600"
              style={{ height: 32, padding: '0 10px 0 32px', fontSize: 13, width: 240 }}
              placeholder="ค้นหารหัส / ชื่อ..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
            />
          </div>
          {hasFilters && (
            <button onClick={clearFilters} className="text-steel-600 hover:underline" style={{ fontSize: 12 }}>ล้างตัวกรอง</button>
          )}
          <span className="flex-1" />
          {!isLoading && (
            <span style={{ fontSize: 12, color: '#8E8E8E' }}>
              หน้า {page} / {totalPages} · {total} รายการ
            </span>
          )}
        </div>

        {/* Status chips */}
        <div className="flex items-center gap-1.5 flex-wrap" style={{ padding: '8px 24px' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 4 }}>สถานะ:</span>
          {STATUSES.map(st => {
            const m = PRODUCT_STATUS_META[st]
            const active = filterStatuses.has(st)
            return (
              <button
                key={st}
                onClick={() => toggleStatus(st)}
                className="inline-flex items-center gap-1 rounded-full transition-all"
                style={{
                  padding: '3px 10px',
                  fontSize: 12,
                  fontWeight: 500,
                  background: active ? m.bg : 'white',
                  color: active ? m.text : '#555',
                  border: `${active ? 2 : 1}px solid ${active ? m.text : '#E0E0E0'}`,
                }}
              >
                {m.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white flex-1">
        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: '40px 160px 1fr 180px 100px 140px 48px', alignItems: 'center', padding: '0 12px', height: 36, background: '#F5F5F5', borderBottom: '1px solid #E0E0E0' }}>
          <label className="flex items-center justify-center cursor-pointer">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} className="w-4 h-4 rounded" style={{ accentColor: '#C8202A' }} />
          </label>
          {[
            { label: 'รหัสชิ้นงาน', key: 'default_code' as SortKey },
            { label: 'ชื่อชิ้นงาน', key: null },
            { label: 'กลุ่มวัสดุ', key: null },
            { label: 'สถานะ', key: null },
            { label: 'อัปเดต', key: 'write_date' as SortKey },
            { label: '', key: null },
          ].map((col, i) => (
            <div
              key={i}
              className="flex items-center gap-1"
              style={{ fontSize: 11, fontWeight: 600, color: sortKey === col.key ? '#1F1F1F' : '#8E8E8E', textTransform: 'uppercase', letterSpacing: '0.06em' }}
            >
              {col.label}
              {col.key && <ArrowUpDown size={11} style={{ opacity: 0.4 }} />}
            </div>
          ))}
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center gap-2" style={{ padding: 64, color: '#8E8E8E', fontSize: 13 }}>
            <Loader2 size={20} className="animate-spin" />
            กำลังโหลดข้อมูล...
          </div>
        )}

        {/* Error state */}
        {isError && !isLoading && (
          <div className="flex flex-col items-center justify-center gap-2" style={{ padding: 64, color: '#C8202A', fontSize: 13 }}>
            <div>ไม่สามารถโหลดข้อมูลได้ — ตรวจสอบว่า backend กำลังทำงาน</div>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !isError && items.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3" style={{ padding: 64, color: '#8E8E8E', fontSize: 13 }}>
            <Search size={32} style={{ opacity: 0.3 }} />
            <div>ไม่พบชิ้นงานที่ตรงกับเงื่อนไข</div>
            {hasFilters && (
              <button onClick={clearFilters} className="text-steel-600 hover:underline" style={{ fontSize: 13 }}>ล้างตัวกรองทั้งหมด</button>
            )}
          </div>
        )}

        {/* Rows */}
        {!isLoading && !isError && items.map(p => {
          const uiStatus = toUiStatus(p.state)
          const isSelected = selected.has(p.default_code)
          return (
            <div
              key={p.default_code}
              onClick={() => navigate(`/products/${p.default_code}`)}
              className="cursor-pointer transition-colors"
              style={{
                display: 'grid',
                gridTemplateColumns: '40px 160px 1fr 180px 100px 140px 48px',
                alignItems: 'center',
                padding: '0 12px',
                height: 52,
                borderBottom: '1px solid #E0E0E0',
                background: isSelected ? '#EEF6FF' : p.state === 'blocked' ? '#FFF8F8' : 'white',
              }}
              onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = '#FAFAFA' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isSelected ? '#EEF6FF' : p.state === 'blocked' ? '#FFF8F8' : 'white' }}
            >
              {/* Checkbox */}
              <label className="flex items-center justify-center cursor-pointer" onClick={e => e.stopPropagation()}>
                <input type="checkbox" checked={isSelected} onChange={() => toggleRow(p.default_code)} className="w-4 h-4 rounded" style={{ accentColor: '#C8202A' }} />
              </label>

              {/* Code */}
              <div className="font-mono" style={{ fontSize: 13, fontWeight: 600, color: '#1F1F1F' }}>{p.default_code}</div>

              {/* Name */}
              <div className="min-w-0 pr-4">
                <div className="truncate" style={{ fontSize: 13, fontWeight: 500, color: '#1F1F1F' }}>{p.name}</div>
                <div className="truncate" style={{ fontSize: 12, color: '#8E8E8E' }}>{p.description_sale}</div>
              </div>

              {/* Category */}
              <div style={{ fontSize: 12, color: '#555' }}>
                {p.category?.name ?? `categ #${p.categ_id}`}
              </div>

              {/* Status */}
              <div><ProductStatusPill status={uiStatus} /></div>

              {/* Updated */}
              <div style={{ fontSize: 12, color: '#8E8E8E' }}>
                <div>{new Date(p.write_date).toLocaleDateString('th-TH')}</div>
                <div style={{ fontSize: 11, color: '#C2C2C2' }}>{p.write_user?.name ?? '-'}</div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-center" onClick={e => e.stopPropagation()}>
                <button className="flex items-center justify-center rounded hover:bg-chrome-50" style={{ width: 28, height: 28, color: '#8E8E8E' }}>
                  <MoreHorizontal size={16} />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-chrome-100 px-6 bg-white" style={{ height: 44 }}>
          <span style={{ fontSize: 12, color: '#8E8E8E' }}>หน้า {page} / {totalPages} · {total} รายการ</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="flex items-center justify-center rounded hover:bg-chrome-50 disabled:opacity-40" style={{ width: 32, height: 32 }}>
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map(p => (
              <button key={p} onClick={() => setPage(p)} className="flex items-center justify-center rounded font-mono"
                style={{ width: 32, height: 32, fontSize: 13, background: page === p ? '#C8202A' : 'transparent', color: page === p ? 'white' : '#555' }}>
                {p}
              </button>
            ))}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="flex items-center justify-center rounded hover:bg-chrome-50 disabled:opacity-40" style={{ width: 32, height: 32 }}>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="fixed flex items-center gap-3 rounded-xl shadow-modal"
          style={{ bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#1F1F1F', color: 'white', padding: '10px 20px', zIndex: 50, fontSize: 13 }}>
          <span>เลือก <span className="font-semibold">{selected.size}</span> รายการ</span>
          <span style={{ width: 1, height: 16, background: '#3A3A3A' }} />
          <button onClick={() => setSelected(new Set())} className="hover:text-chrome-200" style={{ color: '#8E8E8E' }}>ยกเลิก</button>
        </div>
      )}

      {/* Status bar */}
      <div className="flex items-center border-t border-chrome-100 px-6 bg-chrome-50" style={{ height: 32, fontSize: 12, color: '#8E8E8E' }}>
        {isLoading ? 'กำลังโหลด...' : `แสดง ${items.length} จาก ${total} รายการ`}
      </div>

      {/* Material Register Modal */}
      {showRegister && <MaterialRegisterModal onClose={() => setShowRegister(false)} />}
    </div>
  )
}
