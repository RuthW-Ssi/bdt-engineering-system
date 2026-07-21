import { useEffect, useRef, useState } from 'react'
import { Orbit, Hand, Layers, Ruler, ScanEye, EyeOff, Boxes, Maximize } from 'lucide-react'

// Autodesk Viewer SDK is a global UMD script, not an npm/ESM package — loaded
// on demand so it never touches the Vite build. Types are `any` on purpose;
// @types/forge-viewer exists but pulls in a large, rarely-updated global
// namespace for a component only this file touches.
declare global {
  interface Window {
    Autodesk: any
    THREE: any
  }
}

const VIEWER_JS = 'https://developer.api.autodesk.com/modelderivative/v2/viewers/7.*/viewer3D.min.js'
const VIEWER_CSS = 'https://developer.api.autodesk.com/modelderivative/v2/viewers/7.*/style.min.css'

// Custom toolbar (orbit/pan/section/measure/isolate/hide/explode/reset) is
// built and working, just not needed yet — parked behind this flag rather
// than deleted so it's a one-line flip to bring back. Confirmed 2026-07-21.
const SHOW_TOOLBAR = false

let loadPromise: Promise<void> | null = null
function loadViewerScript(): Promise<void> {
  if (window.Autodesk?.Viewing) return Promise.resolve()
  if (loadPromise) return loadPromise
  loadPromise = new Promise((resolve, reject) => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = VIEWER_CSS
    document.head.appendChild(link)

    const script = document.createElement('script')
    script.src = VIEWER_JS
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Autodesk Viewer SDK'))
    document.head.appendChild(script)
  })
  return loadPromise
}

export interface BimSelection {
  globalId: string
}

export interface BimFocusRequest {
  globalIds: string[] // the assembly's own GUID plus every part's
  // Ghosted-but-visible context works for one assembly's tight neighborhood,
  // but a phase can be hundreds of dbIds scattered across the whole model —
  // at that scale a few blue specks among a mostly-still-visible rest read
  // as barely distinguishable. Fully hiding everything outside the set
  // makes "what's in this phase" unambiguous. Confirmed 2026-07-21.
  hideRest?: boolean
}

// externalId (Navisworks scene-graph path) turned out to be an unreliable
// cross-reference below the assembly level: the Properties API's flat
// per-assembly part indices and the live Viewer's own child numbering
// diverge, and for some assemblies (confirmed 2026-07-20, TH-2RF3 among
// others) the Viewer's tree doesn't even nest the real parts under the
// assembly node at all — isolating the assembly's own dbId showed a tiny,
// unrelated placeholder instead of the real ~456kg of geometry.
//
// The IFC.GLOBALID property does not have this problem: it's the source IFC
// file's own identifier, independent of however Autodesk's translation
// reorganized the scene graph — the exact same "properties.IFC.GLOBALID"
// path our own backend already reads for bim_element.global_id.
// viewer.model.getBulkProperties() over every dbId in the model (~248k on
// the original test file) returns this for exactly the "real" elements —
// 50,428 of them, matching our REST-extraction row count exactly — in under
// a second, and resolves every previously-broken case tested (TH-2RF3,
// TH-1CO4) to real, correctly-scaled geometry. So bim_element.global_id (not
// viewer_id, not external_id) is the reliable runtime cross-reference.
//
// The property to match on is NOT obvious, though: confirmed 2026-07-21 the
// live Viewer exposes a decoy displayName "GUID" (category "Item", a
// generic Navisworks node id) AND, for some elements, more than one
// "GLOBALID" entry across different Pset categories (e.g. a bolt's own "IFC"
// GLOBALID vs. its "Tekla Bolt" Pset's own, different GLOBALID) — matching
// by category AND name together is required, name alone can pick the wrong
// one silently.
// A single getBulkProperties() call handling all dbIds at once worked fine
// up to ~250k dbIds in testing. Chunked + concurrent (4 at once) calls
// against the viewer's model turned out to be the actual regression,
// confirmed 2026-07-21: the exact same file that resolved 100% of GUIDs
// before came back completely empty once chunked concurrently — the SDK
// likely shares internal request state across "simultaneous" calls the same
// way getProperties() (singular) did earlier in this investigation.
// Sequential (concurrency 1) keeps the chunk-size safety margin for very
// large models without re-introducing that crosstalk.
const BULK_PROPS_CHUNK_SIZE = 5000
const BULK_PROPS_CONCURRENCY = 1

// 'IfcGUID' (LcRevitData_Element:...) was a red herring — confirmed
// 2026-07-21 via a full unfiltered property dump that the real, universal
// identity field is GLOBALID under the "IFC" category (LcIFCProperty:
// IFCString), exactly the same "properties.IFC.GLOBALID" path our own
// backend already uses for bim_element.global_id. Some elements ALSO carry
// an unrelated GLOBALID under other categories (e.g. "Tekla Bolt" — that
// Pset's own id, a different value entirely), so the category must be
// checked too, not just the display name.
const GLOBAL_ID_CATEGORY = 'IFC'
const GLOBAL_ID_NAME = 'GLOBALID'

function getBulkPropertiesChunk(viewer: any, dbIds: number[]): Promise<Array<{ dbId: number; properties: Array<{ displayName: string; displayValue: string; displayCategory?: string }> }>> {
  return new Promise((resolve, reject) => {
    viewer.model.getBulkProperties(dbIds, { propFilter: [GLOBAL_ID_NAME] }, resolve, reject)
  })
}

async function buildGuidIndex(viewer: any): Promise<{ guidToDbId: Map<string, number>; dbIdToGuid: Map<number, string> }> {
  const mapping: Record<string, number> = await new Promise((resolve, reject) => {
    viewer.model.getExternalIdMapping(resolve, reject)
  })
  const allDbIds = [...new Set(Object.values(mapping))]

  const chunks: number[][] = []
  for (let i = 0; i < allDbIds.length; i += BULK_PROPS_CHUNK_SIZE) {
    chunks.push(allDbIds.slice(i, i + BULK_PROPS_CHUNK_SIZE))
  }

  const guidToDbId = new Map<string, number>()
  const dbIdToGuid = new Map<number, string>()
  let nextChunk = 0
  const worker = async () => {
    while (nextChunk < chunks.length) {
      const chunk = chunks[nextChunk++]
      const results = await getBulkPropertiesChunk(viewer, chunk)
      for (const r of results) {
        const guid = r.properties.find(p => p.displayCategory === GLOBAL_ID_CATEGORY && p.displayName === GLOBAL_ID_NAME)?.displayValue
        if (!guid) continue
        guidToDbId.set(guid, r.dbId)
        dbIdToGuid.set(r.dbId, guid)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(BULK_PROPS_CONCURRENCY, chunks.length) }, worker))

  return { guidToDbId, dbIdToGuid }
}

// A direct click *in* the 3D view usually lands on a deep representation
// fragment that has no IfcGUID of its own (only ~50k of ~248k dbIds do) —
// walk up the Viewer's own parent links (real tree structure, not string
// parsing) until reaching a dbId that does.
function nearestGuid(dbId: number, tree: any, dbIdToGuid: Map<number, string>): string | null {
  let cur: number | null = dbId
  for (let i = 0; i < 50 && cur != null; i++) {
    const guid = dbIdToGuid.get(cur)
    if (guid) return guid
    const parent: number = tree.getNodeParentId(cur)
    cur = parent === cur ? null : parent
  }
  return null
}

interface Props {
  urn: string
  accessToken: string
  onSelect: (selection: BimSelection | null) => void
  focusRequest?: BimFocusRequest | null
}

export function BimViewport({ urn, accessToken, onSelect, focusRequest }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<any>(null)
  const extensionsRef = useRef<{ section?: any; measure?: any; explode?: any }>({})
  const suppressNextSelectionEventRef = useRef(false)
  const guidToDbIdRef = useRef<Map<string, number>>(new Map())
  const dbIdToGuidRef = useRef<Map<number, string>>(new Map())
  // Building the GUID index takes ~1s for a 50k-element model (one bulk
  // properties scan of every dbId) — a click landing before it resolves
  // must wait, not silently no-op (confirmed 2026-07-20 with the previous
  // externalId-based mapping: an early click otherwise left the camera on
  // the whole-model view with no visible error). Created synchronously here,
  // before any async viewer/model loading starts, so a click racing the very
  // first render still gets a promise that resolves once things catch up —
  // not a stale ref that never gets replaced in time.
  const mappingReadyRef = useRef<Promise<void>>(null!)
  const [loadError, setLoadError] = useState<string | null>(null)
  // Separate from loadError — the model itself loaded fine, only the GUID
  // index (needed for click-to-focus/isolate) failed to build, so this is a
  // non-blocking corner banner rather than replacing the whole viewport.
  const [guidIndexError, setGuidIndexError] = useState<string | null>(null)
  const [sectionOn, setSectionOn] = useState(false)
  const [measureOn, setMeasureOn] = useState(false)
  const [explodeOn, setExplodeOn] = useState(false)

  useEffect(() => {
    let cancelled = false
    let resolveMappingReady: () => void = () => {}
    mappingReadyRef.current = new Promise<void>(resolve => { resolveMappingReady = resolve })

    loadViewerScript()
      .then(() => {
        if (cancelled || !containerRef.current) return
        const Autodesk = window.Autodesk
        Autodesk.Viewing.Initializer({ env: 'AutodeskProduction', accessToken }, () => {
          if (cancelled) return
          const viewer = new Autodesk.Viewing.GuiViewer3D(containerRef.current)
          viewer.start()
          viewerRef.current = viewer
          // Ghosting draws non-isolated geometry as dim/gray instead of fully
          // hiding it — kept on so the focused assembly still reads in the
          // context of the surrounding structure. Set explicitly (not just
          // relying on Autodesk's own default) so a persisted per-browser
          // preference can't silently turn it off.
          viewer.setGhosting(true)

          // setSelectionColor is the built-in highlight overlay path (same
          // one viewer.select() already uses successfully below) — NOT
          // per-fragment material theming, so it isn't affected by the HLOD
          // consolidation issue that made setThemingColor silently no-op on
          // this model (see the focusRequest effect's comment). Confirmed
          // 2026-07-21: steel-blue so the focused assembly reads clearly
          // against the ghosted (dim/gray) rest of the structure.
          if (window.THREE) {
            viewer.setSelectionColor(new window.THREE.Color(0x185FA5), Autodesk.Viewing.SelectionType.MIXED)
          }

          // Autodesk's own right-click "Show properties" reads straight from
          // its internal (unreliable, per the whole external_id investigation
          // above) property lookup — confirmed showing "PURLIN" for a column
          // the tree correctly identified via our own data as TH-2CO2. Our
          // custom toolbar already covers isolate/hide/section/measure/reset,
          // so just disable the native menu rather than fix data it can't be
          // pointed away from.
          if (viewer.contextMenu) viewer.contextMenu.show = () => {}

          viewer.addEventListener(Autodesk.Viewing.GEOMETRY_LOADED_EVENT, async () => {
            // Large models can stream in with a default camera that isn't
            // actually framing any geometry yet — force a fit on first load
            // rather than leaving it to the manual "Reset view" toolbar button.
            viewer.fitToView()
            const [section, measure, explode] = await Promise.all([
              viewer.loadExtension('Autodesk.Section'),
              viewer.loadExtension('Autodesk.Measure'),
              viewer.loadExtension('Autodesk.Explode'),
            ])
            extensionsRef.current = { section, measure, explode }

            try {
              const { guidToDbId, dbIdToGuid } = await buildGuidIndex(viewer)
              guidToDbIdRef.current = guidToDbId
              dbIdToGuidRef.current = dbIdToGuid
              if (guidToDbId.size === 0) {
                // Not an exception — the calls all "succeeded" but found zero
                // IfcGUID properties. Confirmed 2026-07-20 this happens
                // silently when a translation's property schema doesn't
                // expose that attribute the same way (e.g. this could be a
                // non-Tekla source file with different property naming) —
                // every click-to-focus would then just look like nothing
                // happens, with no error anywhere to explain why.
                console.error('BIM GUID index came back empty — no IfcGUID property found on any element')
                setGuidIndexError('No GUID data found in this model — clicking an element may not zoom/focus correctly')
              }
            } catch (err) {
              console.error('BIM GUID index build failed:', err)
              setGuidIndexError(err instanceof Error ? err.message : 'Failed to build the element index — clicking an element may not zoom/focus correctly')
            } finally {
              resolveMappingReady()
            }
          })

          viewer.addEventListener(Autodesk.Viewing.SELECTION_CHANGED_EVENT, (e: { dbIdArray: number[] }) => {
            // Our own focusRequest effect below calls viewer.select() to zoom
            // the tree's chosen representative part into view — that call
            // fires this SAME event. Without this guard it overwrites the
            // property panel's selection (the assembly) with whatever part
            // we zoomed to right after the tree click set it correctly.
            if (suppressNextSelectionEventRef.current) {
              suppressNextSelectionEventRef.current = false
              return
            }
            const dbId = e.dbIdArray[0]
            const guid = dbId == null ? null : nearestGuid(dbId, viewer.model.getInstanceTree(), dbIdToGuidRef.current)
            onSelect(guid == null ? null : { globalId: guid })
          })

          Autodesk.Viewing.Document.load(
            `urn:${urn}`,
            (doc: any) => viewer.loadDocumentNode(doc, doc.getRoot().getDefaultGeometry()),
            (errorCode: number) => setLoadError(`Failed to load model (Autodesk error code ${errorCode})`),
          )
        })
      })
      .catch(err => setLoadError(err.message))

    return () => {
      cancelled = true
      viewerRef.current?.finish()
      viewerRef.current = null
    }
  }, [urn, accessToken])

  // Selecting an assembly in the left tree should select + zoom to it in the
  // 3D view too — a distinct effect (not folded into the SELECTION_CHANGED_EVENT
  // handler above) so a direct click *in* the viewport doesn't also re-trigger
  // a camera fit on itself every time.
  useEffect(() => {
    if (!focusRequest) return
    let cancelled = false

    mappingReadyRef.current.then(() => {
      if (cancelled) return
      const viewer = viewerRef.current
      if (!viewer?.model) return

      const guidToDbId = guidToDbIdRef.current
      const dbIds = focusRequest.globalIds
        .map(g => guidToDbId.get(g))
        .filter((id): id is number => id != null)
      if (!dbIds.length) return

      // setThemingColor was tried here first (custom SSI-red highlight on
      // the focused set, then — 2026-07-21 — light gray on the complement
      // set instead) but never visibly applied either way: confirmed via 3
      // call variants on the focused set (viewer- and model-level, with/
      // without the model arg) plus a full-complement attempt, all silently
      // no-op on this model. Root cause is Autodesk's HLOD mesh
      // consolidation (logged at viewer init — used automatically for large
      // models), which breaks the dbId→fragment mapping per-fragment
      // theming needs — a model-wide rendering constraint, not something
      // tied to which set gets recolored. Falling back to Autodesk's
      // built-in selection highlight (setSelectionColor, a separate overlay
      // pass unaffected by HLOD) for the focused set, and hide/ghost for
      // the rest.
      suppressNextSelectionEventRef.current = true
      viewer.select(dbIds)
      viewer.fitToView(dbIds)
      // Re-applied here too, not just once at startup — Autodesk's saved
      // per-browser preferences (localStorage) can silently override the
      // initial setGhosting(true) call. hideRest (phase focus) turns
      // ghosting off first so isolate() hides the rest outright instead of
      // just dimming it — see BimFocusRequest.hideRest.
      viewer.setGhosting(!focusRequest.hideRest)
      viewer.isolate(dbIds) // isolate() still replaces the prior isolation, so re-focusing on a different assembly/phase naturally clears the old one
    })

    return () => { cancelled = true }
  }, [focusRequest])

  const setNavTool = (tool: 'orbit' | 'pan') => viewerRef.current?.setActiveNavigationTool(tool)

  const toggleSection = () => {
    const ext = extensionsRef.current.section
    if (!ext) return
    if (sectionOn) ext.deactivate()
    else ext.activate('X')
    setSectionOn(!sectionOn)
  }

  const toggleMeasure = () => {
    const ext = extensionsRef.current.measure
    if (!ext) return
    if (measureOn) ext.deactivate()
    else ext.activate()
    setMeasureOn(!measureOn)
  }

  const toggleExplode = () => {
    const ext = extensionsRef.current.explode
    if (!ext) return
    ext.setScale(explodeOn ? 0 : 0.5)
    setExplodeOn(!explodeOn)
  }

  const isolateSelection = () => {
    const viewer = viewerRef.current
    const selected = viewer?.getSelection() ?? []
    if (selected.length) viewer.isolate(selected)
  }

  const hideSelection = () => {
    const viewer = viewerRef.current
    const selected = viewer?.getSelection() ?? []
    if (selected.length) viewer.hide(selected)
  }

  const showAll = () => viewerRef.current?.showAll()

  const resetView = () => viewerRef.current?.fitToView()

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#14171d' }}>
      {SHOW_TOOLBAR && (
        <div className="bim-viewport-toolbar" style={{
          position: 'absolute', top: 12, left: 12, zIndex: 2, display: 'flex', gap: 2,
          background: 'rgba(31,31,31,.85)', borderRadius: 10, padding: 6,
        }}>
          <ToolButton icon={<Orbit size={16} />} title="Orbit" onClick={() => setNavTool('orbit')} />
          <ToolButton icon={<Hand size={16} />} title="Pan" onClick={() => setNavTool('pan')} />
          <ToolSep />
          <ToolButton icon={<Layers size={16} />} title="Section" active={sectionOn} onClick={toggleSection} />
          <ToolButton icon={<Ruler size={16} />} title="Measure" active={measureOn} onClick={toggleMeasure} />
          <ToolButton icon={<ScanEye size={16} />} title="Isolate selected" onClick={isolateSelection} />
          <ToolButton icon={<EyeOff size={16} />} title="Hide selected" onClick={hideSelection} />
          <ToolButton icon={<Boxes size={16} />} title="Explode" active={explodeOn} onClick={toggleExplode} />
          <ToolSep />
          <ToolButton icon={<Maximize size={16} />} title="Reset view / show all" onClick={() => { showAll(); resetView() }} />
        </div>
      )}

      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {loadError && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#EE9B9B', fontSize: 13, textAlign: 'center', padding: 24,
        }}>
          {loadError}
        </div>
      )}

      {guidIndexError && (
        <div style={{
          position: 'absolute', bottom: 12, left: 12, right: 12, zIndex: 2,
          background: 'rgba(133,79,11,.92)', color: 'white', fontSize: 12,
          borderRadius: 8, padding: '8px 12px',
        }}>
          {guidIndexError}
        </div>
      )}
    </div>
  )
}

function ToolButton({ icon, title, onClick, active }: { icon: React.ReactNode; title: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        width: 34, height: 34, borderRadius: 7, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: active ? 'rgba(255,255,255,.18)' : 'transparent', color: active ? '#fff' : '#D6D6D6', cursor: 'pointer',
      }}
    >
      {icon}
    </button>
  )
}

function ToolSep() {
  return <div style={{ width: 1, background: 'rgba(255,255,255,.15)', margin: '4px 4px' }} />
}
