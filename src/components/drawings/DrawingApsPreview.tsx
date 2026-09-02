import { useEffect, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'

// Autodesk Viewer SDK is a global UMD script, not an npm/ESM package — same
// approach as BimViewport.tsx, loaded on demand so it never touches the Vite
// build. Duplicated here (not imported from bim/) rather than shared: it's
// ~15 lines of pure script-injection with no feature-specific logic, and
// keeping it local avoids coupling this file's load order to BIM's.
declare global {
  interface Window {
    Autodesk: any
  }
}

const VIEWER_JS = 'https://developer.api.autodesk.com/modelderivative/v2/viewers/7.*/viewer3D.min.js'
const VIEWER_CSS = 'https://developer.api.autodesk.com/modelderivative/v2/viewers/7.*/style.min.css'

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

interface Props {
  urn: string
  accessToken: string
}

// Minimal APS Viewer bootstrap for a DWG's 2D preview. Deliberately does NOT
// reuse BimViewport.tsx's GuiViewer3D setup — that component carries a large
// amount of IFC-specific logic (GLOBALID-based dbId indexing, per-status
// theming, assembly/phase isolate/focus) with no equivalent for a flat DWG
// drawing. This just loads the urn's 2D view and renders it: no toolbar, no
// selection handling, no property panel.
export function DrawingApsPreview({ urn, accessToken }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<any>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoadError(null)

    loadViewerScript()
      .then(() => {
        if (cancelled || !containerRef.current) return
        const Autodesk = window.Autodesk
        // Our OSS buckets live in the JPN region (see aps-client.service.ts).
        // Without this flag the Viewer SDK's own manifest/derivative CDN
        // lookups default to the legacy US-only endpoint and 404 on
        // anything translated in one of Autodesk's newer regions (JPN/GBR/
        // DEU/CAN/IND) — must be set before Initializer, has no effect after.
        // https://aps.autodesk.com/blog/expanding-regional-offerings-uk-germany-japan-india-and-canada-phase-ii
        Autodesk.Viewing.FeatureFlags.set('DS_ENDPOINTS', true)
        Autodesk.Viewing.Initializer({ env: 'AutodeskProduction', accessToken }, () => {
          if (cancelled) return
          const viewer = new Autodesk.Viewing.GuiViewer3D(containerRef.current)
          viewer.start()
          viewerRef.current = viewer

          Autodesk.Viewing.Document.load(
            `urn:${urn}`,
            (doc: any) => {
              // A DWG's 2D translation commonly produces one geometry node
              // per layout (Model Space + however many Paper Space sheets
              // the source file has), and none of them may be flagged
              // "useAsDefault" — getDefaultGeometry() then returns undefined,
              // and handing that to loadDocumentNode() throws inside
              // Autodesk's own bundle (confirmed live 2026-08-26: "Cannot
              // read properties of undefined (reading 'search')" in
              // Viewer3D.js). Fall back to the first real 2D geometry node.
              const defaultGeometry = doc.getRoot().getDefaultGeometry()
              const geometry = defaultGeometry
                ?? Autodesk.Viewing.Document.getSubItemsWithProperties(doc.getRoot(), { type: 'geometry', role: '2d' }, true)[0]
              if (!geometry) {
                setLoadError('This DWG has no 2D sheet Autodesk could translate')
                return
              }
              viewer.loadDocumentNode(doc, geometry)
            },
            (errorCode: number) => setLoadError(`Failed to load preview (Autodesk error code ${errorCode})`),
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

  if (loadError) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2"
        style={{ height: '100%', color: '#C8202A', fontSize: 13, padding: 24, textAlign: 'center' }}
      >
        <AlertTriangle size={24} />{loadError}
      </div>
    )
  }

  return <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }} />
}
