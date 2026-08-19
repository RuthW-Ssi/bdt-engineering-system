import { useMemo, useState } from 'react'
import { Loader2, Cuboid as CuboidIcon, Maximize2, Minimize2, SlidersHorizontal, SquarePen } from 'lucide-react'
import { BimViewport } from '../bim/BimViewport'
import type { BimSelection } from '../bim/BimViewport'
import { useBimViewerToken } from '../../hooks/useBim'
import { PHASE_ORDER, PHASE_META, PHASE_PCT_KEY, defaultPhaseColor } from '../progress/statusMeta'
import { MobileProgressSheet } from './MobileProgressSheet'
import type { BimMatchResult, ProgressZoneRow, ProgressRollupTotals, PhaseKey } from '../../api/projectProgress'

// View-only mirror of desktop ProjectProgress.tsx's base (non-isolate) 3D
// coloring — every matched assembly gets defaultPhaseColor's baseline color,
// everything else stays DIMMED_GRAY.
const DIMMED_GRAY = '#4A4A4A'

interface Props {
  projectCode: string
  bimMatch: BimMatchResult | undefined
  rows: ProgressZoneRow[] | undefined
  // Static fallback used when a tapped row doesn't carry its own zone_label
  // (getProgressZoneRows rows don't — the caller already knows the zone from
  // its own route params). getProgressProjectRows DOES carry it per row,
  // since one project-wide model spans every zone.
  zoneLabel?: string
  // Mirrors desktop's Overview-tab-only phase pill strip (isolate-by-status
  // via a color swap, not a real 3D isolate/hide) — only meaningful at
  // project level where a project-wide model spans every zone, same scoping
  // desktop uses (a single-zone tab gets the plain viewer, no pills).
  // Requires `overviewTotals` for the pills' dark/light completion badge.
  showPhaseFilter?: boolean
  overviewTotals?: ProgressRollupTotals
  // Number (px) for the old small-card usage, or a CSS size string like
  // '100%' to fill a dedicated tab panel. Defaults to the original card
  // height for any future caller that doesn't care.
  height?: number | string
}

export function MobileBimCard({ projectCode, bimMatch, rows, zoneLabel, showPhaseFilter, overviewTotals, height = 260 }: Props) {
  const { data: viewerToken } = useBimViewerToken(bimMatch?.model_id ?? null)
  const [expanded, setExpanded] = useState(false)
  const [showToolbar, setShowToolbar] = useState(false)
  const [selected, setSelected] = useState<{ row: ProgressZoneRow; zone?: string } | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [activePhase, setActivePhase] = useState<PhaseKey | null>(null)

  const matchByAssembly = useMemo(
    () => new Map((bimMatch?.matches ?? []).map(m => [m.assembly_id, m])),
    [bimMatch],
  )
  // Reverse of matchByAssembly — resolves a tapped element's globalId back
  // to an assembly_id, same lookup desktop's handleViewerSelect builds.
  const assemblyByGlobalId = useMemo(() => {
    const map = new Map<string, number>()
    for (const m of bimMatch?.matches ?? []) for (const g of m.global_ids) map.set(g, m.assembly_id)
    return map
  }, [bimMatch])

  const statusColorMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of rows ?? []) {
      const match = matchByAssembly.get(r.assembly_id)
      if (!match) continue
      const color = defaultPhaseColor(r)
      for (const g of match.global_ids) map.set(g, color)
    }
    return map
  }, [rows, matchByAssembly])

  // Same recolor-only isolate as desktop's highlightColorMap — nothing
  // hidden, the whole model stays visible. A phase-passed element keeps/gets
  // its real phase color; everything else turns solid dim gray. Falls back
  // to the persistent baseline map when no pill is active.
  const highlightColorMap = useMemo(() => {
    if (!activePhase) return statusColorMap
    const map = new Map<string, string>()
    for (const r of rows ?? []) {
      const match = matchByAssembly.get(r.assembly_id)
      if (!match) continue
      const phase = r.phases[activePhase]
      const color = phase.passed ? PHASE_META[activePhase][phase.shade] : DIMMED_GRAY
      for (const g of match.global_ids) map.set(g, color)
    }
    return map
  }, [rows, matchByAssembly, activePhase, statusColorMap])

  const phaseCounts = useMemo(() => {
    const counts = Object.fromEntries(PHASE_ORDER.map(p => [p, 0])) as Record<PhaseKey, number>
    for (const r of rows ?? []) for (const p of PHASE_ORDER) if (r.phases[p].passed) counts[p]++
    return counts
  }, [rows])

  const handleSelect = (selection: BimSelection | null) => {
    if (!selection) { setSelected(null); return }
    const assemblyId = assemblyByGlobalId.get(selection.globalId)
    const row = assemblyId != null ? rows?.find(r => r.assembly_id === assemblyId) : undefined
    if (row) setSelected({ row, zone: row.zone_label ?? zoneLabel })
    else setSelected(null)
  }

  const shellClass = 'flex flex-col items-center justify-center gap-2 bg-chrome-50 border border-chrome-100 rounded-xl text-chrome-300'

  if (bimMatch && bimMatch.model_id == null) {
    return (
      <div className={shellClass} style={{ height }}>
        <CuboidIcon size={26} />
        <span className="text-xs text-center px-6">No completed BIM model for this project yet</span>
      </div>
    )
  }

  if (!viewerToken) {
    return (
      <div className={shellClass} style={{ height }}>
        <Loader2 size={20} className="animate-spin" />
      </div>
    )
  }

  return (
    <>
      <div
        className={expanded ? 'fixed inset-0 z-50 bg-black flex flex-col' : 'flex flex-col'}
        style={expanded ? undefined : { height }}
      >
        <div className={expanded ? 'flex-1 min-h-0 relative' : 'flex-1 min-h-0 relative rounded-xl overflow-hidden border border-chrome-100'}>
          <BimViewport
            urn={viewerToken.urn}
            accessToken={viewerToken.access_token}
            onSelect={handleSelect}
            statusColorMap={highlightColorMap}
            defaultColor={DIMMED_GRAY}
            hideToolbar={!showToolbar}
          />

          {selected && (
            <div
              className="absolute left-2 z-10 flex items-center gap-1.5 bg-black/70 text-white rounded-lg pl-3 pr-1.5 py-1.5"
              style={{ top: expanded ? 'calc(env(safe-area-inset-top) + 10px)' : 10 }}
            >
              <span className="font-mono font-semibold text-[12.5px]">{selected.row.mark}</span>
              {selected.zone && <span className="text-[11.5px] text-white/70">· {selected.zone}</span>}
              <button
                onClick={() => setSheetOpen(true)}
                aria-label="Update progress"
                className="flex items-center justify-center w-6 h-6 rounded-md bg-white/15 active:bg-white/30"
              >
                <SquarePen size={13} />
              </button>
            </div>
          )}

          <div
            className="absolute right-10 z-10 flex items-center justify-center w-9 h-9 text-white active:text-chrome-200"
            style={{ top: expanded ? 'calc(env(safe-area-inset-top) + 10px)' : 10, filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.6))' }}
          >
            <button
              onClick={() => setShowToolbar(s => !s)}
              aria-label={showToolbar ? 'Hide 3D tools' : 'Show 3D tools'}
              aria-pressed={showToolbar}
              className={showToolbar ? 'text-ssi-300' : undefined}
            >
              <SlidersHorizontal size={18} />
            </button>
          </div>
          <button
            onClick={() => setExpanded(e => !e)}
            aria-label={expanded ? 'Collapse 3D view' : 'Expand 3D view'}
            className="absolute z-10 flex items-center justify-center w-9 h-9 text-white active:text-chrome-200"
            style={{ top: expanded ? 'calc(env(safe-area-inset-top) + 10px)' : 10, right: 10, filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.6))' }}
          >
            {expanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
        </div>

        {showPhaseFilter && (
          <div
            className="flex-shrink-0 mt-3 bg-white border border-chrome-100 rounded-xl flex items-center justify-center flex-wrap gap-1 px-2.5 py-2"
            style={expanded ? { marginLeft: 12, marginRight: 12, marginBottom: 'calc(env(safe-area-inset-bottom) + 12px)' } : undefined}
          >
            {PHASE_ORDER.map(p => {
              const meta = PHASE_META[p]
              const active = activePhase === p
              const pct = overviewTotals ? overviewTotals[PHASE_PCT_KEY[p]] : 0
              const badgeColor = meta[pct >= 100 ? 'dark' : 'light']
              return (
                <button
                  key={p}
                  onClick={() => setActivePhase(prev => (prev === p ? null : p))}
                  aria-pressed={active}
                  className="inline-flex items-center gap-1.5 flex-shrink-0 rounded-full px-2 py-1 text-[10.5px] font-semibold whitespace-nowrap"
                  style={{
                    border: `1px solid ${active ? badgeColor : '#E0E0E0'}`,
                    background: active ? badgeColor : 'white',
                    color: active ? 'white' : '#1A1A1A',
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: active ? 'white' : badgeColor }} />
                  {meta.label}
                  <span className="font-mono text-[9.5px] opacity-75">{phaseCounts[p]}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <MobileProgressSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        projectCode={projectCode}
        row={selected?.row ?? null}
      />
    </>
  )
}
