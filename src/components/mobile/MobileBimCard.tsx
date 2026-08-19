import { useMemo, useState } from 'react'
import { Loader2, Cuboid as CuboidIcon, Maximize2, Minimize2 } from 'lucide-react'
import { BimViewport } from '../bim/BimViewport'
import { useBimViewerToken } from '../../hooks/useBim'
import { defaultPhaseColor } from '../progress/statusMeta'
import type { BimMatchResult, ProgressZoneRow } from '../../api/projectProgress'

// View-only mirror of desktop ProjectProgress.tsx's base (non-isolate) 3D
// coloring — every matched assembly gets defaultPhaseColor's baseline color,
// everything else stays DIMMED_GRAY. No tap-to-select/focus wiring (no
// assembly list to sync with on this screen) — touch orbit/pinch-zoom is
// native to the Autodesk viewer, no extra code needed for that.
const DIMMED_GRAY = '#4A4A4A'

interface Props {
  bimMatch: BimMatchResult | undefined
  rows: ProgressZoneRow[] | undefined
  // Number (px) for the old small-card usage, or a CSS size string like
  // '100%' to fill a dedicated tab panel. Defaults to the original card
  // height for any future caller that doesn't care.
  height?: number | string
}

export function MobileBimCard({ bimMatch, rows, height = 260 }: Props) {
  const { data: viewerToken } = useBimViewerToken(bimMatch?.model_id ?? null)
  const [expanded, setExpanded] = useState(false)

  const matchByAssembly = useMemo(
    () => new Map((bimMatch?.matches ?? []).map(m => [m.assembly_id, m])),
    [bimMatch],
  )
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
    <div
      className={expanded ? 'fixed inset-0 z-50 bg-black' : 'relative rounded-xl overflow-hidden border border-chrome-100'}
      style={expanded ? undefined : { height }}
    >
      <BimViewport
        urn={viewerToken.urn}
        accessToken={viewerToken.access_token}
        onSelect={() => {}}
        statusColorMap={statusColorMap}
        defaultColor={DIMMED_GRAY}
        hideToolbar
      />
      <button
        onClick={() => setExpanded(e => !e)}
        aria-label={expanded ? 'Collapse 3D view' : 'Expand 3D view'}
        className="absolute z-10 flex items-center justify-center w-9 h-9 text-white active:text-chrome-200"
        style={{ top: expanded ? 'calc(env(safe-area-inset-top) + 10px)' : 10, right: 10, filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.6))' }}
      >
        {expanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
      </button>
    </div>
  )
}
