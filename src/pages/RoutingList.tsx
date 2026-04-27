import { useNavigate } from 'react-router-dom'
import { Search, Plus, MoreHorizontal } from 'lucide-react'
import { useRoutingStore } from '../store/routingStore'
import { StatusPill } from '../components/ui/StatusPill'
import { CatBadge } from '../components/ui/CatBadge'
import { StepDots } from '../components/ui/StepDots'
import { fmtDate, fmtTime } from '../data/utils'
import type { RoutingStatus, Category } from '../types'

export function RoutingList() {
  const navigate = useNavigate()
  const {
    routings,
    filterStatus, filterCat, filterSearch,
    setFilterStatus, setFilterCat, setFilterSearch, resetFilters,
    openEditor,
  } = useRoutingStore()

  const filtered = routings.filter(r => {
    const matchStatus = filterStatus === 'all' || r.status === filterStatus
    const matchCat = filterCat === 'all' || r.category === filterCat
    const q = filterSearch.toLowerCase()
    const matchSearch = !q || r.product_code.toLowerCase().includes(q) || r.name_th.toLowerCase().includes(q)
    return matchStatus && matchCat && matchSearch
  })

  const filterActive = filterStatus !== 'all' || filterCat !== 'all' || filterSearch

  const handleRowClick = (code: string) => {
    openEditor(code)
    navigate(`/routings/${code}`)
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-56px)]">
      {/* Page Header */}
      <div className="bg-white flex items-center justify-between sticky top-14 z-40 border-b border-chrome-100 px-6" style={{ height: 56 }}>
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 18, fontWeight: 600, color: '#1F1F1F' }}>Routings</span>
          <span style={{ color: '#C2C2C2' }}>·</span>
          <span className="font-mono" style={{ fontSize: 13, color: '#8E8E8E' }}>0X123</span>
          <span style={{ background: '#F5F5F5', border: '1px solid #E0E0E0', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 500, color: '#555', marginLeft: 4 }}>
            {routings.length} รายการ
          </span>
        </div>
        <button className="flex items-center gap-1.5 rounded-md text-white" style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, background: '#C8202A' }}>
          <Plus size={14} />เพิ่ม Routing
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center sticky z-30 border-b border-chrome-100 px-6 gap-2" style={{ height: 44, top: 110, background: '#F5F5F5' }}>
        <div className="relative">
          <Search size={14} className="absolute text-chrome-400 pointer-events-none" style={{ left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            className="border border-chrome-200 rounded-md bg-white text-chrome-900 focus:outline-none focus:border-steel-600 focus:ring-2 focus:ring-steel-50"
            style={{ height: 32, padding: '0 10px 0 32px', fontSize: 13, width: 280 }}
            placeholder="ค้นหา รหัสชิ้นงาน หรือ ชื่อ..."
            value={filterSearch}
            onChange={e => setFilterSearch(e.target.value)}
          />
        </div>

        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as RoutingStatus | 'all')}
          className="border border-chrome-200 rounded-md bg-white text-chrome-900 cursor-pointer focus:outline-none focus:border-steel-600"
          style={{ height: 32, padding: '0 10px', fontSize: 13 }}
        >
          <option value="all">สถานะ — ทั้งหมด</option>
          <option value="Draft">Draft</option>
          <option value="PendingReview">รอตรวจสอบ</option>
          <option value="Active">Active</option>
          <option value="Rejected">ปฏิเสธแล้ว</option>
        </select>

        <select
          value={filterCat}
          onChange={e => setFilterCat(e.target.value as Category | 'all')}
          className="border border-chrome-200 rounded-md bg-white text-chrome-900 cursor-pointer focus:outline-none focus:border-steel-600"
          style={{ height: 32, padding: '0 10px', fontSize: 13 }}
        >
          <option value="all">หมวด — ทั้งหมด</option>
          <option value="Assembly">Assembly</option>
          <option value="SubAssembly">SubAssembly</option>
          <option value="Part">Part</option>
          <option value="Plate">Plate</option>
          <option value="Consumable">Consumable</option>
        </select>

        {filterActive && (
          <button onClick={resetFilters} className="text-steel-600 hover:underline" style={{ fontSize: 12 }}>รีเซ็ต</button>
        )}

        <span className="flex-1" />
        <span style={{ fontSize: 12, color: '#8E8E8E' }}>แสดง {filtered.length} จาก {routings.length}</span>
      </div>

      {/* Table */}
      <div className="bg-white flex-1">
        {/* Table header */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 90px 110px 130px 140px 60px', padding: '0 20px', height: 36, background: '#F5F5F5', borderBottom: '1px solid #E0E0E0', alignItems: 'center' }}>
          {['ชิ้นงาน', 'หมวด', 'ขั้นตอน', 'เวลารวม', 'สถานะ', 'วันแก้ไข', ''].map((h, i) => (
            <span key={i} style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center" style={{ padding: 48, color: '#8E8E8E', fontSize: 13 }}>ไม่พบ routing ที่ตรงกับเงื่อนไข</div>
        ) : (
          filtered.map(r => (
            <div
              key={r.product_code}
              onClick={() => handleRowClick(r.product_code)}
              className="cursor-pointer hover:bg-chrome-50 transition-colors"
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 130px 90px 110px 130px 140px 60px',
                alignItems: 'center',
                padding: '0 20px',
                height: 52,
                borderBottom: '1px solid #E0E0E0',
                background: r.status === 'Rejected' ? '#FFF8F8' : undefined,
              }}
            >
              {/* Product */}
              <div className="flex items-center gap-2 min-w-0">
                <div className="min-w-0">
                  <div className="font-mono" style={{ fontSize: 13, fontWeight: 600, color: '#1F1F1F' }}>{r.product_code}</div>
                  <div className="truncate" style={{ fontSize: 12, color: '#555', maxWidth: 260 }}>{r.name_th}</div>
                </div>
              </div>

              {/* Category */}
              <div><CatBadge category={r.category} /></div>

              {/* Steps */}
              <div>
                <div style={{ fontSize: 13, color: '#555' }}>{r.step_count} steps</div>
                <div className="mt-1"><StepDots steps={r.steps} /></div>
              </div>

              {/* Time */}
              <div>
                <div className="font-mono" style={{ fontSize: 13, fontWeight: 500, color: '#3A3A3A' }}>{r.total_time_min} นาที</div>
                <div style={{ fontSize: 11, color: '#8E8E8E' }}>({fmtTime(r.total_time_min)})</div>
              </div>

              {/* Status */}
              <div>
                <StatusPill status={r.status} />
                {r.status === 'Rejected' && r.reject_reason && (
                  <div style={{ fontSize: 10, color: '#8A1520', marginTop: 2 }}>{r.reject_reason}</div>
                )}
              </div>

              {/* Date */}
              <div style={{ fontSize: 12, color: '#555' }}>{fmtDate(r.updated_at)}</div>

              {/* More */}
              <div className="flex items-center justify-center">
                <button
                  className="flex items-center justify-center rounded hover:bg-chrome-50"
                  style={{ width: 28, height: 28, color: '#8E8E8E' }}
                  onClick={e => e.stopPropagation()}
                >
                  <MoreHorizontal size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Status bar */}
      <div className="sticky flex items-center border-t border-chrome-100 px-6 bg-chrome-50" style={{ bottom: 0, height: 32, fontSize: 12, color: '#8E8E8E', zIndex: 30 }}>
        แสดง {filtered.length} routing · 0X123 — อาคารโรงงาน A3
      </div>
    </div>
  )
}
