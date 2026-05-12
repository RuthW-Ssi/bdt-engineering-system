import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Upload, RefreshCw, Loader2, Package, RefreshCcw } from 'lucide-react'
import { useDispatches, useDispatchDetail } from '../hooks/useBomDispatches'
import { useProjectZones } from '../hooks/useProjectZones'
import { useSubZones } from '../hooks/useSubZones'
import { useActiveProject } from '../context/ProjectContext'
import { BomTreeView } from '../components/bom/BomTreeView'
import { UpdateBomModal } from '../components/bom/UpdateBomModal'
import type { DispatchSummaryDto } from '../api/dispatches'

const PAGE_SIZE = 50

const TIMELINE_PRE = 16 // height of the segment above each dot — must equal content paddingTop
const LINE_COLOR = '#D0DFF0'

// ── Single version node — DBeaver-style timeline ──────────────
function VersionNode({
  item, version, isFirst, isLatest, isLast, selected, onSelect,
}: {
  item: DispatchSummaryDto
  version: number
  isFirst: boolean
  isLatest: boolean
  isLast: boolean
  selected: boolean
  onSelect?: () => void
}) {
  return (
    <div
      onClick={isLatest ? onSelect : undefined}
      style={{
        display: 'flex',
        background: selected ? '#F0F6FF' : 'transparent',
        cursor: isLatest ? 'pointer' : 'default',
        transition: 'background 120ms',
      }}
    >
      {/* Timeline track */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        width: 44, flexShrink: 0,
      }}>
        {/* Pre-dot segment: connects this dot to the previous node's post-line */}
        <div style={{
          width: 2, height: TIMELINE_PRE, flexShrink: 0,
          background: isFirst ? 'transparent' : LINE_COLOR,
        }} />

        {/* Dot */}
        <div style={{
          width: 14, height: 14, borderRadius: 999, flexShrink: 0,
          background: selected ? '#185FA5' : 'white',
          border: `2px solid ${selected || isLatest ? '#185FA5' : '#C5D5E8'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {selected && <div style={{ width: 5, height: 5, borderRadius: 999, background: 'white' }} />}
        </div>

        {/* Post-dot segment: extends to bottom of row, connects to next node's pre-line */}
        {!isLast && (
          <div style={{ width: 2, flex: 1, background: LINE_COLOR }} />
        )}
      </div>

      {/* Content — paddingTop must equal TIMELINE_PRE so dot aligns with version label */}
      <div style={{
        flex: 1, minWidth: 0,
        paddingTop: TIMELINE_PRE, paddingBottom: isLast ? 14 : 10, paddingRight: 12,
        opacity: isLatest ? 1 : 0.55,
      }}>
        <div style={{
          fontSize: 13, fontWeight: 700, marginBottom: 5,
          color: selected ? '#185FA5' : isLatest ? '#1F1F1F' : '#555',
        }}>
          v{version}
        </div>

        <div style={{ fontSize: 11, color: '#888', marginBottom: 5 }}>
          {item.assembly_count ?? 0} asm · {item.part_count ?? 0} parts
        </div>

        <div style={{ fontSize: 10, color: '#999', fontStyle: 'italic', lineHeight: 1.4 }}>
          <span style={{ color: '#777', fontStyle: 'normal', fontWeight: 500 }}>{item.uploader.name}</span>
          {' '}
          <span>updated on </span>
          <span>{new Date(item.uploaded_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        </div>
      </div>
    </div>
  )
}

// ── Group of versions for one zone+subzone ─────────────────────
function DispatchGroup({
  group, latestIdSet, versionMap, selectedId, onSelect,
}: {
  group: DispatchSummaryDto[]
  latestIdSet: Set<number>
  versionMap: Map<number, number>
  selectedId: number | null
  onSelect: (id: number) => void
}) {
  const first = group[0]
  return (
    <div style={{ borderBottom: '1px solid #EEF0F3' }}>
      {/* Zone header */}
      <div style={{
        padding: '8px 12px 6px 12px',
        background: '#F7F8FA',
        borderBottom: '1px solid #EAECEF',
        display: 'flex', alignItems: 'center', gap: 4,
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#222', letterSpacing: '0.01em' }}>
          {first.zone.code}
        </span>
        {first.sub_zone && (
          <>
            <span style={{ color: '#C0C0C0', fontSize: 11 }}>/</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#555' }}>
              {first.sub_zone.code || first.sub_zone.name}
            </span>
          </>
        )}
        {group.length > 1 && (
          <span style={{
            marginLeft: 'auto', fontSize: 9, fontWeight: 600,
            color: '#888', background: '#E6E8EC',
            borderRadius: 99, padding: '1px 7px',
          }}>{group.length} rev</span>
        )}
      </div>

      {/* Version nodes */}
      {group.map((item, idx) => (
        <VersionNode
          key={item.id}
          item={item}
          version={versionMap.get(item.id) ?? 1}
          isFirst={idx === 0}
          isLatest={latestIdSet.has(item.id)}
          isLast={idx === group.length - 1}
          selected={item.id === selectedId}
          onSelect={() => onSelect(item.id)}
        />
      ))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────
export function BomList() {
  const navigate = useNavigate()
  const { activeProject } = useActiveProject()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showModal, setShowModal] = useState(false)

  const zoneFilter = searchParams.get('zone_id') || ''
  const subZoneFilter = searchParams.get('sub_zone_id') || ''

  // Clear sub_zone_id once on mount (stale from previous visit)
  useEffect(() => {
    setSearchParams(prev => {
      const p = new URLSearchParams(prev)
      p.delete('sub_zone_id')
      return p
    }, { replace: true })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Strict match: zone-only → sub_zone_id must be NULL; both → exact match
  const allItems: DispatchSummaryDto[] = useMemo(() => {
    return (data?.items ?? []).filter(item =>
      zoneFilter && !subZoneFilter ? item.sub_zone_id === null : true
    )
  }, [data?.items, zoneFilter, subZoneFilter])

  // Per zone+subzone group: latest IDs, version numbers, and grouped array for rendering
  const { latestIdSet, versionMap, groupedItems } = useMemo(() => {
    const groups = new Map<string, DispatchSummaryDto[]>()
    for (const item of allItems) {
      const key = `${item.zone_id}-${item.sub_zone_id ?? ''}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(item)
    }
    const latestIdSet = new Set<number>()
    const versionMap = new Map<number, number>()
    const groupedItems: DispatchSummaryDto[][] = []
    for (const group of groups.values()) {
      // API returns desc order → reverse gives oldest-first for version numbering
      const asc = [...group].reverse()
      asc.forEach((item, i) => versionMap.set(item.id, i + 1))
      latestIdSet.add(group[0].id)
      groupedItems.push(group)
    }
    return { latestIdSet, versionMap, groupedItems }
  }, [allItems])

  // Always select the latest dispatch whenever the filtered list changes
  const latestId = allItems[0]?.id ?? null
  useEffect(() => {
    setSelectedId(latestId)
  }, [latestId])

  const { data: detail, isLoading: detailLoading } = useDispatchDetail(selectedId ?? undefined)

  const setParam = (key: string, value: string) => {
    const p = new URLSearchParams(searchParams)
    if (value) p.set(key, value)
    else p.delete(key)
    if (key === 'zone_id') p.delete('sub_zone_id')
    setSearchParams(p)
  }

  const selectedItem = allItems.find(i => i.id === selectedId)

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
          {allItems.length > 0 && selectedId ? (
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 rounded-md text-white"
              style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, background: '#185FA5' }}
            >
              <RefreshCcw size={14} />Update BOM
            </button>
          ) : (
            <button
              onClick={() => navigate('/bom/upload')}
              className="flex items-center gap-1.5 rounded-md text-white"
              style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, background: '#C8202A' }}
            >
              <Upload size={14} />Upload BOM
            </button>
          )}
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
          <span style={{ fontSize: 11, color: '#8E8E8E' }}>{allItems.length} dispatches</span>
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
      ) : isError || allItems.length === 0 ? (
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

          {/* Left panel — tree view */}
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
                orphanParts={detail?.orphan_parts}
              />
            )}
          </div>

          {/* Right sidebar — dispatch list */}
          <div style={{ width: 240, flexShrink: 0, borderLeft: '1px solid #E0E0E0', overflowY: 'auto', background: 'white' }}>
            <div style={{ padding: '8px 12px 4px', fontSize: 10, fontWeight: 700, color: '#8E8E8E', letterSpacing: '0.05em', borderBottom: '1px solid #F0F0F0' }}>
              DISPATCH HISTORY
            </div>
            {groupedItems.map(group => (
              <DispatchGroup
                key={`${group[0].zone_id}-${group[0].sub_zone_id ?? ''}`}
                group={group}
                latestIdSet={latestIdSet}
                versionMap={versionMap}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            ))}
          </div>
        </div>
      )}

      {showModal && selectedItem && (
        <UpdateBomModal
          dispatchId={selectedItem.id}
          projectId={selectedItem.project_id}
          zoneId={selectedItem.zone_id}
          subZoneId={selectedItem.sub_zone_id}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}
