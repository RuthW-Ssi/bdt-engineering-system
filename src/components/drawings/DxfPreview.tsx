import { useEffect, useRef, useState } from 'react'
import { DxfViewer } from 'dxf-viewer'
import { Color, CanvasTexture, Group, SRGBColorSpace, Sprite, SpriteMaterial } from 'three'
import { AlertTriangle, Loader2, Maximize2, Layers as LayersIcon, Ruler } from 'lucide-react'

export interface DxfMetadata {
  width: number
  height: number
  layerCount: number
}

interface LayerEntry {
  name: string
  displayName: string
  color: string
  visible: boolean
}

interface Props {
  blob: Blob
  onMetadata?: (meta: DxfMetadata | null) => void
}

// Max line/polyline segments to label when the dimensions overlay is on —
// a dense shop drawing can have thousands of polyline vertices, and one
// sprite per segment is real GPU/CPU cost. This is a soft cap for a v1
// opt-in feature, not a hard architectural limit; surfaced in the UI
// (not silently truncated) via the "(showing N/M)" note.
const MAX_DIMENSION_SEGMENTS = 800

interface RawVertex {
  x: number
  y: number
}

interface RawEntity {
  type: string
  vertices?: RawVertex[]
  shape?: boolean
  closed?: boolean
}

function toCssColor(color: number): string {
  return '#' + Math.max(0, Math.min(0xffffff, color)).toString(16).padStart(6, '0')
}

// Canvas-texture sprite — sidesteps dxf-viewer's own text rendering (which
// needs typeface.js font URLs we deliberately don't pass in) by drawing the
// label with the browser's native 2D canvas text instead.
function makeLengthSprite(text: string): Sprite {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const fontPx = 40
  ctx.font = `600 ${fontPx}px ui-monospace, monospace`
  const metrics = ctx.measureText(text)
  const padX = 10
  const padY = 6
  canvas.width = Math.ceil(metrics.width) + padX * 2
  canvas.height = fontPx + padY * 2
  ctx.font = `600 ${fontPx}px ui-monospace, monospace`
  ctx.fillStyle = 'rgba(255,255,255,0.82)'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#0C447C'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, padX, canvas.height / 2)

  const texture = new CanvasTexture(canvas)
  // Without this, three.js treats the canvas's already-gamma-encoded pixels
  // as linear data and re-encodes them again on output — a color like navy
  // #0C447C (low/mid channel values, where the sRGB curve is steep) washes
  // out to a pale blue-gray that's nearly invisible against the light
  // background, while pure black/white/primaries (fixed points of the
  // gamma curve) look fine — which is exactly why this went unnoticed
  // until a real user reported the labels "don't work at all".
  texture.colorSpace = SRGBColorSpace
  const material = new SpriteMaterial({ map: texture, depthTest: false, transparent: true })
  const sprite = new Sprite(material)
  sprite.renderOrder = 999
  const aspect = canvas.width / canvas.height
  sprite.userData.aspect = aspect
  return sprite
}

// Builds one label sprite per straight segment of every LINE/LWPOLYLINE/
// POLYLINE entity, positioned at each segment's midpoint in the viewer's
// origin-relative scene space (per GetScene()'s own docs: "remember to
// apply scene origin"). Arcs/circles/splines are skipped — this is a
// straight-edge perimeter reading, not a full CAD dimension tool.
function buildDimensionGroup(viewer: DxfViewer): { group: Group; total: number; shown: number } | null {
  const dxf = viewer.GetDxf() as { entities?: RawEntity[] } | null
  const entities = dxf?.entities
  if (!entities || entities.length === 0) return null

  const origin = viewer.GetOrigin()
  const bounds = viewer.GetBounds()
  if (!bounds) return null
  const diag = Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) || 1
  // 0.012 (the original value) rendered legibly in isolated testing but was
  // too small to read in practice at the default fit-to-view zoom — GPU
  // minification blends the label so heavily into its own background that
  // it's effectively invisible until zoomed in significantly.
  const labelWorldHeight = diag * 0.03

  const segments: { x1: number; y1: number; x2: number; y2: number; len: number }[] = []
  for (const entity of entities) {
    if (entity.type !== 'LINE' && entity.type !== 'LWPOLYLINE' && entity.type !== 'POLYLINE') continue
    const vertices = entity.vertices
    if (!vertices || vertices.length < 2) continue
    const closed = Boolean(entity.shape ?? entity.closed)
    const pairCount = closed ? vertices.length : vertices.length - 1
    for (let i = 0; i < pairCount; i++) {
      const a = vertices[i]
      const b = vertices[(i + 1) % vertices.length]
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      if (len < 1e-6) continue
      segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, len })
    }
  }
  if (segments.length === 0) return null

  const total = segments.length
  const shown = Math.min(total, MAX_DIMENSION_SEGMENTS)
  const group = new Group()
  for (let i = 0; i < shown; i++) {
    const seg = segments[i]
    const sprite = makeLengthSprite(seg.len.toFixed(1))
    const aspect = sprite.userData.aspect as number
    sprite.scale.set(labelWorldHeight * aspect, labelWorldHeight, 1)
    sprite.position.set(
      (seg.x1 + seg.x2) / 2 - origin.x,
      (seg.y1 + seg.y2) / 2 - origin.y,
      // dxf-viewer hardcodes its camera at position.z=1, near=0.1, far=2
      // (DxfViewer.js constructor) and never changes it elsewhere — the
      // visible world-Z band is [camera.z-far, camera.z-near] = [-1, 0.9].
      // z=1 (== camera.z) sits exactly at the camera itself and gets
      // near-plane clipped entirely; z=0 is safely mid-band. depthTest is
      // off on this material so this doesn't need to match the DXF
      // geometry's own (non-spatial, shader-internal) Z values.
      0,
    )
    group.add(sprite)
  }
  return { group, total, shown }
}

function disposeDimensionGroup(group: Group | null) {
  if (!group) return
  for (const child of group.children) {
    if (child instanceof Sprite) {
      child.material.map?.dispose()
      child.material.dispose()
    }
  }
}

// Renders a DXF file's geometry via dxf-viewer (WebGL, three.js) — a real
// render, not a fallback icon, since DXF (unlike DWG) is an open format a
// browser-side parser can actually read. Deliberately minimal for a first
// pass: no font URLs passed to Load() (text entities render blank — dxf-
// viewer skips text rendering entirely without fonts, geometry is
// unaffected) and no worker (dxf-viewer supports offloading parse to a
// web worker, but that needs its own Vite bundling setup — parsing on the
// main thread is an acceptable trade-off for the file sizes this app's
// shop drawings run, not the "huge real-world files" scale the library's
// worker support targets).
export function DxfPreview({ blob, onMetadata }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)

  const viewerRef = useRef<DxfViewer | null>(null)
  const dimensionGroupRef = useRef<Group | null>(null)
  const [layers, setLayers] = useState<LayerEntry[]>([])
  const [layersOpen, setLayersOpen] = useState(false)
  const [dimensionsOn, setDimensionsOn] = useState(false)
  const [dimensionCoverage, setDimensionCoverage] = useState<{ total: number; shown: number } | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    setStatus('loading')
    setError(null)
    setLayers([])
    setLayersOpen(false)
    setDimensionsOn(false)
    setDimensionCoverage(null)
    dimensionGroupRef.current = null

    const viewer = new DxfViewer(container, {
      clearColor: new Color('#FAFAF8'),
      autoResize: true,
      colorCorrection: true,
      retainParsedDxf: true, // needed to read raw entities for the segment-length overlay
    })
    // dxf-viewer's constructor does `domContainer.appendChild(this.canvas)`
    // but its Destroy() never removes it again — left as a dangling DOM node
    // on cleanup. Harmless on a real unmount (the whole container goes with
    // it), but React 18 StrictMode's dev-only double-invoke of this effect
    // (mount → cleanup → mount again, same container) exposed it directly:
    // the orphaned first canvas stayed in the DOM ahead of the second
    // (real, live) one, so anything querying "the" canvas — including this
    // component's own render — silently got the dead one. Must remove it
    // ourselves.
    const canvasEl = viewer.canvas as HTMLCanvasElement | undefined
    const url = URL.createObjectURL(blob)
    let cancelled = false

    viewer
      .Load({ url })
      .then(() => {
        if (cancelled) return
        setStatus('ready')
        viewerRef.current = viewer
        setLayers(
          viewer.GetLayers(true).map(l => ({
            name: l.name,
            displayName: l.displayName || l.name,
            color: toCssColor(l.color),
            visible: true,
          })),
        )
        // Bounding box in the DXF's own drawing units (this app's shop
        // drawings are consistently mm elsewhere, e.g. BOM's L×W×H — DXF
        // itself carries no reliably-readable unit tag via this library's
        // public API, so this is shown unlabeled rather than guessing).
        const bounds = viewer.GetBounds()
        if (bounds && onMetadata) {
          onMetadata({
            width: bounds.maxX - bounds.minX,
            height: bounds.maxY - bounds.minY,
            layerCount: viewer.GetLayers(true).length,
          })
        } else {
          onMetadata?.(null)
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setStatus('error')
        setError(err instanceof Error ? err.message : String(err))
        onMetadata?.(null)
      })

    return () => {
      cancelled = true
      URL.revokeObjectURL(url)
      viewerRef.current = null
      disposeDimensionGroup(dimensionGroupRef.current)
      dimensionGroupRef.current = null
      viewer.Destroy()
      if (canvasEl && canvasEl.parentElement === container) {
        container.removeChild(canvasEl)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onMetadata is
    // expected to be a fresh closure per render from the parent; keying off
    // it would re-run this whole effect (destroying/recreating the WebGL
    // viewer) on every parent re-render for no reason. Only `blob` should
    // restart the viewer.
  }, [blob])

  const handleFitView = () => {
    const viewer = viewerRef.current
    if (!viewer) return
    const b = viewer.GetBounds()
    if (!b) return
    const origin = viewer.GetOrigin()
    viewer.FitView(b.minX - origin.x, b.maxX - origin.x, b.minY - origin.y, b.maxY - origin.y)
  }

  const handleToggleLayer = (name: string) => {
    const viewer = viewerRef.current
    if (!viewer) return
    setLayers(prev =>
      prev.map(l => {
        if (l.name !== name) return l
        const visible = !l.visible
        viewer.ShowLayer(name, visible)
        return { ...l, visible }
      }),
    )
  }

  const handleToggleDimensions = () => {
    const viewer = viewerRef.current
    if (!viewer) return
    const next = !dimensionsOn
    setDimensionsOn(next)
    if (next && !dimensionGroupRef.current) {
      const built = buildDimensionGroup(viewer)
      if (built) {
        dimensionGroupRef.current = built.group
        setDimensionCoverage({ total: built.total, shown: built.shown })
        viewer.GetScene().add(built.group)
      }
    }
    if (dimensionGroupRef.current) {
      dimensionGroupRef.current.visible = next
    }
    viewer.Render()
  }

  // background/color live in className (not inline style) so the inactive
  // state's hover:bg-chrome-50 can actually apply — an inline `background`
  // always wins over a stylesheet :hover rule regardless of hover state,
  // which silently no-op'd an earlier version of this hover treatment.
  const toolbarBtnStyle = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 30, height: 30, borderRadius: 6, cursor: 'pointer',
    border: '1px solid #E0E0E0',
  } as const
  const toolbarBtnClass = (active: boolean) =>
    active ? 'bg-steel-800 text-white' : 'bg-white text-chrome-600 hover:bg-chrome-50'

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 300 }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {status === 'ready' && (
        <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <div className="flex items-center gap-1.5">
            <button title="Fit to view" onClick={handleFitView} className={toolbarBtnClass(false)} style={toolbarBtnStyle}>
              <Maximize2 size={14} />
            </button>
            <button title="Layers" onClick={() => setLayersOpen(o => !o)} className={toolbarBtnClass(layersOpen)} style={toolbarBtnStyle}>
              <LayersIcon size={14} />
            </button>
            <button title="Show segment lengths" onClick={handleToggleDimensions} className={toolbarBtnClass(dimensionsOn)} style={toolbarBtnStyle}>
              <Ruler size={14} />
            </button>
          </div>

          {layersOpen && layers.length > 0 && (
            <div
              className="bg-white rounded-md border border-chrome-100"
              style={{ padding: 8, minWidth: 160, maxHeight: 220, overflowY: 'auto', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
            >
              {layers.map(l => (
                <label key={l.name} className="flex items-center gap-2 rounded hover:bg-chrome-50" style={{ fontSize: 12, padding: '3px 2px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={l.visible} onChange={() => handleToggleLayer(l.name)} />
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: l.color, flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.displayName}</span>
                </label>
              ))}
            </div>
          )}

          {dimensionsOn && dimensionCoverage && dimensionCoverage.shown < dimensionCoverage.total && (
            <div
              className="bg-white rounded-md border border-chrome-100"
              style={{ padding: '4px 8px', fontSize: 11, color: '#8E8E8E' }}
            >
              showing {dimensionCoverage.shown}/{dimensionCoverage.total} segments
            </div>
          )}
        </div>
      )}

      {status === 'loading' && (
        <div
          className="flex items-center justify-center gap-2"
          style={{ position: 'absolute', inset: 0, color: '#8E8E8E', fontSize: 13, background: '#FAFAF8' }}
        >
          <Loader2 size={18} className="animate-spin" />Rendering DXF...
        </div>
      )}
      {status === 'error' && (
        <div
          className="flex flex-col items-center justify-center gap-2"
          style={{ position: 'absolute', inset: 0, color: '#C8202A', fontSize: 13, background: '#FAFAF8', padding: 16, textAlign: 'center' }}
        >
          <AlertTriangle size={20} />
          Couldn't render this DXF file{error ? ` — ${error}` : ''}
        </div>
      )}
    </div>
  )
}
