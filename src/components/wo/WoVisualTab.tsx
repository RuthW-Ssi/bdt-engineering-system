import { useMemo, type ReactNode } from 'react'
import { AlertTriangle, Cuboid as CuboidIcon, Loader2, SearchX } from 'lucide-react'
import { BimViewport, type BimFocusRequest } from '../bim/BimViewport'
import { useBimViewerToken } from '../../hooks/useBim'
import { useWoBimMatch } from '../../hooks/useWo'
import { WoDrawingPlaceholder } from './WoDrawingPlaceholder'

const PANE_BOX_STYLE = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  background: '#F0F0F0',
  border: '0.5px solid #E0E0E0',
  color: '#ABABAB',
  gap: 8,
  textAlign: 'center',
  padding: 16,
} as const

function LoadingBox({ message }: { message?: string }) {
  return (
    <div style={PANE_BOX_STYLE}>
      <Loader2 size={20} className="animate-spin" />
      {message && <span style={{ fontSize: 13 }}>{message}</span>}
    </div>
  )
}

function EmptyBox({ icon, message }: { icon: ReactNode; message: string }) {
  return (
    <div style={PANE_BOX_STYLE}>
      {icon}
      <span style={{ fontSize: 13 }}>{message}</span>
    </div>
  )
}

// Sprint 28 · F-WO Visual Tab — isolated 3D view of the single assembly this
// WO is for, side by side with a Drawing stub (future feature). Reuses
// BimViewport/useBimViewerToken unchanged, same as BimViewer.tsx and
// ProjectProgress.tsx.
export function WoVisualTab({ woId, mark }: { woId: number; mark: string }) {
  const { data: bimMatch, isLoading: matchLoading, isError: matchError } = useWoBimMatch(woId)
  const modelId = bimMatch?.status === 'ok' ? bimMatch.model_id : null
  const { data: viewerToken } = useBimViewerToken(modelId)

  // Must be memoized — an inline object literal would re-fire BimViewport's
  // focus effect on every unrelated re-render (same reason ProjectProgress
  // keeps this in its own state).
  const focusRequest = useMemo<BimFocusRequest | null>(() => {
    if (bimMatch?.status !== 'ok' || !bimMatch.global_id) return null
    return { globalIds: [bimMatch.global_id], hideRest: true }
  }, [bimMatch])

  let left: ReactNode
  if (matchLoading) {
    left = <LoadingBox />
  } else if (matchError) {
    left = <EmptyBox icon={<AlertTriangle size={28} />} message="Couldn't load 3D data for this work order." />
  } else if (bimMatch?.status === 'no_model') {
    left = <EmptyBox icon={<CuboidIcon size={28} />} message="No 3D model has been uploaded for this project yet." />
  } else if (bimMatch?.status === 'model_not_ready') {
    left =
      bimMatch.translation_status === 'failed' ? (
        <EmptyBox icon={<AlertTriangle size={28} />} message="The project's BIM model failed to translate." />
      ) : (
        <LoadingBox message="The project's BIM model is still processing — check back soon." />
      )
  } else if (bimMatch?.status === 'mark_not_found') {
    left = (
      <EmptyBox
        icon={<SearchX size={28} />}
        message={`Mark "${mark}" was not found in the project's BIM model (v${bimMatch.model_version}).`}
      />
    )
  } else if (bimMatch?.status === 'ok') {
    left = viewerToken ? (
      <BimViewport
        urn={viewerToken.urn}
        accessToken={viewerToken.access_token}
        onSelect={() => {}}
        focusRequest={focusRequest}
      />
    ) : (
      <LoadingBox />
    )
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full">
      {/*
        `h-full` here + `flex-[1.6]`/`flex-1` on the panes below (not a
        vh-based clamp()) — this row sits directly inside WoDetail's Body
        container, which is `flex: 1` inside a fixed `calc(100vh - 56px)`
        column, so it has a genuinely DEFINITE height to inherit. The panes
        then fill exactly whatever space is actually left below the tab bar
        at every window size, instead of guessing a vh percentage that under-
        or over-shoots depending on how tall the banners above happen to be
        that day (a clamp() max like the previous 480px is exactly what left
        a visible gap below both panes on anything taller than a small
        laptop screen). `flex-[1.6]`/`flex-1` (no `lg:` prefix) is
        intentional — the `flex` shorthand sizes along whichever axis is the
        main axis, so the SAME classes split 61.5/38.5 in both row (desktop)
        and stacked (narrow) layouts. `min-h-*` is only a floor for very
        short viewports — Body's own `overflowY: auto` takes over if that
        floor can't be met.
      */}
      <div className="flex-[1.6] min-h-[240px] min-w-0" style={{ borderRadius: 12, overflow: 'hidden' }}>
        {left}
      </div>
      <div className="flex-1 min-h-[240px] min-w-0" style={{ borderRadius: 12, overflow: 'hidden' }}>
        <WoDrawingPlaceholder mark={mark} />
      </div>
    </div>
  )
}
