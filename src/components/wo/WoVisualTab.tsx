import { useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, Boxes, Cuboid as CuboidIcon, FileText, Layers, Loader2, MoveHorizontal, MoveVertical, RotateCw, SearchX } from 'lucide-react'
import { BimViewport, type BimFocusRequest, type BimViewportHandle } from '../bim/BimViewport'
import { useBimViewerToken } from '../../hooks/useBim'
import { useWoBimMatch } from '../../hooks/useWo'
import { useZoneDrawings } from '../../hooks/useDrawings'
import { DrawingPreviewPanel } from '../drawings/DrawingPreviewPanel'
import { listMarkDrawingVersions } from '../../lib/markDrawingVersions'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
}

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

interface PickerOption {
  value: number
  label: string
}

const MONO = 'IBM Plex Mono, ui-monospace, monospace'

// Whole-model views: the selected mark in the app's primary red, the WO's
// other marks in orange (WO view only), everything else flattened to one
// neutral gray so native material colors don't compete.
// Whole model, whole-model framing. Module-level so its identity never changes.
const WO_VIEW_FOCUS: BimFocusRequest = { globalIds: [], hideRest: false }
const HIGHLIGHT_COLOR = '#C8202A'
const WO_MARK_COLOR = '#F59E0B'
const CONTEXT_COLOR = '#D4D4D4'

// Compact dropdown, same look as DiffBimComparePanel's 3D version picker.
// Always a dropdown once there's at least one option, even a single one
// (user, 2026-10-05: it must read as "pick here" so older versions are
// discoverable); zero options renders nothing.
function Picker({ label, options, value, onPick }: {
  label: string
  options: PickerOption[]
  value: number | null
  onPick: (value: number) => void
}) {
  if (!options.length) return null
  return (
    <select
      aria-label={label}
      value={value ?? undefined}
      onChange={e => onPick(Number(e.target.value))}
      style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: '#1A1A1A', border: '1px solid #E0E0E0', borderRadius: 6, padding: '2px 6px', background: 'white', cursor: 'pointer', flex: '0 1 auto', minWidth: 0, textOverflow: 'ellipsis' }}
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

// Pane caption + its pickers (mark, then version). One row that never wraps
// — the pickers shrink (truncating their shown label) instead, so the 3D and
// Drawing panes below always start at the same height side by side.
function PaneHeader({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, minHeight: 22, minWidth: 0 }}>
      <span style={{ display: 'flex', flexShrink: 0 }}>{icon}</span>
      <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>{title}</span>
      {children}
    </div>
  )
}

// One selectable mark for the Mark dropdowns below — WoDetail builds this from
// each non-removed work_order_mark, preferring the mark's own snapshot
// dispatch (falls back to the live bom_assembly's dispatch), same precedence
// the old single-mark WoDetail used for its one implicit mark.
export interface WoVisualMark {
  bomAssemblyId: number
  mark: string
  projectId: number
  zoneId: number | null
  subZoneId: number | null
}

// Sprint 28 · F-WO Visual Tab — isolated 3D view of a single assembly mark on
// this WO, side by side with its shop drawing (2026-09-14: swapped the old
// "coming soon" mockup — formerly WoDrawingPlaceholder.tsx, now deleted —
// for the real Drawing feature). Reuses BimViewport/useBimViewerToken
// unchanged, same as BimViewer.tsx and ProjectProgress.tsx.
//
// Multi-mark redesign (2026-09-17): a WO can now carry many marks, so this
// takes the full list and lets the user pick one (defaulting to the first) —
// threaded into both the drawing-pane lookup (listMarkDrawingVersions) and
// the BIM-match hook (useWoBimMatch's optional bomAssemblyId).
//
// Pane headers (2026-10-05): each pane has a Mark dropdown (always the WO's
// own marks, shown even for a single mark; the two stay in sync so 3D and
// Drawing always show the same mark) next to its own version dropdown,
// defaulting to the newest — the mark's newest drawing version and the
// project's newest complete 3D model. Two 3D toolbar toggles swap the
// isolated piece for the full model — with every instance of the selected
// mark highlighted, or with every mark on the WO highlighted. View-only: nothing is saved to the WO (WOs are
// immutable once created) and it all resets on reload.
export function WoVisualTab({ woId, marks }: { woId: number; marks: WoVisualMark[] }) {
  const [selectedId, setSelectedId] = useState<number | null>(marks[0]?.bomAssemblyId ?? null)
  // Guards against a stale selection after a mark is removed/accepted to a
  // new bom_assembly_id elsewhere — falls back to the first mark rather than
  // rendering a dead tab.
  const active = marks.find(m => m.bomAssemblyId === selectedId) ?? marks[0] ?? null

  // 3D version picker (2026-10-05). null = backend default (newest complete
  // model). Models are project-scoped, so a pick survives switching to
  // another mark of the SAME project — tagged with its project because an MO
  // (hence a WO) can still span projects, and the backend 404s a model_id
  // from another project; a mark elsewhere just falls back to the default.
  const [modelPick, setModelPick] = useState<{ projectId: number; modelId: number } | null>(null)
  const pickedModelId = modelPick && modelPick.projectId === active?.projectId ? modelPick.modelId : null
  const {
    data: bimMatch, isLoading, isPlaceholderData, isError: matchError,
  } = useWoBimMatch(woId, active?.bomAssemblyId, pickedModelId ?? undefined)
  // isPlaceholderData = a mark/model switch is loading while the previous
  // match is still held. A viewer already on screen stays up meanwhile —
  // unmounting it reloaded the whole model and reset the camera on every
  // mark switch; a same-model result then just re-focuses/re-colors it.
  // Anything else held (not-found, processing…) is stale for the new pick,
  // so that waits behind a spinner.
  const matchLoading = isLoading || (isPlaceholderData && bimMatch?.status !== 'ok')
  const modelId = !matchLoading && bimMatch?.status === 'ok' ? bimMatch.model_id : null
  const { data: viewerToken } = useBimViewerToken(modelId)
  const viewportRef = useRef<BimViewportHandle>(null)
  const modelOptions: PickerOption[] = (bimMatch?.models ?? []).map((m, i) => ({
    value: m.id,
    label: `v${m.version} · ${formatDate(m.create_date)}${m.translation_status === 'complete' ? '' : ` · ${m.translation_status}`}${i === 0 ? ' (latest)' : ''}`,
  }))

  const {
    data: zoneDrawings = [], isLoading: drawingsLoading, isError: drawingsError,
  } = useZoneDrawings(active?.zoneId ?? undefined, active?.subZoneId ?? null)
  const drawingVersions = active && active.zoneId != null ? listMarkDrawingVersions(zoneDrawings, active.mark) : []
  // Drawing version picker — tagged with the mark it was made on, so
  // switching marks falls back to that mark's newest version without an effect.
  const [drawingPick, setDrawingPick] = useState<{ bomAssemblyId: number; version: number } | null>(null)
  const pickedVersion = drawingPick && drawingPick.bomAssemblyId === active?.bomAssemblyId ? drawingPick.version : null
  const selectedDrawing = drawingVersions.find(v => v.version === pickedVersion) ?? drawingVersions[0] ?? null
  const drawingOptions: PickerOption[] = drawingVersions.map((v, i) => ({
    value: v.version,
    label: `v${v.version} · ${formatDate(v.drawing.create_date)}${i === 0 ? ' (latest)' : ''}`,
  }))
  const mark = active?.mark ?? ''
  const markOptions: PickerOption[] = marks.map(m => ({ value: m.bomAssemblyId, label: m.mark }))
  // 'default' = whatever fitToView already framed (no orientation button
  // pressed yet) — not the same as neither button being "active" once the
  // user has toggled once, but there's no way to read the camera's current
  // roll back out of BimViewport, so this only tracks OUR last click, not
  // ground truth. Good enough for highlighting which button was pressed.
  const [orientation, setOrientationState] = useState<'default' | 'vertical' | 'horizontal'>('default')
  // Which of the piece's 4 faces (90° apart around its long axis) is
  // showing, for the chosen orientation — rotation doesn't have its own
  // meaning against 'default' (there's no axis/side basis until an
  // orientation is picked), so the Rotate button stays disabled until
  // orientation !== 'default'.
  const [rotationStep, setRotationStep] = useState(0)
  // 'single' = the mark's piece isolated (the original view). The two
  // whole-model modes gray out everything else: 'mark' paints every instance
  // of the selected mark red; 'wo' also paints the WO's other marks orange.
  // Survives mark switches so the user can step through marks in context.
  const [viewMode, setViewMode] = useState<'single' | 'mark' | 'wo'>('single')
  const wholeModel = viewMode !== 'single'
  // Each toolbar toggle turns its own mode on, or back to 'single' if it's already on.
  const toggleViewMode = (mode: 'mark' | 'wo') => setViewMode(viewMode === mode ? 'single' : mode)

  // Both must be memoized — a fresh object/Map would re-fire BimViewport's
  // focus/color effects on every unrelated re-render (the color pass walks
  // every dbId in the model).
  const focusRequest = useMemo<BimFocusRequest | null>(() => {
    if (bimMatch?.status !== 'ok' || !bimMatch.global_id) return null
    // An empty set is BimViewport's "show everything + fit whole model"
    // request. The highlight can't ride on select()/isolate() — those reset
    // theming colors — so it's the separate statusColorMap layer below.
    // WO view: one shared constant, so switching marks never re-fires the
    // viewer's camera move — the user's own framing stays, only colors change.
    if (viewMode === 'wo') return WO_VIEW_FOCUS
    // Mark view: fitGlobalIds keeps the camera on the selected mark's pieces.
    if (viewMode === 'mark') {
      return { globalIds: [], hideRest: false, fitGlobalIds: bimMatch.global_ids ?? [bimMatch.global_id] }
    }
    return { globalIds: [bimMatch.global_id], hideRest: true }
  }, [bimMatch, viewMode])
  const highlightColors = useMemo(() => {
    if (viewMode === 'single' || bimMatch?.status !== 'ok') return undefined
    // `??` fallbacks — Vercel previews proxy to the staging backend, which
    // may not return these fields yet; still highlight what's known.
    const ids = bimMatch.global_ids ?? (bimMatch.global_id ? [bimMatch.global_id] : [])
    const colors = new Map<string, string>()
    if (viewMode === 'wo') for (const g of bimMatch.wo_global_ids ?? []) colors.set(g, WO_MARK_COLOR)
    // Set last so red wins over orange for the selected mark's own pieces.
    for (const g of ids) colors.set(g, HIGHLIGHT_COLOR)
    return colors
  }, [bimMatch, viewMode])

  // A newly-focused piece gets its own fresh fitToView from BimViewport —
  // the orientation toggle's pressed-state should reset with it rather than
  // keep showing "Vertical" highlighted against a piece it was never applied
  // to. Adjusted during render (React's documented pattern for "reset state
  // when a prop changes"), not a useEffect — an effect would paint one
  // stale frame with the old orientation still highlighted before firing.
  const [prevFocusRequest, setPrevFocusRequest] = useState(focusRequest)
  if (focusRequest !== prevFocusRequest) {
    setPrevFocusRequest(focusRequest)
    setOrientationState('default')
    setRotationStep(0)
  }

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
        <EmptyBox icon={<AlertTriangle size={28} />} message={`BIM model v${bimMatch.model_version} failed to translate.`} />
      ) : (
        <LoadingBox message={`BIM model v${bimMatch.model_version} is still processing — check back soon.`} />
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
        // Remount per model version — the viewer's GUID index and camera
        // state belong to the model it loaded (same as DiffBimComparePanel).
        key={bimMatch.model_id}
        ref={viewportRef}
        urn={viewerToken.urn}
        accessToken={viewerToken.access_token}
        onSelect={() => {}}
        focusRequest={focusRequest}
        statusColorMap={highlightColors}
        defaultColor={highlightColors ? CONTEXT_COLOR : undefined}
      />
    ) : (
      <LoadingBox />
    )
  }
  const viewerActive = bimMatch?.status === 'ok' && !!viewerToken

  function toggleOrientation(mode: 'vertical' | 'horizontal') {
    // Back to face 0 when switching axis — rotation is relative to
    // whichever orientation is currently picked, not a standalone state
    // that should survive switching from vertical to horizontal.
    viewportRef.current?.setOrientation(mode, 0)
    setOrientationState(mode)
    setRotationStep(0)
  }

  function rotateToNextFace() {
    if (orientation === 'default') return
    const next = (rotationStep + 1) % 4
    viewportRef.current?.setOrientation(orientation, next)
    setRotationStep(next)
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      {!active ? (
        <EmptyBox icon={<CuboidIcon size={28} />} message="No marks on this work order." />
      ) : (
      <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
      {/*
        `flex-1 min-h-0` here + `flex-1` on both panes below (not a vh-based
        clamp()) — this row sits directly inside WoDetail's Body container,
        which is `flex: 1` inside a fixed `calc(100vh - 56px)` column, so its
        parent has a genuinely DEFINITE height to inherit. The panes then
        fill exactly whatever space is actually left below the tab bar at
        every window size,
        instead of guessing a vh percentage that under- or over-shoots
        depending on how tall the banners above happen to be that day (a
        clamp() max like the old 480px is exactly what left a visible gap
        below both panes on anything taller than a small laptop screen).
        Equal `flex-1`/`flex-1` (no `lg:` prefix) is intentional — the `flex`
        shorthand sizes along whichever axis is the main axis, so the SAME
        classes split 50/50 in both row (desktop) and stacked (narrow)
        layouts. Tried 61.5/38.5 favoring Drawing (2026-09-15) — too cramped
        for the 3D pane, reverted to even. `min-h-*` is only a floor for very
        short viewports — Body's own `overflowY: auto` takes over if that
        floor can't be met.
      */}
      <div className="flex-1 min-h-[240px] min-w-0 flex flex-col gap-1">
      <PaneHeader icon={<CuboidIcon size={11} />} title="3D Model">
        <Picker label="3D Model mark" options={markOptions} value={active.bomAssemblyId} onPick={setSelectedId} />
        <Picker
          label="3D Model version"
          options={modelOptions}
          value={pickedModelId ?? bimMatch?.model_id ?? null}
          onPick={modelId => setModelPick({ projectId: active.projectId, modelId })}
        />
      </PaneHeader>
      <div className="flex-1 min-h-0" style={{ position: 'relative', borderRadius: 12, overflow: 'hidden' }}>
        {left}
        {viewerActive && (
          <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 2, display: 'flex', gap: 2, background: 'rgba(31,31,31,.85)', borderRadius: 10, padding: 6 }}>
            {/* Orientation aims the camera at the isolated piece — meaningless
                in the whole-model view, so disabled there. */}
            <OrientationButton
              icon={<MoveVertical size={16} />}
              title={wholeModel ? 'Switch back to the single piece to orient it' : 'Orient vertical'}
              active={orientation === 'vertical'}
              disabled={wholeModel}
              onClick={() => toggleOrientation('vertical')}
            />
            <OrientationButton
              icon={<MoveHorizontal size={16} />}
              title={wholeModel ? 'Switch back to the single piece to orient it' : 'Orient horizontal'}
              active={orientation === 'horizontal'}
              disabled={wholeModel}
              onClick={() => toggleOrientation('horizontal')}
            />
            <div style={{ width: 1, background: 'rgba(255,255,255,.15)', margin: '4px 2px' }} />
            <OrientationButton
              icon={<RotateCw size={16} />}
              title={wholeModel ? 'Switch back to the single piece to rotate it' : orientation === 'default' ? 'Pick vertical or horizontal first to rotate' : `Rotate to next face (${rotationStep + 1}/4)`}
              active={rotationStep !== 0}
              disabled={wholeModel || orientation === 'default'}
              onClick={rotateToNextFace}
            />
            <div style={{ width: 1, background: 'rgba(255,255,255,.15)', margin: '4px 2px' }} />
            <OrientationButton
              icon={<Boxes size={16} />}
              title={viewMode === 'mark' ? 'Show this piece only' : 'Show the whole model with this mark highlighted'}
              active={viewMode === 'mark'}
              onClick={() => toggleViewMode('mark')}
            />
            <OrientationButton
              icon={<Layers size={16} />}
              title={viewMode === 'wo' ? 'Show this piece only' : 'Show the whole model with every mark on this work order highlighted'}
              active={viewMode === 'wo'}
              onClick={() => toggleViewMode('wo')}
            />
          </div>
        )}
        {viewerActive && viewMode === 'wo' && (
          <div style={{ position: 'absolute', left: 12, bottom: 12, zIndex: 2, display: 'flex', gap: 12, background: 'rgba(31,31,31,.85)', borderRadius: 8, padding: '6px 10px', fontSize: 11, fontWeight: 600, color: '#fff' }}>
            <LegendSwatch color={HIGHLIGHT_COLOR} label="Selected mark" />
            <LegendSwatch color={WO_MARK_COLOR} label="Other marks on this WO" />
          </div>
        )}
      </div>
      </div>
      <div className="flex-1 min-h-[240px] min-w-0 flex flex-col gap-1">
      <PaneHeader icon={<FileText size={11} />} title="Drawing">
        <Picker label="Drawing mark" options={markOptions} value={active.bomAssemblyId} onPick={setSelectedId} />
        <Picker
          label="Drawing version"
          options={drawingOptions}
          value={selectedDrawing?.version ?? null}
          onPick={version => setDrawingPick({ bomAssemblyId: active.bomAssemblyId, version })}
        />
      </PaneHeader>
      <div className="flex-1 min-h-0" style={{ borderRadius: 12, overflow: 'hidden' }}>
        {drawingsLoading ? (
          <LoadingBox />
        ) : drawingsError ? (
          <EmptyBox icon={<AlertTriangle size={28} />} message={`Couldn't load drawings for mark "${mark}".`} />
        ) : selectedDrawing ? (
          <DrawingPreviewPanel drawing={selectedDrawing.drawing} />
        ) : (
          <EmptyBox icon={<FileText size={28} />} message={`No drawing uploaded for mark "${mark}" yet.`} />
        )}
      </div>
      </div>
      </div>
      )}
    </div>
  )
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
      {label}
    </span>
  )
}

function OrientationButton({ icon, title, active, disabled, onClick }: { icon: ReactNode; title: string; active: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 34, height: 34, borderRadius: 7, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: active ? 'rgba(255,255,255,.18)' : 'transparent',
        color: disabled ? '#5A5A5A' : active ? '#fff' : '#D6D6D6',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {icon}
    </button>
  )
}
