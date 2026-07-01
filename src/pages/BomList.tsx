import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { Upload, RefreshCw, Loader2, Package, RefreshCcw, ArrowUpRight, Search, X, Layers } from 'lucide-react'
import { useDispatches, useDispatchDetail } from '../hooks/useBomDispatches'
import { usePaintConfig } from '../hooks/usePaint'
import type { PaintConfigResponseDto } from '../api/paint'
import { useProjectZones } from '../hooks/useProjectZones'
import { useSubZones } from '../hooks/useSubZones'
import { useActiveProject } from '../context/ProjectContext'
import { BomTreeView } from '../components/bom/BomTreeView'
import { UpdateBomModal } from '../components/bom/UpdateBomModal'
import type { DispatchSummaryDto, AssemblyDto, AssemblyPartDto } from '../api/dispatches'

type ContentTab = 'tree' | 'assemblies' | 'parts' | 'paint'

const CONTENT_TABS: { id: ContentTab; label: string }[] = [
  { id: 'tree',       label: 'Tree' },
  { id: 'assemblies', label: 'Assemblies' },
  { id: 'parts',      label: 'Parts' },
  { id: 'paint',      label: 'Paint' },
]

// ── Paint tab ─────────────────────────────────────────────────
function PaintChip({ label, name }: { label: string; name: string | null | undefined }) {
  const hasValue = name != null && name !== ''
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 10, fontWeight: 500, flexShrink: 0,
      maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    }}>
      <span style={{ color: '#888', fontWeight: 400 }}>{label}</span>
      <span style={{ color: hasValue ? '#1F1F1F' : '#BDBDBD' }}>{hasValue ? name : 'None'}</span>
    </span>
  )
}

function PaintTab({
  dispatchId,
  paintConfig,
  isLoading,
  onEdit,
}: {
  dispatchId: number | null
  paintConfig: PaintConfigResponseDto | undefined
  isLoading: boolean
  onEdit: () => void
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 flex-1" style={{ color: '#8E8E8E', fontSize: 13 }}>
        <Loader2 size={16} className="animate-spin" />Loading...
      </div>
    )
  }

  const assemblies = paintConfig?.assemblies ?? []
  const doneCount = assemblies.filter(a => a.configs.some(c => c.paint_type === 'topcoat' && c.material_id != null)).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid #F0F0F0', flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: '#8E8E8E' }}>
          <strong style={{ color: '#1A1A1A' }}>{doneCount}</strong>/{assemblies.length} assemblies have paint
        </span>
        <button
          onClick={onEdit}
          disabled={!dispatchId}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '5px 12px', borderRadius: 6,
            border: '1px solid #C8202A', background: '#fff', color: '#C8202A',
            fontSize: 11, fontWeight: 600, cursor: dispatchId ? 'pointer' : 'not-allowed',
            opacity: dispatchId ? 1 : 0.4,
          }}
        >
          <ArrowUpRight size={12} />Config
        </button>
      </div>

      {/* List */}
      {assemblies.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#8E8E8E', fontSize: 13 }}>
          Paint not configured
        </div>
      ) : (
        <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, padding: '6px 10px' }}>
          {assemblies.map(asm => {
            const primer = asm.configs.find(c => c.paint_type === 'primer')
            const intermediate = asm.configs.find(c => c.paint_type === 'intermediate')
            const fireproof = asm.configs.find(c => c.paint_type === 'fireproof')
            const topcoat = asm.configs.find(c => c.paint_type === 'topcoat')
            return (
              <div
                key={asm.assembly_id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 10px',
                  border: '1px solid #C2C2C2',
                  borderRadius: 6,
                  marginBottom: 2,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  background: '#fff',
                }}
              >
                {/* Layers icon circle */}
                <span style={{
                  width: 20, height: 20, borderRadius: '50%',
                  background: '#E8F1FD', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Layers size={11} color="#185FA5" />
                </span>

                {/* Assembly mark */}
                <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'monospace', color: '#1F1F1F', flexShrink: 0 }}>
                  {asm.assembly_mark}
                </span>

                {/* Spacer */}
                <span style={{ flex: 1 }} />

                {/* Paint chips */}
                <PaintChip label="P" name={primer?.material_name} />
                <PaintChip label="I" name={intermediate?.material_name} />
                <PaintChip label="F" name={fireproof?.material_name} />
                <PaintChip label="T" name={topcoat?.material_name} />

                {/* Qty */}
                <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#8E8E8E', flexShrink: 0 }}>
                  ×{asm.assembly_qty}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Assemblies flat table ──────────────────────────────────────
function AssembliesTable({ assemblies }: { assemblies: AssemblyDto[] }) {
  const TH: React.CSSProperties = {
    position: 'sticky', top: 0, background: '#F5F5F5', zIndex: 2,
    padding: '6px 10px', fontSize: 10, fontWeight: 600, color: '#555',
    textAlign: 'left', borderBottom: '2px solid #D0D0D0', whiteSpace: 'nowrap',
  }
  const TD: React.CSSProperties = { padding: '5px 10px', fontSize: 12, borderBottom: '1px solid #F0F0F0' }

  if (!assemblies.length) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#8E8E8E', fontSize: 13 }}>No assemblies</div>
  )

  return (
    <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
        <thead>
          <tr>
            <th style={TH}>#</th>
            <th style={TH}>Mark</th>
            <th style={TH}>Name</th>
            <th style={{ ...TH, textAlign: 'right' }}>Qty</th>
            <th style={{ ...TH, textAlign: 'right' }}>Area (m²)</th>
            <th style={{ ...TH, textAlign: 'right' }}>L (mm)</th>
            <th style={{ ...TH, textAlign: 'right' }}>W (mm)</th>
            <th style={{ ...TH, textAlign: 'right' }}>H (mm)</th>
            <th style={{ ...TH, textAlign: 'right' }}>Weight (kg)</th>
            <th style={{ ...TH, textAlign: 'right' }}>Parts</th>
            <th style={TH}>Status</th>
            <th style={TH}>Product</th>
          </tr>
        </thead>
        <tbody>
          {assemblies.map((asm, i) => (
            <tr key={asm.id} style={{ background: i % 2 === 0 ? '#fff' : '#F9FAFB' }}>
              <td style={{ ...TD, color: '#AAA', width: 32 }}>{i + 1}</td>
              <td style={{ ...TD, fontWeight: 600, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{asm.assembly_mark}</td>
              <td style={{ ...TD, color: '#555', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asm.name ?? '—'}</td>
              <td style={{ ...TD, textAlign: 'right', fontWeight: 500 }}>×{asm.assembly_qty}</td>
              <td style={{ ...TD, textAlign: 'right', color: '#555' }}>{asm.surface_area_m2 != null ? asm.surface_area_m2.toFixed(2) : '—'}</td>
              <td style={{ ...TD, textAlign: 'right', color: '#555' }}>{asm.length_mm ?? '—'}</td>
              <td style={{ ...TD, textAlign: 'right', color: '#555' }}>{asm.width_mm ?? '—'}</td>
              <td style={{ ...TD, textAlign: 'right', color: '#555' }}>{asm.height_mm ?? '—'}</td>
              <td style={{ ...TD, textAlign: 'right', color: '#555' }}>{asm.total_weight_kg != null ? asm.total_weight_kg.toFixed(1) : '—'}</td>
              <td style={{ ...TD, textAlign: 'right', color: '#185FA5' }}>{asm.parts.length}</td>
              <td style={TD}>
              </td>
              <td style={{ ...TD, fontSize: 10, color: '#27500A', fontWeight: 600 }}>{asm.product?.product_code ?? '—'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ background: '#F5F5F5', borderTop: '2px solid #D0D0D0' }}>
            <td colSpan={3} style={{ ...TD, fontWeight: 600, color: '#555' }}>Total ({assemblies.length})</td>
            <td style={{ ...TD, textAlign: 'right', fontWeight: 600 }}>
              {assemblies.reduce((s, a) => s + a.assembly_qty, 0)}
            </td>
            <td style={{ ...TD, textAlign: 'right', fontWeight: 600 }}>
              {assemblies.every(a => a.surface_area_m2 == null) ? '—'
                : assemblies.reduce((s, a) => s + (a.surface_area_m2 ?? 0) * a.assembly_qty, 0).toFixed(2)}
            </td>
            <td colSpan={3} style={{ ...TD, textAlign: 'center', color: '#CCC', fontSize: 10 }}>L / W / H</td>
            <td style={{ ...TD, textAlign: 'right', fontWeight: 600 }}>
              {assemblies.every(a => a.total_weight_kg == null) ? '—'
                : assemblies.reduce((s, a) => s + (a.total_weight_kg ?? 0) * a.assembly_qty, 0).toFixed(1)}
            </td>
            <td colSpan={3} />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ── Parts flat table (aggregated across assemblies) ────────────
interface AggregatedPart {
  part_mark: string
  profile: string | null
  grade: string | null
  length_mm: number | null
  unit_weight_kg: number | null
  match_status: string | null
  total_qty: number
}

function aggregateParts(assemblies: AssemblyDto[], orphanParts: AssemblyPartDto[]): AggregatedPart[] {
  const map = new Map<string, AggregatedPart>()
  const add = (p: AssemblyPartDto, qty: number) => {
    const existing = map.get(p.part_mark)
    if (existing) {
      existing.total_qty += qty
    } else {
      map.set(p.part_mark, {
        part_mark: p.part_mark,
        profile: p.profile,
        grade: p.grade,
        length_mm: p.length_mm,
        unit_weight_kg: p.unit_weight_kg,
        match_status: p.match_status,
        total_qty: qty,
      })
    }
  }
  for (const asm of assemblies)
    for (const p of asm.parts) add(p, p.part_qty * asm.assembly_qty)
  for (const p of orphanParts) add(p, p.part_qty)
  return [...map.values()].sort((a, b) => a.part_mark.localeCompare(b.part_mark))
}

function PartsTable({ assemblies, orphanParts }: { assemblies: AssemblyDto[]; orphanParts: AssemblyPartDto[] }) {
  const parts = useMemo(() => aggregateParts(assemblies, orphanParts), [assemblies, orphanParts])

  const TH: React.CSSProperties = {
    position: 'sticky', top: 0, background: '#F5F5F5', zIndex: 2,
    padding: '6px 10px', fontSize: 10, fontWeight: 600, color: '#555',
    textAlign: 'left', borderBottom: '2px solid #D0D0D0', whiteSpace: 'nowrap',
  }
  const TD: React.CSSProperties = { padding: '5px 10px', fontSize: 12, borderBottom: '1px solid #F0F0F0' }

  if (!parts.length) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#8E8E8E', fontSize: 13 }}>No parts</div>
  )

  const totalWeight = parts.every(p => p.unit_weight_kg == null) ? null
    : parts.reduce((s, p) => s + (p.unit_weight_kg ?? 0) * p.total_qty, 0)

  return (
    <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
        <thead>
          <tr>
            <th style={TH}>#</th>
            <th style={TH}>Mark</th>
            <th style={TH}>Profile</th>
            <th style={TH}>Grade</th>
            <th style={{ ...TH, textAlign: 'right' }}>Length (mm)</th>
            <th style={{ ...TH, textAlign: 'right' }}>Total Qty</th>
            <th style={{ ...TH, textAlign: 'right' }}>Unit Wt (kg)</th>
            <th style={{ ...TH, textAlign: 'right' }}>Total Wt (kg)</th>
            <th style={TH}>Status</th>
          </tr>
        </thead>
        <tbody>
          {parts.map((p, i) => (
            <tr key={p.part_mark} style={{ background: i % 2 === 0 ? '#fff' : '#F9FAFB' }}>
              <td style={{ ...TD, color: '#AAA', width: 32 }}>{i + 1}</td>
              <td style={{ ...TD, fontWeight: 600, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{p.part_mark}</td>
              <td style={{ ...TD, fontFamily: 'monospace', fontSize: 11 }}>{p.profile ?? '—'}</td>
              <td style={{ ...TD, fontSize: 11, color: '#B45309' }}>{p.grade ?? '—'}</td>
              <td style={{ ...TD, textAlign: 'right' }}>{p.length_mm ?? '—'}</td>
              <td style={{ ...TD, textAlign: 'right', fontWeight: 600 }}>{p.total_qty}</td>
              <td style={{ ...TD, textAlign: 'right', color: '#555' }}>{p.unit_weight_kg != null ? p.unit_weight_kg.toFixed(3) : '—'}</td>
              <td style={{ ...TD, textAlign: 'right', fontWeight: 500 }}>
                {p.unit_weight_kg != null ? (p.unit_weight_kg * p.total_qty).toFixed(1) : '—'}
              </td>
              <td style={TD}>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ background: '#F5F5F5', borderTop: '2px solid #D0D0D0' }}>
            <td colSpan={6} style={{ ...TD, fontWeight: 600, color: '#555' }}>Total ({parts.length} unique)</td>
            <td style={{ ...TD, textAlign: 'right', fontWeight: 600 }}>{parts.reduce((s, p) => s + p.total_qty, 0)}</td>
            <td style={TD} />
            <td style={{ ...TD, textAlign: 'right', fontWeight: 600 }}>{totalWeight != null ? totalWeight.toFixed(1) : '—'}</td>
            <td style={TD} />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

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
          <span>{new Date(item.uploaded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        </div>
      </div>
    </div>
  )
}

// ── Group of versions for one zone+subzone ─────────────────────
function DispatchGroup({
  group, latestIdSet, versionMap, selectedId, onSelect, onOpen,
}: {
  group: DispatchSummaryDto[]
  latestIdSet: Set<number>
  versionMap: Map<number, number>
  selectedId: number | null
  onSelect: (id: number) => void
  onOpen: (id: number) => void
}) {
  const first = group[0]
  const latestId = group[0].id
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
        <button
          onClick={() => onOpen(latestId)}
          title="Open Dispatch Detail"
          style={{
            marginLeft: group.length > 1 ? 4 : 'auto',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 20, height: 20, borderRadius: 4,
            border: 'none', background: 'none',
            color: '#8E8E8E', cursor: 'pointer', flexShrink: 0,
            padding: 0,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#E6E8EC'; (e.currentTarget as HTMLElement).style.color = '#185FA5' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = '#8E8E8E' }}
        >
          <ArrowUpRight size={12} />
        </button>
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
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const pendingTabRef = useRef<ContentTab | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [nameFilter, setNameFilter] = useState('')

  const zoneFilter = searchParams.get('zone_id') || ''
  const subZoneFilter = searchParams.get('sub_zone_id') || ''

  // Clear zone + sub_zone when project changes (or on mount)
  useEffect(() => {
    setSearchParams(prev => {
      const p = new URLSearchParams(prev)
      p.delete('zone_id')
      p.delete('sub_zone_id')
      return p
    }, { replace: true })
    setSelectedId(null)
  }, [activeProject?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasProject = !!activeProject

  const { data: zonesData } = useProjectZones(activeProject?.id)
  const zones = zonesData ?? []

  // Auto-select first zone when zones load and none is selected
  useEffect(() => {
    if (zones.length > 0 && !zoneFilter) {
      setSearchParams(prev => {
        const p = new URLSearchParams(prev)
        p.set('zone_id', String(zones[0].id))
        return p
      }, { replace: true })
    }
  }, [zones]) // eslint-disable-line react-hooks/exhaustive-deps

  const { data: subZonesData } = useSubZones(zoneFilter ? parseInt(zoneFilter) : null)
  const subZones = subZonesData ?? []

  // Auto-select first sub-zone when sub-zones load and none is selected
  useEffect(() => {
    if (subZones.length > 0 && zoneFilter && !subZoneFilter) {
      setSearchParams(prev => {
        const p = new URLSearchParams(prev)
        p.set('sub_zone_id', String(subZones[0].id))
        return p
      }, { replace: true })
    }
  }, [subZones]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const allItems: DispatchSummaryDto[] = useMemo(() => data?.items ?? [], [data?.items])

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

  const [contentTab, setContentTab] = useState<ContentTab>('tree')

  // On mount: restore dispatch + tab if returning from paint config
  useEffect(() => {
    const state = location.state as { selectDispatch?: number; tab?: ContentTab } | null
    if (state?.selectDispatch) {
      pendingTabRef.current = state.tab ?? 'tree'
      setSelectedId(state.selectDispatch)
      window.history.replaceState({}, '')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset to tree tab when dispatch changes, unless we have a pending tab override
  useEffect(() => {
    if (pendingTabRef.current) {
      setContentTab(pendingTabRef.current)
      pendingTabRef.current = null
    } else {
      setContentTab('tree')
    }
  }, [selectedId])

  const { data: detail, isLoading: detailLoading } = useDispatchDetail(selectedId ?? undefined)
  const { data: paintConfig, isLoading: paintLoading } = usePaintConfig(selectedId ?? undefined)

  const term = nameFilter.trim().toLowerCase()

  const filteredAssemblies = useMemo(() => {
    const all = detail?.assemblies ?? []
    if (!term) return all
    return all
      .filter(asm =>
        asm.assembly_mark.toLowerCase().includes(term) ||
        (asm.name ?? '').toLowerCase().includes(term) ||
        asm.parts.some(p => p.part_mark.toLowerCase().includes(term))
      )
      .map(asm => {
        const partMatch = asm.assembly_mark.toLowerCase().includes(term) || (asm.name ?? '').toLowerCase().includes(term)
        if (partMatch) return asm
        return {
          ...asm,
          parts: asm.parts.filter(p => p.part_mark.toLowerCase().includes(term)),
        }
      })
  }, [detail?.assemblies, term])

  const filteredOrphanParts = useMemo(() => {
    const all = detail?.orphan_parts ?? []
    if (!term) return all
    return all.filter(p => p.part_mark.toLowerCase().includes(term))
  }, [detail?.orphan_parts, term])

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
          disabled={!hasProject || zones.length === 0}
          className="border rounded-md bg-white focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ height: 30, padding: '0 8px', fontSize: 12, minWidth: 150, borderColor: zoneFilter ? '#C8202A' : '#E0E0E0' }}
          value={zoneFilter}
          onChange={e => setParam('zone_id', e.target.value)}
        >
          {zones.length === 0
            ? <option value="" disabled>{hasProject ? 'No zones found' : '— Select a Project first —'}</option>
            : zones.map(z => <option key={z.id} value={z.id}>{z.code} — {z.label}</option>)
          }
        </select>

        <select
          disabled={!hasProject || subZones.length === 0}
          className="border rounded-md bg-white focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ height: 30, padding: '0 8px', fontSize: 12, minWidth: 150, borderColor: subZoneFilter ? '#C8202A' : '#E0E0E0' }}
          value={subZoneFilter}
          onChange={e => setParam('sub_zone_id', e.target.value)}
        >
          {subZones.length === 0
            ? <option value="" disabled>{!zoneFilter ? '— Select a Zone first —' : 'No sub-zones found'}</option>
            : subZones.map(sz => <option key={sz.id} value={sz.id}>{sz.code ? `${sz.code} — ` : ''}{sz.name}</option>)
          }
        </select>

        {!hasProject && <span style={{ fontSize: 12, color: '#8E8E8E' }}>Select a Project from the header first</span>}

        <span style={{ width: 1, height: 20, background: '#E0E0E0', flexShrink: 0 }} />

        {/* Name filter */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={13} style={{ position: 'absolute', left: 8, color: '#9CA3AF', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="Search Assembly / Part..."
            value={nameFilter}
            onChange={e => setNameFilter(e.target.value)}
            style={{
              height: 30, paddingLeft: 26, paddingRight: nameFilter ? 26 : 8,
              fontSize: 12, border: `1px solid ${nameFilter ? '#185FA5' : '#E0E0E0'}`,
              borderRadius: 6, outline: 'none', background: 'white',
              minWidth: 200, color: '#1F1F1F',
            }}
          />
          {nameFilter && (
            <button
              onClick={() => setNameFilter('')}
              style={{ position: 'absolute', right: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 0, display: 'flex' }}
            >
              <X size={12} />
            </button>
          )}
        </div>

        <span className="flex-1" />
        {hasProject && !isLoading && (
          <span style={{ fontSize: 11, color: '#8E8E8E' }}>{allItems.length} dispatches</span>
        )}
      </div>

      {/* ── Body: no project / loading / split panel ──────────── */}
      {!hasProject ? (
        <div className="flex flex-col items-center justify-center gap-3 flex-1" style={{ color: '#8E8E8E' }}>
          <Package size={40} style={{ opacity: 0.2 }} />
          <div style={{ fontSize: 14, fontWeight: 500 }}>Select a Project from the header first</div>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center gap-2 flex-1" style={{ color: '#8E8E8E', fontSize: 13 }}>
          <Loader2 size={20} className="animate-spin" />Loading...
        </div>
      ) : isError || allItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 flex-1" style={{ color: '#8E8E8E' }}>
          <Package size={40} style={{ opacity: 0.2 }} />
          <div style={{ fontSize: 14, fontWeight: 500 }}>No BOM dispatches yet</div>
          <button
            onClick={() => navigate('/bom/upload')}
            className="flex items-center gap-1.5 rounded-md text-white"
            style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, background: '#C8202A', marginTop: 8 }}
          >
            <Upload size={14} />Upload First BOM
          </button>
        </div>
      ) : (
        <div className="flex flex-1" style={{ overflow: 'hidden', minHeight: 0 }}>

          {/* Left panel — tree view */}
          <div className="flex flex-col flex-1" style={{ overflow: 'hidden', minWidth: 0 }}>

            {/* Tab bar */}
            <div style={{ display: 'flex', borderBottom: '1px solid #E8E8E8', background: '#fff', flexShrink: 0 }}>
              {CONTENT_TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setContentTab(tab.id)}
                  style={{
                    padding: '9px 16px',
                    fontSize: 12,
                    fontWeight: contentTab === tab.id ? 600 : 400,
                    color: contentTab === tab.id ? '#C8202A' : '#555',
                    borderBottom: `2px solid ${contentTab === tab.id ? '#C8202A' : 'transparent'}`,
                    background: 'none', border: 'none',
                    borderBottomWidth: 2, borderBottomStyle: 'solid',
                    borderBottomColor: contentTab === tab.id ? '#C8202A' : 'transparent',
                    cursor: 'pointer',
                    marginBottom: -1,
                  }}
                >
                  {tab.label}
                </button>
              ))}
              {selectedItem && contentTab === 'tree' && (
                <span style={{ marginLeft: 'auto', alignSelf: 'center', paddingRight: 12, fontSize: 11, color: '#8E8E8E' }}>
                  {new Date(selectedItem.uploaded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  {term && <span style={{ marginLeft: 8, color: '#185FA5', fontWeight: 500 }}>{filteredAssemblies.length} asm · {filteredOrphanParts.length} pt</span>}
                </span>
              )}
            </div>

            {/* Tab content */}
            {contentTab === 'tree' && (
              detailLoading ? (
                <div className="flex items-center justify-center gap-2 flex-1" style={{ color: '#8E8E8E', fontSize: 13 }}>
                  <Loader2 size={18} className="animate-spin" />Loading...
                </div>
              ) : (
                <BomTreeView
                  assemblies={filteredAssemblies}
                  assemblyCount={term ? filteredAssemblies.length : (detail?.assembly_count ?? null)}
                  partCount={term ? null : (detail?.part_count ?? null)}
                  orphanParts={filteredOrphanParts}
                  searchTerm={term || undefined}
                />
              )
            )}

            {contentTab === 'assemblies' && (
              detailLoading
                ? <div className="flex items-center justify-center gap-2 flex-1" style={{ color: '#8E8E8E', fontSize: 13 }}><Loader2 size={18} className="animate-spin" />Loading...</div>
                : <AssembliesTable assemblies={detail?.assemblies ?? []} />
            )}

            {contentTab === 'parts' && (
              detailLoading
                ? <div className="flex items-center justify-center gap-2 flex-1" style={{ color: '#8E8E8E', fontSize: 13 }}><Loader2 size={18} className="animate-spin" />Loading...</div>
                : <PartsTable assemblies={detail?.assemblies ?? []} orphanParts={detail?.orphan_parts ?? []} />
            )}

            {contentTab === 'paint' && (
              <PaintTab
                dispatchId={selectedId}
                paintConfig={paintConfig}
                isLoading={paintLoading}
                onEdit={() => selectedId && navigate(`/bom/dispatch/${selectedId}/paint`, { state: { fromBomList: true } })}
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
                onOpen={id => navigate(`/bom/dispatch/${id}`)}
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
          uploadMode={selectedItem.upload_mode ?? 'combined'}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}
