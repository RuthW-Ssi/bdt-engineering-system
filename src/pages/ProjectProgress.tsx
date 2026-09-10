import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, ChevronRight, Cuboid as CuboidIcon, Layers, Loader2, Download, History, Calendar, Info, Pencil, FileText } from 'lucide-react'
import { BimViewport } from '../components/bim/BimViewport'
import type { BimFocusRequest, BimSelection } from '../components/bim/BimViewport'
import { ProgressAssemblyTable } from '../components/progress/ProgressAssemblyTable'
import { ProgressDrawingPanel } from '../components/progress/ProgressDrawingPanel'
import { ProgressEditModal } from '../components/progress/ProgressEditModal'
import { ProgressDrawingModal } from '../components/progress/ProgressDrawingModal'
import { ScheduleTabBody } from '../components/progress/SchedulePlanVsActualCard'
import { PHASE_META, PHASE_ORDER, PHASE_PCT_KEY, defaultPhaseColor } from '../components/progress/statusMeta'
import { computeDelayInfo, delayTooltipParts, DELAY_STATUS_COLOR } from '../components/progress/delayStatus'
import type { DelayInfo } from '../components/progress/delayStatus'
import { useProject } from '../hooks/useProjects'
import { usePermission } from '../hooks/usePermission'
import {
  useProgressBimMatch, useProgressOverview, useProgressZoneRows, useProgressProjectRows, useProgressProjectBimMatch,
  useProgressPositions, useUpdateAssemblyProgress, useBulkUpdateAssemblyProgress, useDeletePlaceholderAssembly,
  useDeletedPlaceholderAssemblies, useRestorePlaceholderAssembly,
} from '../hooks/useProjectProgress'
import { useBimViewerToken } from '../hooks/useBim'
import type { ProjectZoneDTO } from '../api/types'
import { exportProgress } from '../api/projectProgress'
import type { BimMatchResult, ProgressZoneRow, ProgressRollupTotals, PhaseKey, UpdateAssemblyProgressPayload, BulkUpdateAssemblyProgressPayload, PlanDateBucket } from '../api/projectProgress'
import type { ProjectDTO } from '../api/types'

type ProjectDetail = ProjectDTO & { zones?: ProjectZoneDTO[] }

// Same convention as ProjectList.tsx's own date column.
const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'

function DelayTooltipContent({ info }: { info: DelayInfo }) {
  const { label, rest } = delayTooltipParts(info)
  return <><b style={{ color: DELAY_STATUS_COLOR[info.status] }}>{label}</b> {rest}</>
}

// Zone table's status dot + tooltip. Rendered via a portal straight into
// document.body, positioned from a real getBoundingClientRect() — the
// table's own scroll container is overflowX/Y:auto, which clipped a
// same-DOM-tree absolutely-positioned tooltip on every edge we tried
// (left, then top). A portal escapes that clipping entirely since the
// tooltip is no longer a descendant of the clipping container at all.
function DelayDot({ info }: { info: DelayInfo }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)

  const show = () => {
    const rect = ref.current?.getBoundingClientRect()
    if (rect) setPos({ top: rect.top, right: window.innerWidth - rect.right })
  }
  const hide = () => setPos(null)

  return (
    <>
      <span
        ref={ref}
        onMouseEnter={show}
        onMouseLeave={hide}
        style={{ display: 'inline-flex', width: 6, height: 6, borderRadius: '50%', background: DELAY_STATUS_COLOR[info.status], flexShrink: 0, cursor: 'help' }}
      />
      {pos && createPortal(
        <div
          style={{
            position: 'fixed', top: pos.top, right: pos.right, transform: 'translateY(-100%)', marginTop: -8,
            width: 260, background: 'white', color: '#4A4A4A', fontSize: 11, lineHeight: 1.5, fontWeight: 400,
            padding: '10px 12px', borderRadius: 8, zIndex: 9999, textAlign: 'left', pointerEvents: 'none',
            border: '1px solid #E0E0E0', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          }}
        >
          <DelayTooltipContent info={info} />
        </div>,
        document.body,
      )}
    </>
  )
}

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
    payment_pct: avg(m => m.payment_pct),
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
  payment_pct: number | null
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

  // Right-column toggle between the 3D viewport and the Drawing quick-look
  // panel — Drawing has no whole-project concept (always zone-scoped), so
  // Overview always shows 3D regardless of this state; the toggle itself is
  // hidden there too (see the tab bar / right-column render below).
  const [rightPanelView, setRightPanelView] = useState<'3d' | 'drawing'>('3d')
  const showDrawingPanel = tab !== 'overview' && rightPanelView === 'drawing'

  // If the URL names a zone that doesn't belong to this project (stale
  // link, typo'd id), fall back to Overview instead of silently showing an
  // empty table with no explanation.
  useEffect(() => {
    if (zoneParam && zones.length && !zones.some(z => z.id === Number(zoneParam))) {
      setSearchParams(p => { p.delete('zone'); return p }, { replace: true })
    }
  }, [zoneParam, zones, setSearchParams])

  const { data: overview } = useProgressOverview(code)

  // If the active tab is the placeholder zone and it just got fully
  // reconciled (assembly_count drops to 0 — e.g. a real BOM upload landed
  // elsewhere while this tab was open), its TabButton vanishes from the
  // bar per the hide-when-empty guard below — bounce to Overview instead
  // of leaving this zone-scoped pane rendering under no visibly-active tab.
  useEffect(() => {
    if (!activeZoneId || !overview) return
    const meta = zones.find(z => z.id === activeZoneId)
    const rollup = overview.zones.find(o => o.zone_id === activeZoneId)
    if (meta?.is_placeholder && rollup && rollup.assembly_count === 0) {
      setSearchParams(p => { p.delete('zone'); return p }, { replace: true })
    }
  }, [activeZoneId, overview, zones, setSearchParams])

  const { data: zoneRows } = useProgressZoneRows(code, activeZoneId)
  const { data: bimMatch } = useProgressBimMatch(code, activeZoneId)
  // Project-wide variants only fetch while the Overview tab is open — the
  // zone-scoped queries above only fetch while a zone tab is open, so the
  // two never run redundantly against each other.
  const { data: projectRows } = useProgressProjectRows(code, tab === 'overview')
  const { data: projectBimMatch } = useProgressProjectBimMatch(code, tab === 'overview')
  const updateMutation = useUpdateAssemblyProgress(code)
  const bulkUpdateMutation = useBulkUpdateAssemblyProgress(code)
  const deleteMutation = useDeletePlaceholderAssembly(code)
  const restoreMutation = useRestorePlaceholderAssembly(code)
  // Lazy — only fetched once the Deleted section is actually expanded.
  const [showDeleted, setShowDeleted] = useState(false)
  const { data: deletedAssemblies, isLoading: deletedLoading } = useDeletedPlaceholderAssemblies(code, showDeleted)

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

  const [activePhase, setActivePhase] = useState<PhaseKey | null>(null)
  const [focusRequest, setFocusRequest] = useState<BimFocusRequest | null>(null)
  const [selectedAssemblyId, setSelectedAssemblyId] = useState<number | null>(null)
  // A plain click-through signal to the table: "open this row's edit panel
  // now" — a fresh object each time (not just the id) so re-clicking the
  // SAME element in the 3D viewer still re-triggers the effect below, since
  // an unchanged primitive id wouldn't count as a dependency change.
  const [autoExpandRequest, setAutoExpandRequest] = useState<{ assemblyId: number } | null>(null)
  // Overview tab's 3D-click popup — see the floating badge + its two modals
  // further down. Zone tabs don't need this: their own table row + Drawing
  // toggle already cover the same actions.
  const [overviewEditOpen, setOverviewEditOpen] = useState(false)
  const [overviewDrawingOpen, setOverviewDrawingOpen] = useState(false)
  const canUpdateProgress = usePermission('project-tracking', 'update')
  const selectedOverviewRow = tab === 'overview' ? (activeRows ?? []).find(r => r.assembly_id === selectedAssemblyId) : undefined

  const matchByAssembly = useMemo(
    () => new Map((activeBimMatch?.matches ?? []).map(m => [m.assembly_id, m])),
    [activeBimMatch],
  )
  const assemblyByGlobalId = useMemo(() => {
    const map = new Map<string, number>()
    for (const m of activeBimMatch?.matches ?? []) for (const g of m.global_ids) map.set(g, m.assembly_id)
    return map
  }, [activeBimMatch])

  // Persistent whole-model coloring when no pill is active — every matched
  // global_id gets its assembly's baseline color via defaultPhaseColor
  // (furthest phase in F→M→T→E pill order that's passed).
  const statusColorMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of activeRows ?? []) {
      const match = matchByAssembly.get(r.assembly_id)
      if (!match) continue
      const color = defaultPhaseColor(r)
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
        const color = groupHighlightIds.has(r.assembly_id) ? defaultPhaseColor(r) : DIMMED_GRAY
        for (const g of match.global_ids) map.set(g, color)
      }
      return map
    }
    if (!activePhase) return statusColorMap
    const map = new Map<string, string>()
    for (const r of activeRows ?? []) {
      const match = matchByAssembly.get(r.assembly_id)
      if (!match) continue
      // Per-phase pass/shade (independent of the other 3 phases) — an
      // assembly that's fully erected still highlights under Fabrication,
      // unlike the old single-ladder exact-match this replaced.
      const phase = r.phases[activePhase]
      const color = phase.passed ? PHASE_META[activePhase][phase.shade] : DIMMED_GRAY
      for (const g of match.global_ids) map.set(g, color)
    }
    return map
  }, [groupHighlightIds, activePhase, activeRows, matchByAssembly, statusColorMap])

  const phaseCounts = useMemo(() => {
    const counts = Object.fromEntries(PHASE_ORDER.map(p => [p, 0])) as Record<PhaseKey, number>
    for (const r of activeRows ?? []) for (const p of PHASE_ORDER) if (r.phases[p].passed) counts[p]++
    return counts
  }, [activeRows])

  // Which rollup backs each pill's dark/light completion badge — Overview's
  // spans the whole project, a zone tab's is scoped to that zone only, same
  // overview/zone ternary as activeRows/activeBimMatch above. ProgressZoneRollup
  // extends ProgressRollupTotals, so both branches satisfy the same type.
  const activeTotals: ProgressRollupTotals | undefined =
    tab === 'overview' ? overview?.total : overview?.zones.find(z => z.zone_id === tab)

  const handleUpdate = (assemblyId: number, payload: UpdateAssemblyProgressPayload) =>
    updateMutation.mutate({ assemblyId, payload }, { onSuccess: () => toast.success('Progress saved') })

  const handleBulkUpdate = (assemblyIds: number[], payload: BulkUpdateAssemblyProgressPayload) =>
    bulkUpdateMutation.mutate({ assemblyIds, payload }, {
      onSuccess: data => toast.success(`Progress saved for ${data.updated} ${data.updated === 1 ? 'assembly' : 'assemblies'}`),
    })

  const handleDelete = (assemblyId: number) => deleteMutation.mutate(assemblyId)
  const handleRestore = (assemblyId: number) => restoreMutation.mutate(assemblyId)

  // Toggling activePhase is all this needs now — highlightColorMap above
  // reacts to it and recolors the (still fully visible) model accordingly.
  // Clears any previewed Zone/Position group — the two isolates are
  // mutually exclusive, same reasoning as the highlightColorMap branch above.
  const handlePhaseIsolate = (phase: PhaseKey) => {
    setActiveGroup(null)
    setActivePhase(prev => (prev === phase ? null : phase))
  }

  // Clicking an already-active row collapses it back — same single-open
  // accordion behavior as the assemblies table's row edit panel.
  const handleGroupToggle = (group: NonNullable<ActiveGroup>) => {
    setActivePhase(null)
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
    if (!selection) {
      // Clicking empty space in the 3D viewport — same "show everything"
      // reset switchTab uses (see its comment: {globalIds:[], hideRest:false}
      // is the shape that actually hits the reset branch, not null).
      setFocusRequest({ globalIds: [], hideRest: false })
      setSelectedAssemblyId(null)
      return
    }
    const assemblyId = assemblyByGlobalId.get(selection.globalId)
    if (assemblyId != null) {
      setSelectedAssemblyId(assemblyId)
      // Clicking an element in the 3D model both selects its row AND opens
      // it for editing — unlike a plain row click, which only selects.
      setAutoExpandRequest({ assemblyId })
    }
  }

  const switchTab = (next: 'overview' | number) => {
    setSearchParams(p => {
      if (next === 'overview') p.delete('zone')
      else p.set('zone', String(next))
      return p
    })
    setActivePhase(null)
    setActiveGroup(null)
    // { globalIds: [], hideRest: false } — NOT null. BimViewport's focus
    // effect early-returns on falsy focusRequest, so null silently no-ops
    // and leaves whatever was selected/isolated stuck in the live 3D
    // viewer after switching tabs. This empty-array shape hits the
    // existing "reset to show everything" branch instead (same shape
    // handleViewIn3D already uses successfully with real ids).
    setFocusRequest({ globalIds: [], hideRest: false })
    setSelectedAssemblyId(null)
  }

  // One-shot side effect, not cached data — a plain async handler + local
  // loading state instead of a React Query mutation. apiClient's Bearer
  // interceptor means a plain <a href> to the endpoint wouldn't carry auth,
  // so this fetches as a blob first, then triggers the browser download.
  const [exporting, setExporting] = useState(false)
  const handleExport = async () => {
    if (!code) return
    setExporting(true)
    try {
      const { blob, filename } = await exportProgress(code)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
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
    <>
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
          {tab === 'overview' && (project.start_date || project.target_handover) && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#F5F5F5', borderRadius: 999, padding: '5px 12px', fontSize: 12, color: '#8E8E8E' }}>
              <Calendar size={12} /> <b style={{ fontFamily: 'IBM Plex Mono, ui-monospace, monospace', fontSize: 12.5, color: '#1A1A1A' }}>{formatDate(project.start_date)}</b>
              {' → '}
              <b style={{ fontFamily: 'IBM Plex Mono, ui-monospace, monospace', fontSize: 12.5, color: '#1A1A1A' }}>{formatDate(project.target_handover)}</b>
            </span>
          )}
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
              F <b style={{ fontSize: 12.5, color: '#1A1A1A' }}>{overview.total.fab_pct.toFixed(0)}%</b>
              <span style={{ color: '#D0D0D0' }}>·</span>
              M <b style={{ fontSize: 12.5, color: '#1A1A1A' }}>{overview.total.payment_pct.toFixed(0)}%</b>
              <span style={{ color: '#D0D0D0' }}>·</span>
              T <b style={{ fontSize: 12.5, color: '#1A1A1A' }}>{overview.total.load_pct}%</b>
              <span style={{ color: '#D0D0D0' }}>·</span>
              E <b style={{ fontSize: 12.5, color: '#1A1A1A' }}>{overview.total.erect_pct}%</b>
            </span>
          )}
          <button
            onClick={handleExport}
            disabled={exporting}
            title="Download an Excel snapshot of current progress"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, font: 'inherit', fontSize: 12.5, fontWeight: 600,
              color: '#1A1A1A', background: 'white', border: '1px solid #E0E0E0', borderRadius: 8,
              padding: '6px 12px', cursor: exporting ? 'default' : 'pointer', opacity: exporting ? 0.6 : 1,
            }}
          >
            {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            Export
          </button>
          <button
            onClick={() => navigate(`/projects/${code}/progress/history`)}
            title="See every change made to progress data, with rollback"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, font: 'inherit', fontSize: 12.5, fontWeight: 600,
              color: '#1A1A1A', background: 'white', border: '1px solid #E0E0E0', borderRadius: 8,
              padding: '6px 12px', cursor: 'pointer',
            }}
          >
            <History size={13} />
            History
          </button>
        </div>
      </div>

      {/* ── Tab bar — same treatment as the filter bar elsewhere (BimViewer/BomList).
          overflowX:auto + nowrap so it scrolls horizontally once there are
          more zone tabs than fit the viewport, instead of clipping them. ── */}
      <div className="flex items-center px-4" style={{ height: 44, background: '#F5F5F5', borderTop: '1px solid #E8E8E8', borderBottom: '1px solid #E8E8E8', flexShrink: 0, gap: 2, overflowX: 'auto', overflowY: 'hidden', flexWrap: 'nowrap' }}>
        <TabButton label="Overview" active={tab === 'overview'} onClick={() => switchTab('overview')} />
        {zones.map(z => {
          const rollup = overview?.zones.find(o => o.zone_id === z.id)
          // A fully-reconciled placeholder zone (every assembly deactivated)
          // has nothing left to review — drop its tab instead of leaving an
          // empty "Pending BOM" tab forever. Only hide once we KNOW it's
          // empty (rollup loaded), not while overview is still fetching.
          if (z.is_placeholder && rollup && rollup.assembly_count === 0) return null
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
              zones={zones}
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
              selectedAssemblyId={selectedAssemblyId}
              autoExpandRequest={autoExpandRequest}
              onViewIn3D={handleViewIn3D}
              onUpdate={handleUpdate}
              onBulkUpdate={handleBulkUpdate}
              onDelete={handleDelete}
              showDeleted={showDeleted}
              onToggleShowDeleted={() => setShowDeleted(v => !v)}
              deletedAssemblies={deletedAssemblies}
              deletedLoading={deletedLoading}
              onRestore={handleRestore}
              restoring={restoreMutation.isPending}
              saving={updateMutation.isPending || bulkUpdateMutation.isPending || deleteMutation.isPending}
              rightPanelView={rightPanelView}
              onSetRightPanelView={setRightPanelView}
            />
          )}
        </div>

        {/* 3D viewport + isolate strip — right, stacked vertically. Gets
            the majority of the width (grid's `1fr` track) now that the
            table is a compact collapsed-by-default list. Isolate-by-status
            shows on every tab now (Overview and each zone) — activeRows/
            activeBimMatch/activeTotals are already tab-scoped, so the same
            strip works whole-project or single-zone with no extra branching.
            The 3D Model/Drawing switch itself moved into ProgressAssemblyTable's
            own header (next to the search box) — it controls this panel from
            across the grid via the rightPanelView prop drilled down to it. */}
        <div className="flex flex-col" style={{ gap: 16, minHeight: 0, minWidth: 0 }}>
          <div style={{ borderRadius: 12, overflow: 'hidden', flex: 1, minHeight: 0, minWidth: 0, position: 'relative' }}>
            {/* Overview has no per-zone assembly table to select a row in —
                clicking an element in the 3D view here instead surfaces this
                floating badge (mark + zone + edit/drawing buttons), mirroring
                mobile's MobileBimCard overlay. A zone tab already gets the
                same actions for free via its own table row + Drawing toggle,
                so this only shows on Overview. */}
            {tab === 'overview' && selectedOverviewRow && (
              <div style={{
                position: 'absolute', top: 10, left: 10, zIndex: 10,
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'rgba(0,0,0,0.7)', color: 'white', borderRadius: 8,
                padding: '6px 6px 6px 12px',
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
                  <span style={{ fontFamily: 'IBM Plex Mono, ui-monospace, monospace', fontWeight: 700, fontSize: 12.5 }}>
                    {selectedOverviewRow.mark}
                  </span>
                  {selectedOverviewRow.zone_label && (
                    <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.7)' }}>{selectedOverviewRow.zone_label}</span>
                  )}
                </div>
                {canUpdateProgress && (
                  <button
                    onClick={() => setOverviewEditOpen(true)}
                    title="Update progress"
                    style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 26, height: 26, borderRadius: 6, border: 'none', cursor: 'pointer',
                      background: 'rgba(255,255,255,0.15)', color: 'white',
                    }}
                  >
                    <Pencil size={13} />
                  </button>
                )}
                {selectedOverviewRow.zone_id != null && (
                  <button
                    onClick={() => setOverviewDrawingOpen(true)}
                    title="Show drawing"
                    style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 26, height: 26, borderRadius: 6, border: 'none', cursor: 'pointer',
                      background: 'rgba(255,255,255,0.15)', color: 'white',
                    }}
                  >
                    <FileText size={13} />
                  </button>
                )}
              </div>
            )}
            {showDrawingPanel ? (
              <ProgressDrawingPanel
                key={selectedAssemblyId ?? 'none'}
                zoneId={activeZoneId!}
                mark={(zoneRows ?? []).find(r => r.assembly_id === selectedAssemblyId)?.mark ?? null}
              />
            ) : activeBimMatch && activeBimMatch.model_id == null ? (
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

            {/* Phase-isolate only affects the 3D viewport's highlighting —
                hide it while the Drawing panel is showing instead of leaving
                controls visible that silently do nothing in that view. */}
            {!showDrawingPanel && (
            <div style={{ background: 'white', border: '1px solid #E0E0E0', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 4, padding: '7px 10px', flexShrink: 0 }}>
              {/* flexWrap so a narrow container wraps to a 2nd row instead
                  of overflow-scrolling or getting cut off — smaller
                  font/padding than the old 5-pill strip since this now
                  also has to fit comfortably at narrower widths. */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 4, flex: 1 }}>
                {PHASE_ORDER.map(p => {
                  const meta = PHASE_META[p]
                  const active = activePhase === p
                  // Badge reflects the phase's AGGREGATE rollup completion
                  // for the current scope (whole project on Overview, just
                  // this zone on a zone tab — see activeTotals), not any
                  // single item — dark only once it's 100%, light while
                  // still in progress.
                  const pct = activeTotals ? activeTotals[PHASE_PCT_KEY[p]] : 0
                  const badgeColor = meta[pct >= 100 ? 'dark' : 'light']
                  return (
                    <button
                      key={p}
                      onClick={() => handlePhaseIsolate(p)}
                      aria-pressed={active}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
                        font: 'inherit', fontSize: 10.5, fontWeight: 600, padding: '4px 8px',
                        borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap', outline: 'none',
                        border: `1px solid ${active ? badgeColor : '#E0E0E0'}`,
                        background: active ? badgeColor : 'white',
                        color: active ? 'white' : '#1A1A1A',
                        transition: 'border-color 0.12s, background 0.12s, color 0.12s',
                      }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: active ? 'white' : badgeColor, flexShrink: 0 }} />
                      {meta.label}
                      <span style={{ fontFamily: 'IBM Plex Mono, ui-monospace, monospace', fontSize: 9.5, opacity: 0.75 }}>{phaseCounts[p]}</span>
                    </button>
                  )
                })}
              </div>
            </div>
            )}
          </div>
        </div>
      </div>

      {overviewEditOpen && selectedOverviewRow && (
        <ProgressEditModal
          row={selectedOverviewRow}
          saving={updateMutation.isPending}
          onUpdate={handleUpdate}
          onClose={() => setOverviewEditOpen(false)}
        />
      )}
      {overviewDrawingOpen && selectedOverviewRow && selectedOverviewRow.zone_id != null && (
        <ProgressDrawingModal
          zoneId={selectedOverviewRow.zone_id}
          mark={selectedOverviewRow.mark}
          onClose={() => setOverviewDrawingOpen(false)}
        />
      )}
    </>
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
        marginBottom: -1, whiteSpace: 'nowrap', flexShrink: 0,
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
  overview, zones, view, onSetView, positionAxis, onSetPositionAxis,
  activeGroup, onToggleGroup, positions, positionBuckets,
}: {
  overview: ReturnType<typeof useProgressOverview>['data']
  zones: ProjectZoneDTO[]
  view: 'zone' | 'position'
  onSetView: (view: 'zone' | 'position') => void
  positionAxis: PositionAxis
  onSetPositionAxis: (axis: PositionAxis) => void
  activeGroup: ActiveGroup
  onToggleGroup: (group: NonNullable<ActiveGroup>) => void
  positions: ReturnType<typeof useProgressPositions>['data']
  positionBuckets: PositionBucket[]
}) {
  const [planTab, setPlanTab] = useState<'fab' | 'erection' | 'schedule'>('schedule')
  if (!overview) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
        <Loader2 size={18} className="animate-spin" style={{ color: '#C2C2C2' }} />
      </div>
    )
  }
  const thStyle: React.CSSProperties = {
    textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.04em', color: '#ABABAB', padding: '11px 14px', borderBottom: '1px solid #E0E0E0', whiteSpace: 'nowrap',
  }
  const tdStyle: React.CSSProperties = { padding: '15px 14px', borderBottom: '1px solid #EDEFF2' }
  const mono: React.CSSProperties = { fontFamily: 'IBM Plex Mono, ui-monospace, monospace' }
  const byId = new Map(zones.map(z => [z.id, z]))

  const { total } = overview

  // Aggregate delay status across every zone for the Assemblies card's
  // summary line — worst-first (any overdue zone dominates the headline).
  let overdueCount = 0, atRiskCount = 0, scheduledCount = 0
  for (const z of overview.zones) {
    const meta = byId.get(z.zone_id)
    const info = computeDelayInfo(meta?.target_start, meta?.target_end, z.fab_pct * 0.5 + z.erect_pct * 0.5)
    if (info === null) continue
    scheduledCount++
    if (info.status === 'overdue') overdueCount++
    else if (info.status === 'at_risk') atRiskCount++
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Summary stat cards — 3 separate bordered cards, back to this
          (2026-09) after a brief stint as one shared-border card — kept
          the compact padding/font from that round, just split the border
          back into 3. Moved back here after also briefly living as a
          3D-viewport overlay — the overlay collided visually with the
          model itself. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 16, flexShrink: 0 }}>
        <StatCard label="Total Weight" value={`${(total.total_weight_kg / 1000).toFixed(1)} t`} />
        <StatCard label="Assemblies" value={total.assembly_count}>
          {scheduledCount > 0 && (
            <div style={{ fontSize: 11, marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
              {overdueCount > 0 && (
                <span style={{ color: DELAY_STATUS_COLOR.overdue, fontWeight: 600 }}>{overdueCount} {overdueCount === 1 ? 'zone' : 'zones'} overdue</span>
              )}
              {overdueCount > 0 && atRiskCount > 0 && <span style={{ color: '#D0D0D0' }}>·</span>}
              {atRiskCount > 0 && (
                <span style={{ color: DELAY_STATUS_COLOR.at_risk, fontWeight: 600 }}>{atRiskCount} {atRiskCount === 1 ? 'zone' : 'zones'} at risk</span>
              )}
              {overdueCount === 0 && atRiskCount === 0 && (
                <span style={{ color: DELAY_STATUS_COLOR.on_track, fontWeight: 600 }}>✓ All zones on track</span>
              )}
              {/* Native `title` tooltips turned out unreliable here, so this
                  is a real CSS hover tooltip instead — same group/group-hover
                  pattern as Sidebar.tsx's collapsed-nav tooltip. */}
              <span className="group" style={{ position: 'relative', display: 'inline-flex', cursor: 'help', flexShrink: 0 }}>
                <Info size={12} style={{ color: '#C2C2C2' }} />
                {/* Left-anchored (not centered) — the scrollable ancestor's
                    overflowY:auto forces overflowX:auto too (CSS quirk: an
                    axis set to non-visible flips the other from visible to
                    auto), which clipped a centered tooltip's left edge. */}
                <div
                  className="absolute opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity"
                  style={{
                    bottom: '100%', left: 0, marginBottom: 8,
                    width: 260, background: 'white', color: '#4A4A4A', fontSize: 11, lineHeight: 1.5,
                    padding: '10px 12px', borderRadius: 8, zIndex: 60, textAlign: 'left', fontWeight: 400,
                    border: '1px solid #E0E0E0', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                  }}
                >
                  <div style={{ marginBottom: 10 }}>
                    <b style={{ color: DELAY_STATUS_COLOR.overdue }}>Overdue</b> — target end date has passed and the zone isn't 100% complete.
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <b style={{ color: DELAY_STATUS_COLOR.at_risk }}>At risk</b> — zone window is still open, but combined progress (Fab + Erection) is more than 15 points behind the % of the window's time already elapsed.
                  </div>
                  <div>
                    <b style={{ color: DELAY_STATUS_COLOR.on_track }}>On track</b> — combined progress is keeping pace (or ahead), 100% complete, or the window hasn't started yet.
                  </div>
                </div>
              </span>
            </div>
          )}
        </StatCard>
        <StatCard label="Done" value={total.buckets.done} accent="#2E9E5F">
          <div style={{ fontSize: 10.5, color: '#8E8E8E', marginTop: 4, whiteSpace: 'nowrap' }}>
            <span style={{ ...mono, color: '#4A85C4' }}>{total.buckets.in_progress}</span> in progress ·{' '}
            <span style={{ ...mono, color: '#ABABAB' }}>{total.buckets.notstart}</span> not started
          </div>
        </StatCard>
      </div>
        <StatCard label="" value="" accent="#C8202A" style={{ height: 280, marginBottom: 16, display: 'flex', flexDirection: 'column' }}>
          {/* Schedule/Fab/Erection — Payment/Transport progress is already
              visible elsewhere on this page (the isolate-by-status pills
              under the 3D panel, and the F/M/T/E columns in the zone table
              below), so this card is scoped to the two phases that actually
              have a plan-date field to compare against (see PlanDateBarChart),
              plus the Schedule Plan-vs-Actual view sharing the same tab
              switcher rather than living in its own separate card below.
              Schedule first — the plan-vs-actual health check is the more
              actionable default view; Fab/Erection's per-date breakdown is
              the drill-down. One tab at a time instead of stacking — same
              segmented-pill style as the Zone/Position toggle below.
              height:258 (fixed, not flex-based) — same reading regardless
              of which of the 3 tabs is active: the Schedule tab's own
              natural height (3 short blocks + their BulletBar rows, never
              scrolls) plus a bit of breathing room below the last block
              set the target, and
              Fab/Erection's per-date table now fills that same box via
              its own internal scroll instead of growing the
              card to fit every row (which used to squeeze, or on a short
              viewport fully hide, the Zone table below whenever a project
              had many distinct plan dates). The Zone table's own flex:1
              still absorbs whatever height this card doesn't use. */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                display: 'inline-flex', width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                background: planTab === 'fab' ? PHASE_META.fabrication.dark : planTab === 'erection' ? PHASE_META.erection.dark : '#8E8E8E',
              }} />
              <span style={{ fontSize: 10.5, fontWeight: 700, color: '#8E8E8E', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                {planTab === 'fab' ? 'Fab Plan' : planTab === 'erection' ? 'Erection Plan' : 'Schedule'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 3, background: '#F7F7F7', border: '1px solid #ECECEC', borderRadius: 8, padding: 3, flexShrink: 0 }}>
              {(['schedule', 'fab', 'erection'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setPlanTab(t)}
                  style={{
                    font: 'inherit', fontSize: 11.5, fontWeight: 700, textTransform: 'capitalize', letterSpacing: '0.02em',
                    padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', outline: 'none',
                    background: planTab === t ? '#C8202A' : 'transparent', color: planTab === t ? 'white' : '#8E8E8E',
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          {/* No overflow here — PlanDateBarChart owns its own internal
              scroll (see its comment) now that this whole card has a
              fixed height; a second overflow:auto on this wrapper just
              nested two independent scrollbars for the same content. */}
          <div style={{ marginTop: 8, flex: 1, minHeight: 0 }}>
            {planTab === 'schedule' ? (
              <ScheduleTabBody schedule={overview.schedule_progress} />
            ) : (
              <PlanDateBarChart rows={planTab === 'fab' ? total.fab_plan_breakdown : total.erection_plan_breakdown} />
            )}
          </div>
        </StatCard>

      {/* flex:1 — same as the card above, so the two cards split the
          remaining height evenly instead of this one taking whatever's left
          over from the other's intrinsic content height. minHeight:150
          (not 0) — enough for the header row + a full zone row to stay
          visible: on a short viewport the Schedule card's own min-height:
          auto floor was squeezing this one down to almost nothing, making
          the zone table look empty even with real zones in it. Kept
          smaller than the original 190 so both cards' floors together
          still fit inside common laptop viewport heights without forcing
          the whole panel to scroll. The inner scroll wrapper below still
          has its own minHeight:0 so a project with many zones scrolls
          THERE, not by growing this card. */}
      <div style={{ background: 'white', border: '1px solid #E0E0E0', borderRadius: 12, overflow: 'hidden', flex: 1, minHeight: 150, display: 'flex', flexDirection: 'column' }}>
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
                    padding: '5px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', outline: 'none',
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
                  padding: '5px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', outline: 'none',
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
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, position: 'sticky', top: 0, background: 'white' }}>Zone</th>
                  <th style={{ ...thStyle, textAlign: 'right', position: 'sticky', top: 0, background: 'white' }}>Assemblies</th>
                  <th style={{ ...thStyle, position: 'sticky', top: 0, background: 'white' }}>Progress</th>
                  <th style={{ ...thStyle, position: 'sticky', top: 0, background: 'white' }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {overview.zones.filter(z => !(z.is_placeholder && z.assembly_count === 0)).map(z => {
                  // No BOM uploaded for this zone yet — mute the row so the eye
                  // goes to zones that actually have work in them, instead of
                  // filtering it out entirely (still a real zone, just empty).
                  const empty = z.assembly_count === 0
                  const active = activeGroup?.type === 'zone' && activeGroup.id === z.zone_id
                  const zoneMeta = byId.get(z.zone_id)
                  const delayInfo = computeDelayInfo(zoneMeta?.target_start, zoneMeta?.target_end, z.fab_pct * 0.5 + z.erect_pct * 0.5)
                  return (
                    <tr
                      key={z.zone_id}
                      onClick={() => !empty && onToggleGroup({ type: 'zone', id: z.zone_id })}
                      style={{ cursor: empty ? 'default' : 'pointer', background: active ? '#FCEBEB' : undefined }}
                    >
                      <td style={{ ...tdStyle, fontWeight: 600, color: empty ? '#C2C2C2' : '#1A1A1A' }}>
                        {z.zone_label}
                      </td>
                      <td style={{ ...tdStyle, ...mono, textAlign: 'right', color: empty ? '#D5D5D5' : '#1A1A1A', whiteSpace: 'nowrap' }}>{z.assembly_count}</td>
                      <td style={{ ...tdStyle, ...mono, fontSize: 12, color: empty ? '#D5D5D5' : '#1A1A1A', whiteSpace: 'nowrap' }}>
                        F <b>{z.fab_pct.toFixed(0)}%</b> · M <b>{z.payment_pct.toFixed(0)}%</b> · T <b>{z.load_pct}%</b> · E <b>{z.erect_pct}%</b>
                      </td>
                      <td style={{ ...tdStyle, ...mono, fontSize: 12, color: delayInfo ? DELAY_STATUS_COLOR[delayInfo.status] : '#ABABAB', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {delayInfo && <DelayDot info={delayInfo} />}
                          <span style={{ fontWeight: delayInfo?.status === 'overdue' ? 700 : 400 }}>
                            {formatDate(zoneMeta?.target_start ?? null)} → {formatDate(zoneMeta?.target_end ?? null)}
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

  const progressCell = (roll: { count: number; trackedCount: number; fab_pct: number | null; load_pct: number | null; erect_pct: number | null; payment_pct: number | null }) =>
    roll.trackedCount > 0 ? (
      <span style={{ ...mono, fontSize: 11 }}>
        F <b>{roll.fab_pct}%</b> · M <b>{roll.payment_pct}%</b> · T <b>{roll.load_pct}%</b> · E <b>{roll.erect_pct}%</b>
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
function StatCard({ label, value, accent, children, style }: {
  label: string
  value: string | number
  accent?: string
  children?: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div style={{ background: 'white', border: '1px solid #E0E0E0', borderRadius: 12, padding: '13px 16px', ...style }}>
      {label !== '' && (
        <div style={{ fontSize: 10.5, fontWeight: 700, color: '#ABABAB', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      )}
      {value !== '' && (
        <div style={{ fontFamily: 'IBM Plex Mono, ui-monospace, monospace', fontSize: 18, fontWeight: 700, color: accent ?? '#1A1A1A', lineHeight: 1, marginTop: 4 }}>{value}</div>
      )}
      {children}
    </div>
  )
}

// Plan-vs-actual for Fab/Erect, grouped by each distinct plan-finish date —
// replaces what used to be a single percent bar for these two phases. A
// percent can't show plan-vs-actual meaningfully once assemblies/zones each
// plan their own date (see PlanDateBucket's comment on the backend); a
// per-date breakdown sidesteps that by never averaging across dates at all
// — every distinct plan date gets its own bar.
//
// Stacked bar chart (2026-09, replaced a per-date table) — this data is a
// real time series (many distinct plan dates) where each date's Total
// splits into 3 parts that sum to it, which is exactly what a stacked bar
// shows at a glance; a grouped 3-bars-per-date layout would need 3x the
// width for the same date count, and a line chart implies a continuous
// trend between points that isn't true here (each date is its own cohort
// of assemblies, not a running total).
const PLAN_BAR_COLOR = { not_started: '#E0E0E0', on_time: '#1A7A3D', delay: '#C8202A' } as const
function PlanDateBarChart({ rows }: { rows: PlanDateBucket[] }) {
  if (rows.length === 0) {
    return <div style={{ fontSize: 11.5, color: '#ABABAB', padding: '2px 0 2px 14px' }}>No plan dates set yet</div>
  }
  const maxTotal = Math.max(...rows.map(r => r.total), 1)
  const barsHeight = 122
  // flex:1/minHeight:0 (not a hardcoded height) — the card this sits in
  // has a real height:258 (see the StatCard usage above), matching the
  // Schedule tab's own natural height, so this fills whatever's left
  // below the header; overflowX handles any project with more plan dates
  // than fit at a legible bar width, instead of growing the whole card
  // (and, on a short viewport, hiding the Zone table below it).
  return (
    <div style={{ flex: 1, minHeight: 0, overflowX: 'auto', overflowY: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 7, height: barsHeight }}>
        {rows.map(r => {
          const scale = barsHeight / maxTotal
          return (
            <div
              key={r.date}
              title={`${formatDate(r.date)} — Total ${r.total}, Not Started ${r.not_started}, On Time ${r.on_time}, Delay ${r.delay}`}
              style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', width: 20, flexShrink: 0, height: '100%' }}
            >
              {r.delay > 0 && <div style={{ height: r.delay * scale, background: PLAN_BAR_COLOR.delay, borderRadius: '2px 2px 0 0' }} />}
              {r.on_time > 0 && <div style={{ height: r.on_time * scale, background: PLAN_BAR_COLOR.on_time, borderRadius: r.delay > 0 ? undefined : '2px 2px 0 0' }} />}
              {r.not_started > 0 && (
                <div style={{ height: r.not_started * scale, background: PLAN_BAR_COLOR.not_started, borderRadius: r.delay === 0 && r.on_time === 0 ? '2px 2px 0 0' : undefined }} />
              )}
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 7, marginTop: 4 }}>
        {rows.map(r => (
          <div
            key={r.date}
            style={{
              width: 20, flexShrink: 0, height: 34, fontSize: 9, fontFamily: 'IBM Plex Mono, ui-monospace, monospace', color: '#8E8E8E',
              writingMode: 'vertical-rl', transform: 'rotate(180deg)', overflow: 'hidden', whiteSpace: 'nowrap',
            }}
          >
            {formatDate(r.date)}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 10, color: '#8E8E8E', whiteSpace: 'nowrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 7, height: 7, borderRadius: 2, background: PLAN_BAR_COLOR.not_started, flexShrink: 0 }} /> Not Started
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 7, height: 7, borderRadius: 2, background: PLAN_BAR_COLOR.on_time, flexShrink: 0 }} /> On Time
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 7, height: 7, borderRadius: 2, background: PLAN_BAR_COLOR.delay, flexShrink: 0 }} /> Delay
        </span>
      </div>
    </div>
  )
}
