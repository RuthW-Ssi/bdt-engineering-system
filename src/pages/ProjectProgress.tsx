import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ChevronRight, Cuboid as CuboidIcon, Layers, Loader2 } from 'lucide-react'
import { BimViewport } from '../components/bim/BimViewport'
import type { BimFocusRequest, BimSelection } from '../components/bim/BimViewport'
import { ProgressAssemblyTable } from '../components/progress/ProgressAssemblyTable'
import { STATUS_META, STATUS_ORDER } from '../components/progress/statusMeta'
import { useProject } from '../hooks/useProjects'
import {
  useProgressBimMatch, useProgressOverview, useProgressZoneRows, useProgressProjectRows, useProgressProjectBimMatch,
  useProgressPositions, useUpdateAssemblyProgress, useBulkUpdateAssemblyProgress,
} from '../hooks/useProjectProgress'
import { useBimViewerToken } from '../hooks/useBim'
import type { ProjectZoneDTO } from '../api/types'
import type { BimMatchResult, ProgressBuckets, ProgressStatus, ProgressZoneRow, UpdateAssemblyProgressPayload, BulkUpdateAssemblyProgressPayload } from '../api/projectProgress'
import type { ProjectDTO } from '../api/types'

type ProjectDetail = ProjectDTO & { zones?: ProjectZoneDTO[] }

type PositionsResult = NonNullable<ReturnType<typeof useProgressPositions>['data']>
type PositionMarkRow = PositionsResult['groups'][number]['marks'][number]

// Overview's Zone/Position rollup row, clicked to preview — highlights that
// group's assemblies in the 3D viewport and expands its assembly list
// inline, instead of navigating away (the tab bar above already covers
// "open this zone's full editable table"). Position carries `axis` since
// the same value string (e.g. "1-2") could otherwise be ambiguous once the
// Position table can be re-grouped by X/Y/Elevation instead of the raw code.
type ActiveGroup =
  | { type: 'zone'; id: number }
  | { type: 'position'; axis: PositionAxis; value: string }
  | null

// Tekla's position code is "X-grid/Y-grid/Elevation" (see the wiki's Sprint
// 26 notes) — re-grouping by just one segment gives far fewer, more legible
// buckets than the raw combined code, and Elevation in particular lines up
// with how erection actually sequences (bottom-up by level, not by grid
// line). All three are offered so the site team can compare and pick.
type PositionAxis = 'x' | 'y' | 'z'
const POSITION_AXIS_LABEL: Record<PositionAxis, string> = { x: 'X Grid', y: 'Y Grid', z: 'Elevation' }
const POSITION_AXIS_INDEX: Record<PositionAxis, number> = { x: 0, y: 1, z: 2 }

// Count-weighted rollup over a set of position-mark entries — untracked
// entries (no matching BOM row, status === null) count toward `count` but
// are excluded from the percentage averages (can't average a "-"). Mirrors
// the zone rollup's "count/weight as the denominator, not a per-row
// average" rule, just with piece count standing in for weight_kg (which
// Position entries don't carry).
function rollupPositionMarks(marks: PositionMarkRow[]) {
  const count = marks.reduce((s, m) => s + m.count, 0)
  const tracked = marks.filter(m => m.status != null)
  const trackedCount = tracked.reduce((s, m) => s + m.count, 0)
  const avg = (pick: (m: PositionMarkRow) => number | null) =>
    trackedCount > 0 ? Math.round(tracked.reduce((s, m) => s + m.count * (pick(m) ?? 0), 0) / trackedCount) : null
  return {
    count, trackedCount,
    fab_pct: avg(m => m.fab_pct), load_pct: avg(m => m.load_pct), erect_pct: avg(m => m.erect_pct),
  }
}

interface PositionBucket {
  key: string // the axis segment value, e.g. "1", "A", "EL.950"
  rawPositions: { position: string; marks: PositionMarkRow[] }[]
  count: number
  trackedCount: number
  fab_pct: number | null
  load_pct: number | null
  erect_pct: number | null
}

// Re-keys the raw (position, mark) data by one segment of the "X/Y/Z" code
// — a Zone-style rollup row per bucket (count + count-weighted progress),
// expanding to the list of raw position codes it contains rather than
// individual marks (assembly-level detail isn't shown in this view).
function buildPositionBuckets(positions: PositionsResult | undefined, axis: PositionAxis): PositionBucket[] {
  if (!positions) return []
  const idx = POSITION_AXIS_INDEX[axis]
  const byKey = new Map<string, PositionsResult['groups']>()
  for (const g of positions.groups) {
    const parts = g.position.split('/')
    const key = parts.length === 3 ? parts[idx] : g.position
    const list = byKey.get(key)
    if (list) list.push(g)
    else byKey.set(key, [g])
  }
  return [...byKey.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([key, rawPositions]) => ({
      key,
      rawPositions: [...rawPositions].sort((a, b) => a.position.localeCompare(b.position, undefined, { numeric: true })),
      ...rollupPositionMarks(rawPositions.flatMap(rp => rp.marks)),
    }))
}

export function ProjectProgress() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()

  const { data: project, isLoading: projectLoading } = useProject(code)
  const zones: ProjectZoneDTO[] = useMemo(() => (project as ProjectDetail | undefined)?.zones ?? [], [project])

  // Selected tab lives in the URL (?zone=<id>), not just component state —
  // otherwise a refresh silently bounces back to Overview (which by design
  // has no per-assembly list, only the zone rollup), reading as "the
  // assembly list disappeared" even though nothing actually broke. Matches
  // this app's established project/zone-scoping convention (searchParams,
  // e.g. useProjectSelection) rather than losing selection on reload.
  const [searchParams, setSearchParams] = useSearchParams()
  const zoneParam = searchParams.get('zone')
  const tab: 'overview' | number = zoneParam ? Number(zoneParam) : 'overview'
  const activeZoneId = tab === 'overview' ? null : tab

  // If the URL names a zone that doesn't belong to this project (stale
  // link, typo'd id), fall back to Overview instead of silently showing an
  // empty table with no explanation.
  useEffect(() => {
    if (zoneParam && zones.length && !zones.some(z => z.id === Number(zoneParam))) {
      setSearchParams(p => { p.delete('zone'); return p }, { replace: true })
    }
  }, [zoneParam, zones, setSearchParams])

  const { data: overview } = useProgressOverview(code)
  const { data: zoneRows } = useProgressZoneRows(code, activeZoneId)
  const { data: bimMatch } = useProgressBimMatch(code, activeZoneId)
  // Project-wide variants only fetch while the Overview tab is open — the
  // zone-scoped queries above only fetch while a zone tab is open, so the
  // two never run redundantly against each other.
  const { data: projectRows } = useProgressProjectRows(code, tab === 'overview')
  const { data: projectBimMatch } = useProgressProjectBimMatch(code, tab === 'overview')
  const updateMutation = useUpdateAssemblyProgress(code)
  const bulkUpdateMutation = useBulkUpdateAssemblyProgress(code)

  // Overview's Zone/Position toggle + which group (if any) is being
  // previewed — lives here (not inside OverviewPanel) because the 3D
  // highlight below needs it too.
  const [view, setView] = useState<'zone' | 'position'>('zone')
  const [positionAxis, setPositionAxis] = useState<PositionAxis>('z')
  const [activeGroup, setActiveGroup] = useState<ActiveGroup>(null)
  const { data: positions } = useProgressPositions(code, tab === 'overview' && view === 'position')
  const positionBuckets = useMemo(() => buildPositionBuckets(positions, positionAxis), [positions, positionAxis])
  // Same query the zone tab itself uses (react-query dedupes if it's already
  // the open tab) — reused here just to preview one zone's assemblies while
  // still on Overview, without a separate endpoint.
  const { data: previewZoneRows } = useProgressZoneRows(
    code, tab === 'overview' && activeGroup?.type === 'zone' ? activeGroup.id : null,
  )

  // Whichever dataset backs the currently-open tab — Overview's 3D/isolate
  // spans every zone at once, a zone tab's is scoped to that zone only.
  const activeRows: ProgressZoneRow[] | undefined = tab === 'overview' ? projectRows : zoneRows
  const activeBimMatch: BimMatchResult | undefined = tab === 'overview' ? projectBimMatch : bimMatch

  // bim-match already resolved the latest complete model server-side — its
  // model_id is the single source of truth for which model the viewer loads.
  const { data: viewerToken } = useBimViewerToken(activeBimMatch?.model_id ?? null)

  const [activeStatus, setActiveStatus] = useState<ProgressStatus | null>(null)
  const [focusRequest, setFocusRequest] = useState<BimFocusRequest | null>(null)
  const [selectedAssemblyId, setSelectedAssemblyId] = useState<number | null>(null)

  const matchByAssembly = useMemo(
    () => new Map((activeBimMatch?.matches ?? []).map(m => [m.assembly_id, m])),
    [activeBimMatch],
  )
  const assemblyByGlobalId = useMemo(() => {
    const map = new Map<string, number>()
    for (const m of activeBimMatch?.matches ?? []) for (const g of m.global_ids) map.set(g, m.assembly_id)
    return map
  }, [activeBimMatch])

  // Persistent whole-model coloring by progress status — every matched
  // global_id gets its assembly's current phase color, light = in
  // progress, dark = phase complete-and-waiting (two-shade encoding).
  const statusColorMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of activeRows ?? []) {
      const match = matchByAssembly.get(r.assembly_id)
      if (!match) continue
      const color = STATUS_META[r.status][r.shade]
      for (const g of match.global_ids) map.set(g, color)
    }
    return map
  }, [activeRows, matchByAssembly])

  // When a status pill is active: matching assemblies keep their real
  // status color, everything else goes gray — nothing hidden, unlike the
  // old hide-based isolate (select()/isolate() reset theming for whatever
  // they touch, so this stays a pure color swap instead of combining with
  // that mechanism). Falls back to each element's own real color when no
  // status is active.
  // Deliberately NOT notstart's own color (#C7CBD1) — highlighting "Not
  // Start" would then be indistinguishable from its own dimmed neighbors,
  // screenshot-confirmed 2026-07-23 as a real edge case, not hypothetical.
  // Deliberately NOT pure black either — against this model's warm cream
  // native/background tone, black reads as high-contrast and draws the eye
  // to the "unselected" elements instead of letting them recede.
  const DIMMED_GRAY = '#4A4A4A'

  // Which assembly_ids belong to the previewed Zone/Position row — the
  // Zone case reuses the exact same rows the zone tab itself would show;
  // the Position case reads off `positionBuckets` (already re-keyed by the
  // active axis), so the lookup matches whatever's actually on screen.
  const groupHighlightIds = useMemo(() => {
    if (!activeGroup) return null
    if (activeGroup.type === 'zone') {
      return previewZoneRows ? new Set(previewZoneRows.map(r => r.assembly_id)) : new Set<number>()
    }
    const bucket = positionBuckets.find(b => b.key === activeGroup.value)
    // Untracked marks (no matching BOM row) have no assembly_id to
    // highlight by — filter them out rather than leaving `null` in the set.
    return new Set(
      (bucket?.rawPositions.flatMap(rp => rp.marks) ?? [])
        .map(m => m.assembly_id)
        .filter((id): id is number => id != null),
    )
  }, [activeGroup, previewZoneRows, positionBuckets])

  const highlightColorMap = useMemo(() => {
    // A previewed Zone/Position group takes priority over the status-pill
    // isolate below — the two are mutually exclusive (see the toggle
    // handlers), so only one of these branches is ever "live" at a time.
    if (groupHighlightIds) {
      const map = new Map<string, string>()
      for (const r of activeRows ?? []) {
        const match = matchByAssembly.get(r.assembly_id)
        if (!match) continue
        const color = groupHighlightIds.has(r.assembly_id) ? STATUS_META[r.status][r.shade] : DIMMED_GRAY
        for (const g of match.global_ids) map.set(g, color)
      }
      return map
    }
    if (!activeStatus) return statusColorMap
    const map = new Map<string, string>()
    for (const r of activeRows ?? []) {
      const match = matchByAssembly.get(r.assembly_id)
      if (!match) continue
      // Comparing on status (not shade) isolates BOTH shades of the
      // active phase together — light and dark stay distinguished.
      const color = r.status === activeStatus ? STATUS_META[r.status][r.shade] : DIMMED_GRAY
      for (const g of match.global_ids) map.set(g, color)
    }
    return map
  }, [groupHighlightIds, activeStatus, activeRows, matchByAssembly, statusColorMap])

  const statusCounts = useMemo(() => {
    const counts = Object.fromEntries(STATUS_ORDER.map(s => [s, 0])) as Record<ProgressStatus, number>
    for (const r of activeRows ?? []) counts[r.status]++
    return counts
  }, [activeRows])

  const handleUpdate = (assemblyId: number, payload: UpdateAssemblyProgressPayload) =>
    updateMutation.mutate({ assemblyId, payload })

  const handleBulkUpdate = (assemblyIds: number[], payload: BulkUpdateAssemblyProgressPayload) =>
    bulkUpdateMutation.mutate({ assemblyIds, payload })

  // Toggling activeStatus is all this needs now — highlightColorMap above
  // reacts to it and recolors the (still fully visible) model accordingly.
  // Clears any previewed Zone/Position group — the two isolates are
  // mutually exclusive, same reasoning as the highlightColorMap branch above.
  const handleStatusIsolate = (status: ProgressStatus) => {
    setActiveGroup(null)
    setActiveStatus(prev => (prev === status ? null : status))
  }

  // Clicking an already-active row collapses it back — same single-open
  // accordion behavior as the assemblies table's row edit panel.
  const handleGroupToggle = (group: NonNullable<ActiveGroup>) => {
    setActiveStatus(null)
    setActiveGroup(prev => {
      if (!prev || prev.type !== group.type) return group
      if (prev.type === 'zone' && group.type === 'zone') return prev.id === group.id ? null : group
      if (prev.type === 'position' && group.type === 'position') {
        return prev.axis === group.axis && prev.value === group.value ? null : group
      }
      return group
    })
  }

  const handleViewIn3D = (assemblyId: number) => {
    setSelectedAssemblyId(assemblyId)
    const match = matchByAssembly.get(assemblyId)
    if (match) setFocusRequest({ globalIds: match.global_ids, hideRest: false })
  }

  const handleViewerSelect = (selection: BimSelection | null) => {
    if (!selection) return
    const assemblyId = assemblyByGlobalId.get(selection.globalId)
    if (assemblyId != null) setSelectedAssemblyId(assemblyId)
  }

  const switchTab = (next: 'overview' | number) => {
    setSearchParams(p => {
      if (next === 'overview') p.delete('zone')
      else p.set('zone', String(next))
      return p
    })
    setActiveStatus(null)
    setActiveGroup(null)
    setFocusRequest(null)
    setSelectedAssemblyId(null)
  }

  if (projectLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
        <Loader2 size={20} className="animate-spin" style={{ color: '#C2C2C2' }} />
      </div>
    )
  }
  if (!project) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#8E8E8E', fontSize: 14 }}>
        Project {code} not found
      </div>
    )
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      {/* ── Header — matches BimViewer's page-chrome convention exactly ── */}
      <div className="bg-white flex items-center justify-between border-b border-chrome-100 px-6" style={{ height: 56, flexShrink: 0 }}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/projects')}
            title="Back to projects"
            className="flex items-center justify-center rounded hover:bg-chrome-50"
            style={{ width: 32, height: 32, color: '#8E8E8E' }}
          >
            <ArrowLeft size={16} />
          </button>
          <span style={{ fontFamily: 'IBM Plex Mono, ui-monospace, monospace', fontSize: 12, fontWeight: 700, color: '#C8202A', background: '#FCEBEB', borderRadius: 6, padding: '3px 8px' }}>
            {project.project_code}
          </span>
          <span style={{ fontSize: 18, fontWeight: 600, color: '#1F1F1F' }}>{project.name}</span>
          <ChevronRight size={14} style={{ color: '#C2C2C2' }} />
          <span style={{ fontSize: 13, color: '#8E8E8E' }}>Progress</span>
        </div>

        {/* Meta pills — BIM/BOM version reflect whatever the 3D viewport is
            currently showing (moved out of an overlay on the viewport itself,
            since the Forge viewer's own canvas painted over it). */}
        <div className="flex items-center gap-2">
          {activeBimMatch?.model_id != null && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#F5F5F5', borderRadius: 999, padding: '5px 12px', fontSize: 12, color: '#8E8E8E' }}>
              <CuboidIcon size={12} />
              BIM <b style={{ fontFamily: 'IBM Plex Mono, ui-monospace, monospace', fontSize: 12.5, color: '#1A1A1A' }}>v{activeBimMatch.model_version}</b>
            </span>
          )}
          {activeBimMatch?.bom_version != null && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#F5F5F5', borderRadius: 999, padding: '5px 12px', fontSize: 12, color: '#8E8E8E' }}>
              <Layers size={12} />
              BOM <b style={{ fontFamily: 'IBM Plex Mono, ui-monospace, monospace', fontSize: 12.5, color: '#1A1A1A' }}>v{activeBimMatch.bom_version}</b>
            </span>
          )}
          {/* Redundant with the Overview tab's own "Overall Progress" stat
              card — only shown on zone tabs, where it's useful context
              ("here's the whole-project number while I'm zoomed into one zone"). */}
          {overview && tab !== 'overview' && (
            <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, background: '#F5F5F5', borderRadius: 999, padding: '5px 14px', fontSize: 12, color: '#8E8E8E', fontFamily: 'IBM Plex Mono, ui-monospace, monospace' }}>
              F <b style={{ fontSize: 12.5, color: '#1A1A1A' }}>{overview.total.fab_pct.toFixed(1)}%</b>
              <span style={{ color: '#D0D0D0' }}>·</span>
              L <b style={{ fontSize: 12.5, color: '#1A1A1A' }}>{overview.total.load_pct}%</b>
              <span style={{ color: '#D0D0D0' }}>·</span>
              E <b style={{ fontSize: 12.5, color: '#1A1A1A' }}>{overview.total.erect_pct}%</b>
            </span>
          )}
        </div>
      </div>

      {/* ── Tab bar — same treatment as the filter bar elsewhere (BimViewer/BomList) ── */}
      <div className="flex items-center px-4" style={{ height: 44, background: '#F5F5F5', borderTop: '1px solid #E8E8E8', borderBottom: '1px solid #E8E8E8', flexShrink: 0, gap: 2 }}>
        <TabButton label="Overview" active={tab === 'overview'} onClick={() => switchTab('overview')} />
        {zones.map(z => {
          const rollup = overview?.zones.find(o => o.zone_id === z.id)
          return (
            <TabButton
              key={z.id}
              label={z.label}
              sub={rollup ? `${(rollup.total_weight_kg / 1000).toFixed(1)}t` : undefined}
              active={tab === z.id}
              onClick={() => switchTab(z.id)}
            />
          )
        })}
      </div>

      {/* ── Body — same 2-column grid for both Overview and zone tabs; only
          the left column's content differs (project rollup vs. assembly
          table). 3D + isolate on the right always reflects the active tab's
          scope (whole project on Overview, one zone otherwise). ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '600px 1fr', gap: 16, flex: 1, minHeight: 0, minWidth: 0, padding: '20px 28px' }}>
        {/* Left column — wide fixed column (600px) so Mark/Weight/Progress
            (3 chips)/3D/Edit all sit without horizontal scroll, and the
            expanded edit panel + bulk-action bar have room; 3D still gets
            the remaining space via the `1fr` track. Grid (not flex) so this
            cell gets a real bounded height automatically — same reason
            BimViewer's 3-panel layout uses grid, not flex, for its row. */}
        <div style={{ minHeight: 0, minWidth: 0, overflowY: tab === 'overview' ? 'auto' : undefined }}>
          {tab === 'overview' ? (
            <OverviewPanel
              overview={overview}
              view={view}
              onSetView={v => { setView(v); setActiveGroup(null) }}
              positionAxis={positionAxis}
              onSetPositionAxis={a => { setPositionAxis(a); setActiveGroup(null) }}
              activeGroup={activeGroup}
              onToggleGroup={handleGroupToggle}
              positions={positions}
              positionBuckets={positionBuckets}
            />
          ) : (
            <ProgressAssemblyTable
              rows={zoneRows ?? []}
              matchedAssemblyIds={new Set(matchByAssembly.keys())}
              selectedAssemblyId={selectedAssemblyId}
              onSelectRow={setSelectedAssemblyId}
              onViewIn3D={handleViewIn3D}
              onUpdate={handleUpdate}
              onBulkUpdate={handleBulkUpdate}
              saving={updateMutation.isPending || bulkUpdateMutation.isPending}
            />
          )}
        </div>

        {/* 3D viewport + isolate strip — right, stacked vertically. Gets
            the majority of the width (grid's `1fr` track) now that the
            table is a compact collapsed-by-default list. Isolate-by-status
            is Overview-only now (whole-project scope) — a zone tab just
            gets the plain 3D viewport + the per-row "View" zoom button. */}
        <div className="flex flex-col" style={{ gap: 16, minHeight: 0, minWidth: 0 }}>
          <div style={{ borderRadius: 12, overflow: 'hidden', flex: 1, minHeight: 0, minWidth: 0 }}>
            {activeBimMatch && activeBimMatch.model_id == null ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#F0F0F0', border: '0.5px solid #E0E0E0', color: '#ABABAB', gap: 8, textAlign: 'center', padding: 16 }}>
                <CuboidIcon size={28} />
                <span style={{ fontSize: 13 }}>No completed BIM model for this project yet — the table still works</span>
              </div>
            ) : viewerToken ? (
                // defaultColor is always on, not just while isolating — BIM-only
                // elements with no BOM match at all (never in statusColorMap)
                // would otherwise keep showing their native IFC material color
                // on every load, reading as meaningful progress when it isn't.
                // Matched elements are unaffected: their statusColorMap entry
                // layers on top of this base.
                <BimViewport
                  urn={viewerToken.urn}
                  accessToken={viewerToken.access_token}
                  onSelect={handleViewerSelect}
                  focusRequest={focusRequest}
                  statusColorMap={highlightColorMap}
                  defaultColor={DIMMED_GRAY}
                />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#F0F0F0', border: '0.5px solid #E0E0E0', color: '#ABABAB' }}>
                  <Loader2 size={20} className="animate-spin" />
                </div>
              )}
            </div>

            {tab === 'overview' && (
              <div style={{ background: 'white', border: '1px solid #E0E0E0', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 5, padding: '9px 14px', flexShrink: 0, overflowX: 'auto' }}>
                {/* justify-content: space-between spreads the 6 pills evenly
                    across the full card width instead of bunching them
                    left with dead space on the right. */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 5, flex: 1, minWidth: 'fit-content' }}>
                  {STATUS_ORDER.map(s => {
                    const meta = STATUS_META[s]
                    const active = activeStatus === s
                    return (
                      <button
                        key={s}
                        onClick={() => handleStatusIsolate(s)}
                        aria-pressed={active}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
                          font: 'inherit', fontSize: 11.5, fontWeight: 600, padding: '5px 10px',
                          borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap', outline: 'none',
                          border: `1px solid ${active ? meta.dark : '#E0E0E0'}`,
                          background: active ? meta.dark : 'white',
                          color: active ? 'white' : '#1A1A1A',
                          transition: 'border-color 0.12s, background 0.12s, color 0.12s',
                        }}
                      >
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: active ? 'white' : meta.dark, flexShrink: 0 }} />
                        {meta.label}
                        <span style={{ fontFamily: 'IBM Plex Mono, ui-monospace, monospace', fontSize: 10.5, opacity: 0.75 }}>{statusCounts[s]}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
  )
}

// Matches BomList's content-tab convention (fontSize 12, padding 9px 16px)
// rather than a bespoke one — same visual language app-wide.
function TabButton({ label, sub, active, onClick }: { label: string; sub?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-selected={active}
      style={{
        font: 'inherit', fontSize: 12, fontWeight: active ? 600 : 400,
        color: active ? '#C8202A' : '#555',
        background: 'none', border: 'none',
        padding: '9px 16px', cursor: 'pointer',
        borderBottom: `2px solid ${active ? '#C8202A' : 'transparent'}`,
        marginBottom: -1, whiteSpace: 'nowrap',
      }}
    >
      {label}
      {sub && <span style={{ fontFamily: 'IBM Plex Mono, ui-monospace, monospace', fontSize: 10.5, color: '#ABABAB', marginLeft: 5 }}>{sub}</span>}
    </button>
  )
}

// Left column of the Overview tab — stat cards + per-zone rollup table.
// Lives inside the same 560px-wide left column as the zone tab's assembly
// table (the parent grid cell supplies scrolling/height), so this has no
// outer full-page wrapper of its own and the stat-card grid is 2-wide
// instead of 4-wide to fit comfortably.
function OverviewPanel({
  overview, view, onSetView, positionAxis, onSetPositionAxis,
  activeGroup, onToggleGroup, positions, positionBuckets,
}: {
  overview: ReturnType<typeof useProgressOverview>['data']
  view: 'zone' | 'position'
  onSetView: (view: 'zone' | 'position') => void
  positionAxis: PositionAxis
  onSetPositionAxis: (axis: PositionAxis) => void
  activeGroup: ActiveGroup
  onToggleGroup: (group: NonNullable<ActiveGroup>) => void
  positions: ReturnType<typeof useProgressPositions>['data']
  positionBuckets: PositionBucket[]
}) {
  if (!overview) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
        <Loader2 size={18} className="animate-spin" style={{ color: '#C2C2C2' }} />
      </div>
    )
  }
  const thStyle: React.CSSProperties = {
    textAlign: 'left', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.04em', color: '#ABABAB', padding: '9px 12px', borderBottom: '1px solid #E0E0E0', whiteSpace: 'nowrap',
  }
  const tdStyle: React.CSSProperties = { padding: '9px 12px', borderBottom: '1px solid #EDEFF2' }
  const mono: React.CSSProperties = { fontFamily: 'IBM Plex Mono, ui-monospace, monospace' }

  const { total } = overview

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Summary stat cards — quick at-a-glance read before the per-zone
          breakdown table below; mirrors CuttingPlanDetail's StatCard pattern. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 16, flexShrink: 0 }}>
        {/* Three separate phase numbers, deliberately no combined total
            (spec) — each phase has its own responsible team in the real
            workflow, a synthetic blend would match nobody's number. */}
        <StatCard label="Progress" value="" accent="#C8202A">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 2 }}>
            <PhaseBar label="Fab" pct={total.fab_pct} color={STATUS_META.fabrication.dark} />
            <PhaseBar label="Load" pct={total.load_pct} color={STATUS_META.load.dark} />
            <PhaseBar label="Erect" pct={total.erect_pct} color={STATUS_META.erection.dark} />
          </div>
        </StatCard>
        <StatCard label="Total Weight" value={`${(total.total_weight_kg / 1000).toFixed(1)} t`} />
        <StatCard label="Assemblies" value={total.assembly_count} />
        <StatCard label="Done" value={total.buckets.done} accent="#2E9E5F">
          <div style={{ fontSize: 11.5, color: '#8E8E8E', marginTop: 8 }}>
            <span style={{ ...mono, color: '#4A85C4' }}>{total.buckets.in_progress}</span> in progress ·{' '}
            <span style={{ ...mono, color: '#ABABAB' }}>{total.buckets.notstart}</span> not started
          </div>
        </StatCard>
      </div>

      {/* flex:1 — the card's white background stretches to fill whatever
          height is left (matching the 3D viewport's height on the right)
          instead of stopping short after the last zone row. */}
      <div style={{ background: 'white', border: '1px solid #E0E0E0', borderRadius: 12, overflow: 'hidden', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #EDEFF2', flexShrink: 0 }}>
          {/* Group-by-axis — Position view only. Re-slices the same
              (position, mark) data by X grid / Y grid / Elevation instead
              of the raw combined Tekla code (fewer, more legible buckets). */}
          {view === 'position' ? (
            <div style={{ display: 'flex', gap: 3, background: '#F7F7F7', border: '1px solid #ECECEC', borderRadius: 8, padding: 3 }}>
              {(['x', 'y', 'z'] as const).map(a => (
                <button
                  key={a}
                  onClick={() => onSetPositionAxis(a)}
                  style={{
                    font: 'inherit', fontSize: 11.5, fontWeight: 700, letterSpacing: '0.02em',
                    padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                    background: positionAxis === a ? '#1A1A1A' : 'transparent', color: positionAxis === a ? 'white' : '#8E8E8E',
                  }}
                >
                  {POSITION_AXIS_LABEL[a]}
                </button>
              ))}
            </div>
          ) : <div />}
          <div style={{ display: 'flex', gap: 3, background: '#F7F7F7', border: '1px solid #ECECEC', borderRadius: 8, padding: 3 }}>
            {(['zone', 'position'] as const).map(v => (
              <button
                key={v}
                onClick={() => onSetView(v)}
                style={{
                  font: 'inherit', fontSize: 11.5, fontWeight: 700, textTransform: 'capitalize', letterSpacing: '0.02em',
                  padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  background: view === v ? '#C8202A' : 'transparent', color: view === v ? 'white' : '#8E8E8E',
                }}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        {/* flex:1 + minHeight:0 — once rows outgrow the card's height, THIS
            scrolls internally instead of the whole page; header row stays
            pinned via `sticky` so it doesn't scroll away with the rows. */}
        <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {view === 'zone' ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, position: 'sticky', top: 0, background: 'white' }}>Zone</th>
                  <th style={{ ...thStyle, textAlign: 'right', position: 'sticky', top: 0, background: 'white' }}>Weight</th>
                  <th style={{ ...thStyle, textAlign: 'right', position: 'sticky', top: 0, background: 'white' }}>Assemblies</th>
                  <th style={{ ...thStyle, position: 'sticky', top: 0, background: 'white' }}>Progress</th>
                </tr>
              </thead>
              <tbody>
                {overview.zones.map(z => {
                  // No BOM uploaded for this zone yet — mute the row so the eye
                  // goes to zones that actually have work in them, instead of
                  // filtering it out entirely (still a real zone, just empty).
                  const empty = z.assembly_count === 0
                  const active = activeGroup?.type === 'zone' && activeGroup.id === z.zone_id
                  return (
                    <tr
                      key={z.zone_id}
                      onClick={() => !empty && onToggleGroup({ type: 'zone', id: z.zone_id })}
                      style={{ cursor: empty ? 'default' : 'pointer', background: active ? '#FCEBEB' : undefined }}
                    >
                      <td style={{ ...tdStyle, fontWeight: 600, color: empty ? '#C2C2C2' : '#1A1A1A' }}>{z.zone_label}</td>
                      <td style={{ ...tdStyle, ...mono, textAlign: 'right', color: empty ? '#D5D5D5' : '#8E8E8E' }}>{(z.total_weight_kg / 1000).toFixed(1)} t</td>
                      <td style={{ ...tdStyle, ...mono, textAlign: 'right', color: empty ? '#D5D5D5' : '#1A1A1A' }}>{z.assembly_count}</td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <ZoneStatusBar buckets={z.buckets} assemblyCount={z.assembly_count} />
                          <span style={{ ...mono, fontSize: 11, color: empty ? '#D5D5D5' : '#1A1A1A', whiteSpace: 'nowrap' }}>
                            F <b>{z.fab_pct.toFixed(0)}%</b> · L <b>{z.load_pct}%</b> · E <b>{z.erect_pct}%</b>
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {!overview.zones.length && (
                  <tr>
                    <td colSpan={4} style={{ ...tdStyle, textAlign: 'center', color: '#8E8E8E', padding: 28 }}>
                      No zones defined for this project yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : !positions ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160 }}>
              <Loader2 size={16} className="animate-spin" style={{ color: '#C2C2C2' }} />
            </div>
          ) : (
            <PositionRollupTable
              positions={positions} positionBuckets={positionBuckets} positionAxis={positionAxis}
              activeGroup={activeGroup} onToggleGroup={onToggleGroup} thStyle={thStyle} tdStyle={tdStyle} mono={mono}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// Zone-style rollup, one row per bucket (X grid / Y grid / Elevation value)
// — count + count-weighted progress, no assembly/mark detail. Clicking a
// bucket highlights it in 3D and expands to the list of raw Tekla position
// codes it contains (e.g. "1/A/EL.950") — just identifying where within the
// bucket real pieces are, not which specific marks live there.
function PositionRollupTable({
  positions, positionBuckets, positionAxis, activeGroup, onToggleGroup, thStyle, tdStyle, mono,
}: {
  positions: NonNullable<ReturnType<typeof useProgressPositions>['data']>
  positionBuckets: PositionBucket[]
  positionAxis: PositionAxis
  activeGroup: ActiveGroup
  onToggleGroup: (group: NonNullable<ActiveGroup>) => void
  thStyle: React.CSSProperties
  tdStyle: React.CSSProperties
  mono: React.CSSProperties
}) {
  if (!positions.model_id) {
    return (
      <div style={{ padding: 28, textAlign: 'center', color: '#8E8E8E', fontSize: 12.5 }}>
        No BIM model uploaded for this project yet — position codes come from the BIM model
      </div>
    )
  }

  const progressCell = (roll: { count: number; trackedCount: number; fab_pct: number | null; load_pct: number | null; erect_pct: number | null }) =>
    roll.trackedCount > 0 ? (
      <span style={{ ...mono, fontSize: 11 }}>
        F <b>{roll.fab_pct}%</b> · L <b>{roll.load_pct}%</b> · E <b>{roll.erect_pct}%</b>
        {roll.count > roll.trackedCount && (
          <span style={{ color: '#C2C2C2' }}> · {roll.count - roll.trackedCount} untracked</span>
        )}
      </span>
    ) : (
      <span style={{ ...mono, fontSize: 11, color: '#C2C2C2' }}>- ({roll.count} untracked)</span>
    )

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
      <thead>
        <tr>
          <th style={{ ...thStyle, position: 'sticky', top: 0, background: 'white' }}>Position</th>
          <th style={{ ...thStyle, textAlign: 'right', position: 'sticky', top: 0, background: 'white' }}>Count</th>
          <th style={{ ...thStyle, position: 'sticky', top: 0, background: 'white' }}>Progress</th>
        </tr>
      </thead>
      <tbody>
        {positionBuckets.map(b => {
          const active = activeGroup?.type === 'position' && activeGroup.axis === positionAxis && activeGroup.value === b.key
          return (
            <tr
              key={b.key}
              onClick={() => onToggleGroup({ type: 'position', axis: positionAxis, value: b.key })}
              style={{ cursor: 'pointer', background: active ? '#FCEBEB' : undefined }}
            >
              <td style={{ ...tdStyle, fontWeight: 600 }}>{b.key}</td>
              <td style={{ ...tdStyle, ...mono, textAlign: 'right', color: '#8E8E8E' }}>{b.count}</td>
              <td style={tdStyle}>{progressCell(b)}</td>
            </tr>
          )
        })}
        {!!positions.unmatched.length && (
          <tr>
            <td colSpan={3} style={{ ...tdStyle, color: '#8E8E8E', fontStyle: 'italic' }}>
              {positions.unmatched.length} assemblies tracked in BOM with no matching BIM position
            </td>
          </tr>
        )}
        {!positionBuckets.length && !positions.unmatched.length && (
          <tr>
            <td colSpan={3} style={{ ...tdStyle, textAlign: 'center', color: '#8E8E8E', padding: 28 }}>
              No assemblies to show
            </td>
          </tr>
        )}
      </tbody>
    </table>
  )
}

// Replaces separate not-start/in-progress/done columns with one glanceable
// stacked bar (same 3-bucket split, just encoded as proportion instead of
// three more numbers) — the counts are still there on hover.
function ZoneStatusBar({ buckets, assemblyCount }: { buckets: ProgressBuckets; assemblyCount: number }) {
  if (assemblyCount === 0) {
    return <div style={{ width: 90, height: 6, borderRadius: 99, background: '#EDEFF2', flexShrink: 0 }} />
  }
  const segment = (n: number): React.CSSProperties => ({ width: `${(n / assemblyCount) * 100}%`, height: '100%' })
  return (
    <div
      title={`${buckets.done} done · ${buckets.in_progress} in progress · ${buckets.notstart} not started`}
      style={{ display: 'flex', width: 90, height: 6, borderRadius: 99, overflow: 'hidden', flexShrink: 0, background: '#EDEFF2' }}
    >
      <div style={{ ...segment(buckets.done), background: '#2E9E5F' }} />
      <div style={{ ...segment(buckets.in_progress), background: '#4A85C4' }} />
      <div style={{ ...segment(buckets.notstart), background: '#C7CBD1' }} />
    </div>
  )
}

function StatCard({ label, value, accent, children }: {
  label: string
  value: string | number
  accent?: string
  children?: React.ReactNode
}) {
  return (
    <div style={{ background: 'white', border: '1px solid #E0E0E0', borderRadius: 12, padding: '16px 18px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#ABABAB', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      {value !== '' && (
        <div style={{ fontFamily: 'IBM Plex Mono, ui-monospace, monospace', fontSize: 26, fontWeight: 700, color: accent ?? '#1A1A1A', lineHeight: 1, marginTop: 9 }}>{value}</div>
      )}
      {children}
    </div>
  )
}

// Labeled mini progress bar — one per phase in the Overview "Progress" card.
function PhaseBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, color: '#8E8E8E', width: 34, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</span>
      <div style={{ flex: 1, height: 6, borderRadius: 99, background: '#EDEFF2', overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color }} />
      </div>
      <b style={{ fontFamily: 'IBM Plex Mono, ui-monospace, monospace', fontSize: 11.5, width: 44, textAlign: 'right', flexShrink: 0 }}>
        {label === 'Fab' ? pct.toFixed(1) : pct}%
      </b>
    </div>
  )
}
