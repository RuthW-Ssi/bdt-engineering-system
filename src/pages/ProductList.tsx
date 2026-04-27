import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, MoreHorizontal, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react'
import * as Icons from 'lucide-react'
import { mockProducts } from '../data/mockProducts'
import { CAT_META, PRODUCT_STATUS_META } from '../data/meta'
import { ProductStatusPill } from '../components/ui/ProductStatusPill'
import type { Category, ProductStatus } from '../types'

const CATEGORIES: Category[] = ['Assembly', 'SubAssembly', 'Part', 'Plate', 'ShapeStock', 'OtherMat', 'Consumable', 'Coil']
const STATUSES: ProductStatus[] = ['Draft', 'PendingReview', 'Active', 'Rejected', 'Blocked']
const PAGE_SIZE = 8

type SortKey = 'updated_at' | 'product_code' | 'status'
type SortDir = 'asc' | 'desc'

export function ProductList() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [filterCats, setFilterCats] = useState<Set<Category>>(new Set())
  const [filterStatuses, setFilterStatuses] = useState<Set<ProductStatus>>(new Set())
  const [sortKey, setSortKey] = useState<SortKey>('updated_at')
  const [sortDir] = useState<SortDir>('desc')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)

  const toggleCat = (c: Category) => {
    setFilterCats(prev => {
      const n = new Set(prev)
      n.has(c) ? n.delete(c) : n.add(c)
      return n
    })
    setPage(1)
  }

  const toggleStatus = (s: ProductStatus) => {
    setFilterStatuses(prev => {
      const n = new Set(prev)
      n.has(s) ? n.delete(s) : n.add(s)
      return n
    })
    setPage(1)
  }

  const filtered = mockProducts.filter(p => {
    const matchCat = filterCats.size === 0 || filterCats.has(p.category)
    const matchStatus = filterStatuses.size === 0 || filterStatuses.has(p.status)
    const q = search.toLowerCase()
    const matchSearch = !q || p.product_code.toLowerCase().includes(q) || p.name_th.toLowerCase().includes(q) || p.name_en.toLowerCase().includes(q)
    return matchCat && matchStatus && matchSearch
  })

  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === 'product_code') return sortDir === 'asc' ? a.product_code.localeCompare(b.product_code) : b.product_code.localeCompare(a.product_code)
    if (sortKey === 'status') return sortDir === 'asc' ? a.status.localeCompare(b.status) : b.status.localeCompare(a.status)
    return 0
  })

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
  const paged = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const allSelected = paged.length > 0 && paged.every(p => selected.has(p.product_code))
  const toggleAll = () => {
    if (allSelected) setSelected(prev => { const n = new Set(prev); paged.forEach(p => n.delete(p.product_code)); return n })
    else setSelected(prev => { const n = new Set(prev); paged.forEach(p => n.add(p.product_code)); return n })
  }
  const toggleRow = (code: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(code) ? n.delete(code) : n.add(code); return n })
  }

  const hasFilters = filterCats.size > 0 || filterStatuses.size > 0 || search
  const clearFilters = () => { setFilterCats(new Set()); setFilterStatuses(new Set()); setSearch(''); setPage(1) }

  return (
    <div className="flex flex-col min-h-[calc(100vh-56px)]">
      {/* Page Header */}
      <div className="bg-white flex items-center justify-between sticky top-14 z-40 border-b border-chrome-100 px-6" style={{ height: 56 }}>
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 18, fontWeight: 600, color: '#1F1F1F' }}>Products</span>
          <span style={{ color: '#C2C2C2' }}>·</span>
          <span className="font-mono" style={{ fontSize: 13, color: '#8E8E8E' }}>0X123</span>
          <span style={{ background: '#F5F5F5', border: '1px solid #E0E0E0', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 500, color: '#555' }}>
            {mockProducts.length} รายการ
          </span>
        </div>
        <button className="flex items-center gap-1.5 rounded-md text-white" style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, background: '#C8202A' }}>
          <Plus size={14} />เพิ่มชิ้นงาน
        </button>
      </div>

      {/* Filter Bar */}
      <div className="sticky z-30 border-b border-chrome-100" style={{ top: 110, background: '#F5F5F5' }}>
        {/* Search + sort row */}
        <div className="flex items-center gap-2 px-6" style={{ height: 44, borderBottom: '1px solid #E0E0E0' }}>
          <div className="relative">
            <Search size={14} className="absolute text-chrome-400 pointer-events-none" style={{ left: 10, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              className="border border-chrome-200 rounded-md bg-white focus:outline-none focus:border-steel-600"
              style={{ height: 32, padding: '0 10px 0 32px', fontSize: 13, width: 240 }}
              placeholder="ค้นหา..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
            />
          </div>

          <button
            onClick={() => setSortKey(k => k === 'updated_at' ? 'product_code' : 'updated_at')}
            className="flex items-center gap-1.5 rounded-md border border-chrome-200 bg-white hover:bg-chrome-50"
            style={{ height: 32, padding: '0 10px', fontSize: 12, color: '#555' }}
          >
            <ArrowUpDown size={13} />
            {sortKey === 'updated_at' ? 'อัปเดตล่าสุด' : 'รหัส A→Z'}
          </button>

          {hasFilters && (
            <button onClick={clearFilters} className="text-steel-600 hover:underline" style={{ fontSize: 12 }}>ล้างตัวกรอง</button>
          )}
          <span className="flex-1" />
          <span style={{ fontSize: 12, color: '#8E8E8E' }}>แสดง {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sorted.length)} จาก {sorted.length} รายการ</span>
        </div>

        {/* Category chips */}
        <div className="flex items-center gap-1.5 px-6 flex-wrap" style={{ padding: '8px 24px' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 4 }}>ประเภท:</span>
          {CATEGORIES.map(cat => {
            const m = CAT_META[cat]
            const active = filterCats.has(cat)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const Icon = (Icons as any)[m.icon] as React.ComponentType<{ size?: number; color?: string }> | undefined
            return (
              <button
                key={cat}
                onClick={() => toggleCat(cat)}
                className="inline-flex items-center gap-1 rounded-full transition-all"
                style={{
                  padding: '3px 10px',
                  fontSize: 12,
                  fontWeight: 500,
                  background: active ? `${m.color}18` : 'white',
                  color: active ? m.color : '#555',
                  border: `${active ? 2 : 1}px solid ${active ? m.color : '#E0E0E0'}`,
                }}
              >
                {Icon && <Icon size={11} color={active ? m.color : '#8E8E8E'} />}
                {m.label}
              </button>
            )
          })}
          <span style={{ width: 1, height: 16, background: '#C2C2C2', margin: '0 4px' }} />
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
        <div style={{ display: 'grid', gridTemplateColumns: '40px 160px 1fr 140px 140px 100px 120px 48px', alignItems: 'center', padding: '0 12px', height: 36, background: '#F5F5F5', borderBottom: '1px solid #E0E0E0' }}>
          <label className="flex items-center justify-center cursor-pointer">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} className="w-4 h-4 rounded" style={{ accentColor: '#C8202A' }} />
          </label>
          {[
            { label: 'รหัสชิ้นงาน', key: 'product_code' as SortKey },
            { label: 'ชื่อชิ้นงาน', key: null },
            { label: 'ประเภท', key: null },
            { label: 'สถานะ', key: 'status' as SortKey },
            { label: 'เวอร์ชัน', key: null },
            { label: 'อัปเดต', key: 'updated_at' as SortKey },
            { label: '', key: null },
          ].map((col, i) => (
            <button
              key={i}
              onClick={() => col.key && setSortKey(col.key)}
              className={`flex items-center gap-1 text-left ${col.key ? 'hover:text-chrome-900 cursor-pointer' : 'cursor-default'}`}
              style={{ fontSize: 11, fontWeight: 600, color: sortKey === col.key ? '#1F1F1F' : '#8E8E8E', textTransform: 'uppercase', letterSpacing: '0.06em' }}
            >
              {col.label}
              {col.key && <ArrowUpDown size={11} style={{ opacity: sortKey === col.key ? 1 : 0.4 }} />}
            </button>
          ))}
        </div>

        {/* Rows */}
        {paged.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3" style={{ padding: 64, color: '#8E8E8E', fontSize: 13 }}>
            <Search size={32} style={{ opacity: 0.3 }} />
            <div>ไม่พบชิ้นงานที่ตรงกับเงื่อนไข</div>
            <button onClick={clearFilters} className="text-steel-600 hover:underline" style={{ fontSize: 13 }}>ล้างตัวกรองทั้งหมด</button>
          </div>
        ) : (
          paged.map(p => {
            const catMeta = CAT_META[p.category]
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const CatIcon = (Icons as any)[catMeta.icon] as React.ComponentType<{ size?: number; color?: string }> | undefined
            const isSelected = selected.has(p.product_code)
            return (
              <div
                key={p.product_code}
                onClick={() => navigate(`/products/${p.product_code}`)}
                className="cursor-pointer transition-colors"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '40px 160px 1fr 140px 140px 100px 120px 48px',
                  alignItems: 'center',
                  padding: '0 12px',
                  height: 52,
                  borderBottom: '1px solid #E0E0E0',
                  background: isSelected ? '#EEF6FF' : p.status === 'Blocked' ? '#FFF8F8' : 'white',
                }}
                onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = '#FAFAFA' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isSelected ? '#EEF6FF' : p.status === 'Blocked' ? '#FFF8F8' : 'white' }}
              >
                {/* Checkbox */}
                <label className="flex items-center justify-center cursor-pointer" onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={isSelected} onChange={() => toggleRow(p.product_code)} className="w-4 h-4 rounded" style={{ accentColor: '#C8202A' }} />
                </label>

                {/* Code */}
                <div className="font-mono" style={{ fontSize: 13, fontWeight: 600, color: '#1F1F1F' }}>{p.product_code}</div>

                {/* Name */}
                <div className="min-w-0 pr-4">
                  <div className="truncate" style={{ fontSize: 13, fontWeight: 500, color: '#1F1F1F' }}>{p.name_th}</div>
                  <div className="truncate" style={{ fontSize: 12, color: '#8E8E8E' }}>{p.name_en}</div>
                </div>

                {/* Category */}
                <div className="flex items-center gap-1.5" style={{ fontSize: 12, fontWeight: 500, color: catMeta.color }}>
                  <span style={{ width: 18, height: 18, borderRadius: 999, background: `${catMeta.color}18`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {CatIcon && <CatIcon size={11} color={catMeta.color} />}
                  </span>
                  {catMeta.label}
                </div>

                {/* Status */}
                <div><ProductStatusPill status={p.status} /></div>

                {/* Version */}
                <div>
                  {p.version ? (
                    <span className="font-mono" style={{ fontSize: 12, background: '#E6F1FB', color: '#185FA5', border: '1px solid #B5D4F4', borderRadius: 999, padding: '2px 8px' }}>
                      v{p.version}
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: '#C2C2C2' }}>—</span>
                  )}
                </div>

                {/* Updated */}
                <div style={{ fontSize: 12, color: '#8E8E8E' }}>
                  <div>{p.updated_at}</div>
                  <div style={{ fontSize: 11, color: '#C2C2C2' }}>{p.updated_by}</div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-center" onClick={e => e.stopPropagation()}>
                  <button className="flex items-center justify-center rounded hover:bg-chrome-50" style={{ width: 28, height: 28, color: '#8E8E8E' }}>
                    <MoreHorizontal size={16} />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-chrome-100 px-6 bg-white" style={{ height: 44 }}>
          <span style={{ fontSize: 12, color: '#8E8E8E' }}>แสดง {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sorted.length)} จาก {sorted.length} รายการ</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="flex items-center justify-center rounded hover:bg-chrome-50 disabled:opacity-40" style={{ width: 32, height: 32 }}>
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button key={p} onClick={() => setPage(p)} className="flex items-center justify-center rounded font-mono" style={{ width: 32, height: 32, fontSize: 13, background: page === p ? '#C8202A' : 'transparent', color: page === p ? 'white' : '#555' }}>
                {p}
              </button>
            ))}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="flex items-center justify-center rounded hover:bg-chrome-50 disabled:opacity-40" style={{ width: 32, height: 32 }}>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="fixed flex items-center gap-3 rounded-xl shadow-modal" style={{ bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#1F1F1F', color: 'white', padding: '10px 20px', zIndex: 50, fontSize: 13 }}>
          <span>เลือก <span className="font-semibold">{selected.size}</span> รายการ</span>
          <span style={{ width: 1, height: 16, background: '#3A3A3A' }} />
          <button onClick={() => setSelected(new Set())} className="hover:text-chrome-200" style={{ color: '#8E8E8E' }}>ยกเลิก</button>
          <button className="rounded-md" style={{ background: '#C8202A', padding: '6px 14px', fontWeight: 600 }}>ส่งตรวจสอบ ({selected.size})</button>
        </div>
      )}

      {/* Status bar */}
      <div className="flex items-center border-t border-chrome-100 px-6 bg-chrome-50" style={{ height: 32, fontSize: 12, color: '#8E8E8E' }}>
        แสดง {sorted.length} ชิ้นงาน · 0X123 — อาคารโรงงาน A3
      </div>
    </div>
  )
}
