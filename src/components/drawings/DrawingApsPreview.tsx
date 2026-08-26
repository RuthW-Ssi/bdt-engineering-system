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
        Autodesk.Viewing.Initializer({ env: 'AutodeskProduction', accessToken }, () => {
          if (cancelled) return
          const viewer = new Autodesk.Viewing.GuiViewer3D(containerRef.current)
          viewer.start()
          viewerRef.current = viewer

          Autodesk.Viewing.Document.load(
            `urn:${urn}`,
            (doc: any) => viewer.loadDocumentNode(doc, doc.getRoot().getDefaultGeometry()),
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
