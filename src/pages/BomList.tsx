import { useNavigate, useSearchParams } from 'react-router-dom'
import { Upload, RefreshCw, ChevronLeft, ChevronRight, Loader2, Package } from 'lucide-react'
import { useDispatches } from '../hooks/useBomDispatches'
import { useProjectZones } from '../hooks/useProjectZones'
import { useSubZones } from '../hooks/useSubZones'
import { useActiveProject } from '../context/ProjectContext'
import type { DispatchSummaryDto, DispatchStatus } from '../api/dispatches'

const PAGE_SIZE = 20

const STATUS_LABELS: Record<DispatchStatus, string> = {
  pending: 'รอดำเนินการ',
  partial: 'บางส่วน',
  complete: 'ครบถ้วน',
}

const STATUS_COLORS: Record<DispatchStatus, { bg: string; text: string }> = {
  pending: { bg: '#FEF9C3', text: '#854D0E' },
  partial: { bg: '#FEF3C7', text: '#B45309' },
  complete: { bg: '#D1F2E0', text: '#065F46' },
}

function ProgressChip({ count }: { count: number }) {
  const full = count === 3
  return (
    <span style={{
      background: full ? '#D1F2E0' : '#FEF3C7',
      color: full ? '#065F46' : '#B45309',
      borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 600,
    }}>
      {count}/3 {full ? '✓' : '⚠'}
    </span>
  )
}

function DispatchCard({ item, onClick }: { item: DispatchSummaryDto; onClick: () => void }) {
  const colors = STATUS_COLORS[item.status]
  return (
    <div
      onClick={onClick}
      className="cursor-pointer hover:bg-chrome-50 border-b border-chrome-100"
      style={{ padding: '12px 24px' }}
    >
      <div className="flex items-center gap-3">
        <Package size={20} style={{ color: '#8E8E8E', flexShrink: 0 }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap" style={{ fontSize: 13, fontWeight: 600, color: '#1F1F1F' }}>
            <span>{item.zone.code}</span>
            {item.sub_zone && (
              <>
                <span style={{ color: '#C2C2C2', fontWeight: 400 }}>/</span>
                <span style={{ fontWeight: 500 }}>{item.sub_zone.code || item.sub_zone.name}</span>
              </>
            )}
            <span style={{ color: '#C2C2C2', fontWeight: 400 }}>·</span>
            <span style={{ fontSize: 12, fontWeight: 400, color: '#8E8E8E' }}>
              {new Date(item.uploaded_at).toLocaleDateString('th-TH')}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap" style={{ fontSize: 12, color: '#8E8E8E' }}>
            <span>{item.uploader.name}</span>
            {item.assembly_count != null && <><span>·</span><span>{item.assembly_count} assemblies</span></>}
            {item.part_count != null && <><span>·</span><span>{item.part_count} parts</span></>}
            {item.total_weight_kg != null && <><span>·</span><span>{item.total_weight_kg.toFixed(1)} kg</span></>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <ProgressChip count={item.doc_count} />
          <span style={{ ...colors, borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 500 }}>
            {STATUS_LABELS[item.status]}
          </span>
        </div>
      </div>
    </div>
  )
}

export function BomList() {
  const navigate = useNavigate()
  const { activeProject } = useActiveProject()
  const [searchParams, setSearchParams] = useSearchParams()

  const zoneFilter = searchParams.get('zone_id') || ''
  const subZoneFilter = searchParams.get('sub_zone_id') || ''
  const statusFilter = (searchParams.get('status') || '') as DispatchStatus | ''
  const pageParam = parseInt(searchParams.get('page') || '1')

  const hasProject = !!activeProject

  const { data: zonesData } = useProjectZones(activeProject?.id)
  const zones = zonesData ?? []

  const { data: subZonesData } = useSubZones(zoneFilter ? parseInt(zoneFilter) : null)
  const subZones = subZonesData ?? []

  const { data, isLoading, isError, refetch } = useDispatches(
    hasProject
      ? {
          project_id: activeProject.id,
          zone_id: zoneFilter ? parseInt(zoneFilter) : undefined,
          sub_zone_id: subZoneFilter ? parseInt(subZoneFilter) : undefined,
          status: statusFilter || undefined,
          page: pageParam,
          limit: PAGE_SIZE,
        }
      : undefined,
  )

  const items: DispatchSummaryDto[] = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = data?.pages ?? 1
  const assemblyTotal = data?.assembly_total ?? 0
  const partTotal = data?.part_total ?? 0

  const setParam = (key: string, value: string) => {
    const p = new URLSearchParams(searchParams)
    if (value) p.set(key, value)
    else p.delete(key)
    if (key !== 'page') p.set('page', '1')
    if (key === 'zone_id') p.delete('sub_zone_id')
    setSearchParams(p)
  }

  const clearFilters = () => {
    const p = new URLSearchParams()
    p.set('page', '1')
    setSearchParams(p)
  }

  const hasFilters = !!(zoneFilter || subZoneFilter || statusFilter)

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      {/* Header */}
      <div className="bg-white flex items-center justify-between border-b border-chrome-100 px-6" style={{ height: 56, flexShrink: 0 }}>
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 18, fontWeight: 600, color: '#1F1F1F' }}>BOM</span>
          {activeProject && (
            <>
              <span style={{ color: '#C2C2C2' }}>·</span>
              <span style={{ background: '#F5F5F5', border: '1px solid #E0E0E0', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 500, color: '#555' }}>
                {isLoading ? '...' : `${assemblyTotal} assembly`}
              </span>
              <span style={{ background: '#F5F5F5', border: '1px solid #E0E0E0', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 500, color: '#555' }}>
                {isLoading ? '...' : `${partTotal} part`}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="flex items-center justify-center rounded hover:bg-chrome-50"
            style={{ width: 32, height: 32, color: '#8E8E8E' }}
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => navigate('/bom/upload')}
            className="flex items-center gap-1.5 rounded-md text-white"
            style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, background: '#C8202A' }}
          >
            <Upload size={14} />Upload BOM
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 px-6 border-b border-chrome-100" style={{ height: 48, background: '#F5F5F5', flexShrink: 0 }}>
        <select
          disabled={!hasProject}
          className="border rounded-md bg-white focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ height: 32, padding: '0 8px', fontSize: 12, minWidth: 160, borderColor: zoneFilter ? '#C8202A' : '#E0E0E0' }}
          value={zoneFilter}
          onChange={e => setParam('zone_id', e.target.value)}
          title={!hasProject ? 'เลือก Project ก่อน' : undefined}
        >
          <option value="">ทุก Zone</option>
          {zones.map(z => (
            <option key={z.id} value={z.id}>{z.code} — {z.label}</option>
          ))}
        </select>

        <select
          disabled={!hasProject || !zoneFilter}
          className="border rounded-md bg-white focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ height: 32, padding: '0 8px', fontSize: 12, minWidth: 160, borderColor: subZoneFilter ? '#C8202A' : '#E0E0E0' }}
          value={subZoneFilter}
          onChange={e => setParam('sub_zone_id', e.target.value)}
          title={!zoneFilter ? 'เลือก Zone ก่อน' : undefined}
        >
          <option value="">{subZones.length === 0 && zoneFilter ? '(ไม่มี Sub-zone)' : 'ทุก Sub-zone'}</option>
          {subZones.map(sz => (
            <option key={sz.id} value={sz.id}>{sz.code ? `${sz.code} — ` : ''}{sz.name}</option>
          ))}
        </select>

        <select
          disabled={!hasProject}
          className="border rounded-md bg-white focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ height: 32, padding: '0 8px', fontSize: 12, minWidth: 120, borderColor: statusFilter ? '#C8202A' : '#E0E0E0' }}
          value={statusFilter}
          onChange={e => setParam('status', e.target.value)}
        >
          <option value="">ทุกสถานะ</option>
          {(Object.keys(STATUS_LABELS) as DispatchStatus[]).map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>

        {hasFilters && (
          <button onClick={clearFilters} className="hover:underline" style={{ fontSize: 12, color: '#0C447C' }}>
            ล้างตัวกรอง
          </button>
        )}

        {!hasProject && (
          <span style={{ fontSize: 12, color: '#8E8E8E' }}>เลือก Project ที่ header ก่อน</span>
        )}

        <span className="flex-1" />

        {hasProject && !isLoading && (
          <span style={{ fontSize: 12, color: '#8E8E8E' }}>หน้า {pageParam} / {totalPages} · {total} รายการ</span>
        )}
      </div>

      {/* Content */}
      <div className="bg-white flex-1" style={{ overflowY: 'auto', minHeight: 0 }}>
        {/* No project */}
        {!hasProject && (
          <div className="flex flex-col items-center justify-center gap-3" style={{ padding: 80, color: '#8E8E8E' }}>
            <Package size={40} style={{ opacity: 0.2 }} />
            <div style={{ fontSize: 14, fontWeight: 500 }}>เลือก Project ที่ header ก่อน</div>
            <div style={{ fontSize: 12 }}>จะแสดง BOM dispatch ของ project ที่เลือก</div>
          </div>
        )}

        {/* Loading */}
        {hasProject && isLoading && (
          <div className="flex items-center justify-center gap-2" style={{ padding: 64, color: '#8E8E8E', fontSize: 13 }}>
            <Loader2 size={20} className="animate-spin" />กำลังโหลดข้อมูล...
          </div>
        )}

        {/* Error (BE not ready) */}
        {hasProject && isError && !isLoading && (
          <div className="flex flex-col items-center justify-center gap-3" style={{ padding: 80, color: '#8E8E8E' }}>
            <Package size={40} style={{ opacity: 0.2 }} />
            <div style={{ fontSize: 14, fontWeight: 500 }}>ยังไม่มี BOM dispatch</div>
            <div style={{ fontSize: 12 }}>อัพโหลดไฟล์ BOM แรกของ project นี้</div>
            <button
              onClick={() => navigate('/bom/upload')}
              className="flex items-center gap-1.5 rounded-md text-white"
              style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, background: '#C8202A', marginTop: 8 }}
            >
              <Upload size={14} />Upload BOM แรก
            </button>
          </div>
        )}

        {/* Empty state */}
        {hasProject && !isLoading && !isError && items.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3" style={{ padding: 80, color: '#8E8E8E' }}>
            <Package size={40} style={{ opacity: 0.2 }} />
            <div style={{ fontSize: 14, fontWeight: 500 }}>ยังไม่มี BOM dispatch</div>
            <div style={{ fontSize: 12 }}>อัพโหลดไฟล์ BOM แรกของ project นี้</div>
            <button
              onClick={() => navigate('/bom/upload')}
              className="flex items-center gap-1.5 rounded-md text-white"
              style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, background: '#C8202A', marginTop: 8 }}
            >
              <Upload size={14} />Upload BOM แรก
            </button>
          </div>
        )}

        {/* Dispatch cards */}
        {hasProject && !isLoading && !isError && items.map(item => (
          <DispatchCard
            key={item.id}
            item={item}
            onClick={() => navigate(`/bom/dispatch/${item.id}`)}
          />
        ))}
      </div>

      {/* Pagination */}
      {hasProject && totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-chrome-100 px-6 bg-white" style={{ height: 44, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: '#8E8E8E' }}>หน้า {pageParam} / {totalPages} · {total} รายการ</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setParam('page', String(Math.max(1, pageParam - 1)))}
              disabled={pageParam === 1}
              className="flex items-center justify-center rounded hover:bg-chrome-50 disabled:opacity-40"
              style={{ width: 32, height: 32 }}
            >
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                onClick={() => setParam('page', String(p))}
                className="flex items-center justify-center rounded font-mono"
                style={{ width: 32, height: 32, fontSize: 13, background: pageParam === p ? '#C8202A' : 'transparent', color: pageParam === p ? 'white' : '#555' }}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setParam('page', String(Math.min(totalPages, pageParam + 1)))}
              disabled={pageParam === totalPages}
              className="flex items-center justify-center rounded hover:bg-chrome-50 disabled:opacity-40"
              style={{ width: 32, height: 32 }}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Status bar */}
      <div className="flex items-center border-t border-chrome-100 px-6 bg-chrome-50" style={{ height: 32, fontSize: 12, color: '#8E8E8E', flexShrink: 0 }}>
        {!hasProject
          ? 'ไม่มี project ที่เลือก'
          : isLoading
          ? 'กำลังโหลด...'
          : `แสดง ${items.length} จาก ${total} รายการ`}
      </div>
    </div>
  )
}
