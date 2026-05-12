import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Upload, RefreshCw, Loader2, Package, ExternalLink } from 'lucide-react'
import { useDispatches, useDispatchDetail } from '../hooks/useBomDispatches'
import { useProjectZones } from '../hooks/useProjectZones'
import { useSubZones } from '../hooks/useSubZones'
import { useActiveProject } from '../context/ProjectContext'
import { ProgressChip } from '../components/bom/ProgressChip'
import { BomTreeView } from '../components/bom/BomTreeView'
import type { DispatchSummaryDto, DispatchStatus } from '../api/dispatches'

const PAGE_SIZE = 50

const STATUS_LABELS: Record<DispatchStatus, string> = {
  pending: 'รอ',
  partial: 'บางส่วน',
  complete: 'ครบ',
}

const STATUS_COLORS: Record<DispatchStatus, { background: string; color: string }> = {
  pending: { background: '#FEF9C3', color: '#854D0E' },
  partial: { background: '#FEF3C7', color: '#B45309' },
  complete: { background: '#D1F2E0', color: '#065F46' },
}

// ── Compact dispatch item in the left sidebar ─────────────────
function DispatchItem({
  item, selected, onSelect,
}: {
  item: DispatchSummaryDto
  selected: boolean
  onSelect: () => void
}) {
  return (
    <div
      onClick={onSelect}
      style={{
        padding: '10px 12px',
        borderBottom: '1px solid #F0F0F0',
        background: selected ? '#EEF4FF' : 'white',
        borderLeft: selected ? '3px solid #185FA5' : '3px solid transparent',
        cursor: 'pointer',
        transition: 'background 100ms',
      }}
    >
      <div className="flex items-center gap-1.5 flex-wrap" style={{ fontSize: 12, fontWeight: 600, color: selected ? '#185FA5' : '#1F1F1F' }}>
        <span>{item.zone.code}</span>
        {item.sub_zone && (
          <>
            <span style={{ color: '#C2C2C2', fontWeight: 400 }}>/</span>
            <span style={{ fontWeight: 500 }}>{item.sub_zone.code || item.sub_zone.name}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-2 mt-1" style={{ fontSize: 11, color: '#8E8E8E' }}>
        <span>{new Date(item.uploaded_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}</span>
        <span style={{ ...STATUS_COLORS[item.status], borderRadius: 999, padding: '1px 6px', fontWeight: 500, fontSize: 10 }}>
          {STATUS_LABELS[item.status]}
        </span>
        <ProgressChip count={item.doc_count} />
      </div>
      {(item.assembly_count != null || item.part_count != null) && (
        <div style={{ fontSize: 10, color: '#8E8E8E', marginTop: 2 }}>
          {item.assembly_count ?? 0} asm · {item.part_count ?? 0} parts
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────
export function BomList() {
  const navigate = useNavigate()
  const { activeProject } = useActiveProject()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const zoneFilter = searchParams.get('zone_id') || ''
  const subZoneFilter = searchParams.get('sub_zone_id') || ''

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
          page: 1,
          limit: PAGE_SIZE,
        }
      : undefined,
  )

  const items: DispatchSummaryDto[] = data?.items ?? []

  // Auto-select latest dispatch when list loads
  useEffect(() => {
    if (items.length > 0 && selectedId === null) {
      setSelectedId(items[0].id)
    }
  }, [items, selectedId])

  // Reset selection when project/zone changes
  useEffect(() => {
    setSelectedId(null)
  }, [activeProject?.id, zoneFilter, subZoneFilter])

  const { data: detail, isLoading: detailLoading } = useDispatchDetail(selectedId ?? undefined)

  const setParam = (key: string, value: string) => {
    const p = new URLSearchParams(searchParams)
    if (value) p.set(key, value)
    else p.delete(key)
    if (key === 'zone_id') p.delete('sub_zone_id')
    setSearchParams(p)
  }

  const selectedItem = items.find(i => i.id === selectedId)

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)', overflow: 'hidden' }}>

      {/* ── Header ────────────────────────────────────────────── */}
      <div className="bg-white flex items-center justify-between border-b border-chrome-100 px-6" style={{ height: 56, flexShrink: 0 }}>
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 18, fontWeight: 600, color: '#1F1F1F' }}>BOM</span>
          {detail && (
            <>
              <span style={{ color: '#C2C2C2' }}>·</span>
              <span style={{ background: '#F5F5F5', border: '1px solid #E0E0E0', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 500, color: '#555' }}>
                {detail.assembly_count ?? detail.assemblies?.length ?? 0} assembly
              </span>
              <span style={{ background: '#F5F5F5', border: '1px solid #E0E0E0', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 500, color: '#555' }}>
                {detail.part_count ?? 0} part
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

      {/* ── Filter bar ────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 border-b border-chrome-100" style={{ height: 44, background: '#F5F5F5', flexShrink: 0 }}>
        <select
          disabled={!hasProject}
          className="border rounded-md bg-white focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ height: 30, padding: '0 8px', fontSize: 12, minWidth: 150, borderColor: zoneFilter ? '#C8202A' : '#E0E0E0' }}
          value={zoneFilter}
          onChange={e => setParam('zone_id', e.target.value)}
        >
          <option value="">ทุก Zone</option>
          {zones.map(z => <option key={z.id} value={z.id}>{z.code} — {z.label}</option>)}
        </select>

        <select
          disabled={!hasProject || !zoneFilter}
          className="border rounded-md bg-white focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ height: 30, padding: '0 8px', fontSize: 12, minWidth: 150, borderColor: subZoneFilter ? '#C8202A' : '#E0E0E0' }}
          value={subZoneFilter}
          onChange={e => setParam('sub_zone_id', e.target.value)}
        >
          <option value="">{subZones.length === 0 && zoneFilter ? '(ไม่มี Sub-zone)' : 'ทุก Sub-zone'}</option>
          {subZones.map(sz => <option key={sz.id} value={sz.id}>{sz.code ? `${sz.code} — ` : ''}{sz.name}</option>)}
        </select>

        {!hasProject && <span style={{ fontSize: 12, color: '#8E8E8E' }}>เลือก Project ที่ header ก่อน</span>}
        <span className="flex-1" />
        {hasProject && !isLoading && (
          <span style={{ fontSize: 11, color: '#8E8E8E' }}>{items.length} dispatches</span>
        )}
      </div>

      {/* ── Body: no project / loading / split panel ──────────── */}
      {!hasProject ? (
        <div className="flex flex-col items-center justify-center gap-3 flex-1" style={{ color: '#8E8E8E' }}>
          <Package size={40} style={{ opacity: 0.2 }} />
          <div style={{ fontSize: 14, fontWeight: 500 }}>เลือก Project ที่ header ก่อน</div>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center gap-2 flex-1" style={{ color: '#8E8E8E', fontSize: 13 }}>
          <Loader2 size={20} className="animate-spin" />กำลังโหลด...
        </div>
      ) : isError || items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 flex-1" style={{ color: '#8E8E8E' }}>
          <Package size={40} style={{ opacity: 0.2 }} />
          <div style={{ fontSize: 14, fontWeight: 500 }}>ยังไม่มี BOM dispatch</div>
          <button
            onClick={() => navigate('/bom/upload')}
            className="flex items-center gap-1.5 rounded-md text-white"
            style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, background: '#C8202A', marginTop: 8 }}
          >
            <Upload size={14} />Upload BOM แรก
          </button>
        </div>
      ) : (
        <div className="flex flex-1" style={{ overflow: 'hidden', minHeight: 0 }}>

          {/* Left sidebar — dispatch list */}
          <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid #E0E0E0', overflowY: 'auto', background: 'white' }}>
            <div style={{ padding: '8px 12px 4px', fontSize: 10, fontWeight: 700, color: '#8E8E8E', letterSpacing: '0.05em', borderBottom: '1px solid #F0F0F0' }}>
              DISPATCH HISTORY
            </div>
            {items.map(item => (
              <DispatchItem
                key={item.id}
                item={item}
                selected={item.id === selectedId}
                onSelect={() => setSelectedId(item.id)}
              />
            ))}
          </div>

          {/* Right panel — tree view */}
          <div className="flex flex-col flex-1" style={{ overflow: 'hidden', minWidth: 0 }}>

            {/* Tree header */}
            {selectedItem && (
              <div className="flex items-center gap-3 px-4 border-b border-chrome-100 bg-white" style={{ height: 40, flexShrink: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#1F1F1F' }}>
                  {selectedItem.zone.code}
                  {selectedItem.sub_zone && <span style={{ color: '#8E8E8E', fontWeight: 400 }}> / {selectedItem.sub_zone.code || selectedItem.sub_zone.name}</span>}
                </span>
                <span style={{ fontSize: 11, color: '#8E8E8E' }}>
                  {new Date(selectedItem.uploaded_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
                <span style={{ flex: 1 }} />
                <button
                  onClick={() => navigate(`/bom/dispatch/${selectedItem.id}`)}
                  className="flex items-center gap-1 hover:underline"
                  style={{ fontSize: 11, color: '#185FA5' }}
                >
                  <ExternalLink size={11} />ดู detail
                </button>
              </div>
            )}

            {/* Tree content */}
            {detailLoading ? (
              <div className="flex items-center justify-center gap-2 flex-1" style={{ color: '#8E8E8E', fontSize: 13 }}>
                <Loader2 size={18} className="animate-spin" />กำลังโหลด tree...
              </div>
            ) : (
              <BomTreeView
                assemblies={detail?.assemblies ?? []}
                assemblyCount={detail?.assembly_count ?? null}
                partCount={detail?.part_count ?? null}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
