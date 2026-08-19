import { useMemo, useState } from 'react'
import { Loader2, Cuboid as CuboidIcon, Maximize2, Minimize2, SlidersHorizontal, SquarePen } from 'lucide-react'
import { BimViewport } from '../bim/BimViewport'
import type { BimSelection } from '../bim/BimViewport'
import { useBimViewerToken } from '../../hooks/useBim'
import { defaultPhaseColor } from '../progress/statusMeta'
import { MobileProgressSheet } from './MobileProgressSheet'
import type { BimMatchResult, ProgressZoneRow } from '../../api/projectProgress'

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
  // Number (px) for the old small-card usage, or a CSS size string like
  // '100%' to fill a dedicated tab panel. Defaults to the original card
  // height for any future caller that doesn't care.
  height?: number | string
}

export function MobileBimCard({ projectCode, bimMatch, rows, zoneLabel, height = 260 }: Props) {
  const { data: viewerToken } = useBimViewerToken(bimMatch?.model_id ?? null)
  const [expanded, setExpanded] = useState(false)
  const [showToolbar, setShowToolbar] = useState(false)
  const [selected, setSelected] = useState<{ row: ProgressZoneRow; zone?: string } | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

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
        className={expanded ? 'fixed inset-0 z-50 bg-black' : 'relative rounded-xl overflow-hidden border border-chrome-100'}
        style={expanded ? undefined : { height }}
      >
        <BimViewport
          urn={viewerToken.urn}
          accessToken={viewerToken.access_token}
          onSelect={handleSelect}
          statusColorMap={statusColorMap}
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

      <MobileProgressSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        projectCode={projectCode}
        row={selected?.row ?? null}
      />
    </>
  )
}
