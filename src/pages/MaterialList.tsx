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

const PAGE_SIZE = 20

export function MaterialList() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const stateFilter = searchParams.get('state') || ''
  const searchQ = searchParams.get('q') || ''
  const pageParam = parseInt(searchParams.get('page') || '1')
  const [showRegister, setShowRegister] = useState(false)

  // Map UI state to backend state
  const backendState = stateFilter ? STATE_REVERSE[stateFilter] : undefined

  const { data, isLoading, isError } = useMaterials({
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

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      {/* Header */}
      <div className="bg-white flex items-center justify-between border-b border-chrome-100 px-6" style={{ height: 56, flexShrink: 0 }}>
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 18, fontWeight: 600, color: '#1F1F1F' }}>Materials</span>
          <span style={{ color: '#C2C2C2' }}>·</span>
          <span style={{ background: '#F5F5F5', border: '1px solid #E0E0E0', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 500, color: '#555' }}>
            {isLoading ? '...' : `${total} รายการ`}
          </span>
        </div>
        <button onClick={() => setShowRegister(true)} className="flex items-center gap-1.5 rounded-md text-white"
          style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, background: '#C8202A' }}>
          <Plus size={14} />เพิ่มวัสดุ
        </button>
      </div>

      {/* Filter Bar */}
      <div className="border-b border-chrome-100" style={{ background: '#F5F5F5', flexShrink: 0 }}>
        <div className="flex items-center gap-2 px-6" style={{ height: 44, borderBottom: '1px solid #E0E0E0' }}>
          <div className="relative">
            <Search size={14} className="absolute text-chrome-400 pointer-events-none" style={{ left: 10, top: '50%', transform: 'translateY(-50%)' }} />
            <input className="border border-chrome-200 rounded-md bg-white focus:outline-none focus:border-steel-600"
              style={{ height: 32, padding: '0 10px 0 32px', fontSize: 13, width: 240 }}
              placeholder="ค้นหารหัส / ชื่อ..."
              value={searchQ} onChange={e => setParam('q', e.target.value)} />
          </div>
          {hasFilters && (
            <button onClick={() => { setParam('state', ''); setParam('q', '') }} className="text-steel-600 hover:underline" style={{ fontSize: 12 }}>ล้างตัวกรอง</button>
          )}
          <span className="flex-1" />
          {!isLoading && <span style={{ fontSize: 12, color: '#8E8E8E' }}>หน้า {pageParam} / {totalPages} · {total} รายการ</span>}
        </div>

        {/* Status chips */}
        <div className="flex items-center gap-1.5 flex-wrap" style={{ padding: '8px 24px' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 4 }}>สถานะ:</span>
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

      {/* Table — only this area scrolls */}
      <div className="bg-white flex-1" style={{ overflowY: 'auto', minHeight: 0 }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 10, display: 'grid', gridTemplateColumns: '140px 1fr 180px 100px 120px 48px', alignItems: 'center', padding: '0 12px', height: 36, background: '#F5F5F5', borderBottom: '1px solid #E0E0E0' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase' }}>รหัสชิ้นงาน</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase' }}>ชื่อชิ้นงาน</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase' }}>กลุ่มวัสดุ</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase' }}>สถานะ</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase' }}>อัปเดต</div>
          <div />
        </div>

        {isLoading && (
          <div className="flex items-center justify-center gap-2" style={{ padding: 64, color: '#8E8E8E', fontSize: 13 }}>
            <Loader2 size={20} className="animate-spin" />กำลังโหลดข้อมูล...
          </div>
        )}

        {isError && !isLoading && (
          <div className="flex flex-col items-center justify-center gap-2" style={{ padding: 64, color: '#C8202A', fontSize: 13 }}>
            ไม่สามารถโหลดข้อมูลได้ — ตรวจสอบว่า backend กำลังทำงาน
          </div>
        )}

        {!isLoading && !isError && items.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3" style={{ padding: 64, color: '#8E8E8E', fontSize: 13 }}>
            <Search size={32} style={{ opacity: 0.3 }} />
            <div>ไม่พบวัสดุที่ตรงกับเงื่อนไข</div>
          </div>
        )}

        {!isLoading && !isError && items.map(p => (
          <div key={p.default_code} onClick={() => navigate(`/materials/${p.default_code}`)}
            className="cursor-pointer transition-colors hover:bg-chrome-50"
            style={{
              display: 'grid', gridTemplateColumns: '140px 1fr 180px 100px 120px 48px',
              alignItems: 'center', padding: '0 12px', height: 52, borderBottom: '1px solid #E0E0E0',
            }}>
            <div className="font-mono" style={{ fontSize: 13, fontWeight: 600, color: '#1F1F1F' }}>{p.default_code}</div>
            <div className="min-w-0 pr-4">
              <div className="truncate" style={{ fontSize: 13, fontWeight: 500, color: '#1F1F1F' }}>{p.name}</div>
              <div className="truncate" style={{ fontSize: 12, color: '#8E8E8E' }}>{p.description_sale}</div>
            </div>
            <div style={{ fontSize: 12, color: '#555' }}>{p.category?.name ?? `categ #${p.categ_id}`}</div>
            <div><ProductStatusPill status={toUiStatus(p.state)} /></div>
            <div style={{ fontSize: 12, color: '#8E8E8E' }}>
              <div>{new Date(p.write_date).toLocaleDateString('th-TH')}</div>
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

      {/* Pagination — always at bottom */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-chrome-100 px-6 bg-white" style={{ height: 44, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: '#8E8E8E' }}>หน้า {pageParam} / {totalPages} · {total} รายการ</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setParam('page', String(Math.max(1, pageParam - 1)))} disabled={pageParam === 1}
              className="flex items-center justify-center rounded hover:bg-chrome-50 disabled:opacity-40" style={{ width: 32, height: 32 }}>
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map(pg => (
              <button key={pg} onClick={() => setParam('page', String(pg))} className="flex items-center justify-center rounded font-mono"
                style={{ width: 32, height: 32, fontSize: 13, background: pageParam === pg ? '#C8202A' : 'transparent', color: pageParam === pg ? 'white' : '#555' }}>
                {pg}
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
        {isLoading ? 'กำลังโหลด...' : `แสดง ${items.length} จาก ${total} รายการ`}
      </div>

      {showRegister && <MaterialRegisterModal onClose={() => setShowRegister(false)} />}
    </div>
  )
}
