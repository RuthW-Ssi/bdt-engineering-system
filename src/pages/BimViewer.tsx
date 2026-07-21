import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { BimElement } from '../api/bim'
import { toast } from 'sonner'
import { Loader2, AlertTriangle, Cuboid as CuboidIcon, Upload, RefreshCcw, RefreshCw } from 'lucide-react'
import { BimViewport } from '../components/bim/BimViewport'
import { BimElementTree } from '../components/bim/BimElementTree'
import { BimPropertyPanel } from '../components/bim/BimPropertyPanel'
import { BimUploadModal } from '../components/bim/BimUploadModal'
import { useProjectSelection } from '../hooks/useProjectSelection'
import {
  useBimModels, useUploadBimModel, useBimStatus, useBimElements, useBimViewerToken, useRetryBimModel, useLatestBimVersion,
} from '../hooks/useBim'
import type { BimSelection, BimFocusRequest } from '../components/bim/BimViewport'

const filterSelectStyle = { height: 30, padding: '0 8px', fontSize: 12, borderRadius: 6, border: '1px solid #E0E0E0', background: 'white' }

// Display-only label — the real uploaded filename stays untouched in the DB
// (still useful for tracing back to the original Tekla export). Computed
// from the CURRENT project code rather than stored at upload time, so it
// never goes stale if the code is renamed later.
function formatModelLabel(
  model: { major_version: number; minor_version: number },
  project: { project_code: string } | null,
): string {
  const parts = ['M', project?.project_code].filter(Boolean)
  return `${parts.join('-')} v${model.major_version}.${model.minor_version}`
}

export function BimViewer() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { activeProject, projects, selectProject } = useProjectSelection(searchParams, setSearchParams)

  const [currentId, setCurrentId] = useState<number | null>(null)
  const [selectedGlobalId, setSelectedGlobalId] = useState<string | null>(null)
  const [focusRequest, setFocusRequest] = useState<BimFocusRequest | null>(null)
  const [versionChoice, setVersionChoice] = useState<'minor' | 'major'>('minor')
  const [showUploadModal, setShowUploadModal] = useState(false)
  const toastedRef = useRef<Record<number, string>>({})

  const hasScope = !!activeProject
  const { data: models, refetch } = useBimModels(hasScope ? { projectId: activeProject!.id } : undefined)
  const uploadMutation = useUploadBimModel()
  const retryMutation = useRetryBimModel()
  const { data: latestVersion } = useLatestBimVersion(activeProject?.id)
  const { data: status } = useBimStatus(currentId)
  const { data: elements } = useBimElements(status?.status === 'complete' ? currentId : null)
  const { data: viewerToken } = useBimViewerToken(status?.status === 'complete' ? currentId : null)

  // Reset selection state (but not currentId — the auto-select effect below
  // owns that) whenever the project changes.
  const lastProjectIdRef = useRef(activeProject?.id)
  useEffect(() => {
    const id = activeProject?.id
    if (lastProjectIdRef.current === id) return
    lastProjectIdRef.current = id
    setSelectedGlobalId(null)
    setVersionChoice('minor')
  }, [activeProject?.id])

  // Auto-display the latest model for the current project — mirrors
  // BomList's "always select the latest dispatch" behavior instead of
  // making the user pick from a dropdown. `models` is already ordered
  // newest-first by the backend, so models[0] is the latest version.
  // Re-fires only when the latest id itself changes (new project, new
  // upload) — manually picking an older version from the dropdown below
  // survives incidental refetches.
  const latestModelId = models?.[0]?.id ?? null
  useEffect(() => {
    setCurrentId(latestModelId)
  }, [latestModelId])

  useEffect(() => {
    if (!currentId || !status) return
    if (status.status === 'failed' && toastedRef.current[currentId] !== 'failed') {
      toastedRef.current[currentId] = 'failed'
      toast.error('Model translation failed', { description: status.error ?? 'Model Derivative job failed' })
    }
  }, [currentId, status])

  const handleFilesAdded = (accepted: File[]) => {
    const file = accepted[0]
    if (!file || !activeProject) return
    uploadMutation.mutate(
      {
        file,
        projectId: activeProject.id,
        versionChoice: latestVersion?.major_version != null ? versionChoice : 'minor',
      },
      { onSuccess: model => { setCurrentId(model.id); setShowUploadModal(false) } },
    )
  }

  const handleRetry = () => {
    if (!currentId) return
    retryMutation.mutate(currentId)
  }

  const selectedElement = elements?.find(e => e.global_id === selectedGlobalId) ?? null

  // Marks repeat across physically distinct assemblies (a purlin type reused
  // 257 times in this file) — these are every OTHER assembly sharing the
  // currently selected one's mark, in stable list order, for the "next
  // instance" cycling button.
  const instanceSiblings = selectedElement?.ifc_type === 'IfcElementAssembly'
    ? elements?.filter(e => e.ifc_type === 'IfcElementAssembly' && e.mark === selectedElement.mark) ?? []
    : []
  const instanceIndex = instanceSiblings.findIndex(e => e.global_id === selectedElement?.global_id)

  const handleViewerSelect = (selection: BimSelection | null) => {
    setSelectedGlobalId(selection?.globalId ?? null)
  }

  // Scoped by assembly_global_id, not assembly_mark — a part's mark-based
  // match would otherwise pull in parts from every OTHER assembly sharing
  // the same mark too (confirmed 2026-07-21: 43% of marks in this file have
  // more than one physical instance).
  const focusAssemblyInstance = (assembly: BimElement) => {
    setSelectedGlobalId(assembly.global_id)
    // Resolving just the assembly's own id isn't enough — confirmed
    // 2026-07-20 that for some assemblies its subtree in the live Viewer is
    // a tiny unrelated placeholder, not the real parts. Send every part's
    // GUID too; BimViewport resolves whichever ones actually match.
    const parts = elements?.filter(e => e.assembly_global_id === assembly.global_id) ?? []
    const globalIds = [assembly, ...parts]
      .map(e => e.global_id)
      .filter((g): g is string => g != null)
    if (globalIds.length) {
      setFocusRequest({ globalIds })
    }
  }

  const handleSelectMark = (mark: string) => {
    const el = elements?.find(e => e.ifc_type === 'IfcElementAssembly' && e.mark === mark)
    if (el) focusAssemblyInstance(el)
  }

  // No single element to show in the property panel here — a phase spans
  // many assemblies and parts at once, so this clears selection and just
  // isolates/highlights the whole set in the 3D view.
  const handleSelectPhase = (phase: string | null) => {
    setSelectedGlobalId(null)
    const globalIds = (elements ?? [])
      .filter(e => e.phase === phase)
      .map(e => e.global_id)
      .filter((g): g is string => g != null)
    if (globalIds.length) {
      setFocusRequest({ globalIds, hideRest: true })
    }
  }

  const handleNextInstance = () => {
    if (instanceSiblings.length < 2 || instanceIndex === -1) return
    focusAssemblyInstance(instanceSiblings[(instanceIndex + 1) % instanceSiblings.length])
  }

  const hasModels = !!models && models.length > 0
  const currentModel = models?.find(m => m.id === currentId)
  const currentModelLabel = currentModel ? formatModelLabel(currentModel, activeProject) : undefined

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      {/* ── Header ────────────────────────────────────────────── */}
      <div className="bg-white flex items-center justify-between border-b border-chrome-100 px-6" style={{ height: 56, flexShrink: 0 }}>
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 18, fontWeight: 600, color: '#1F1F1F' }}>BIM Viewer</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="flex items-center justify-center rounded hover:bg-chrome-50"
            style={{ width: 32, height: 32, color: '#8E8E8E' }}
          >
            <RefreshCw size={14} />
          </button>
          {hasScope && (
            hasModels ? (
              <button
                onClick={() => setShowUploadModal(true)}
                className="flex items-center gap-1.5 rounded-md text-white"
                style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, background: '#185FA5' }}
              >
                <RefreshCcw size={14} />Update Model
              </button>
            ) : (
              <button
                onClick={() => setShowUploadModal(true)}
                className="flex items-center gap-1.5 rounded-md text-white"
                style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, background: '#C8202A' }}
              >
                <Upload size={14} />Upload Model
              </button>
            )
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 px-4" style={{ height: 44, background: '#F5F5F5', borderTop: '1px solid #E8E8E8', borderBottom: '1px solid #E8E8E8', flexShrink: 0, flexWrap: 'wrap' }}>
        <select
          value={activeProject?.id ?? ''}
          onChange={e => {
            const project = projects.find(p => p.id === Number(e.target.value))
            if (project) selectProject(project)
          }}
          style={{ ...filterSelectStyle, minWidth: 180 }}
        >
          {projects.length === 0
            ? <option value="" disabled>No projects found</option>
            : projects.map(p => <option key={p.id} value={p.id}>{p.project_code} — {p.name}</option>)}
        </select>
        {hasModels && (
          <select
            value={currentId ?? ''}
            onChange={e => setCurrentId(e.target.value ? Number(e.target.value) : null)}
            style={{ ...filterSelectStyle, minWidth: 200 }}
          >
            <option value="">— Select a model —</option>
            {models!.map(m => <option key={m.id} value={m.id}>{formatModelLabel(m, activeProject)}</option>)}
          </select>
        )}
      </div>

      <div className="flex flex-col flex-1" style={{ padding: '20px 28px', overflow: 'hidden', minHeight: 0 }}>
        {!hasScope && (
          <div className="flex items-center justify-center flex-1" style={{ color: '#8E8E8E', fontSize: 13 }}>
            Select a Project first to upload or view a model
          </div>
        )}

        {hasScope && (!currentId || status?.status == null) && (
          <NoModelState hasModels={hasModels} onUpload={() => setShowUploadModal(true)} />
        )}

        {currentId && (status?.status === 'pending' || status?.status === 'processing' || status?.status === 'extracting') && (
          <ProcessingState
            key={`${currentId}-${status.status}`}
            filename={currentModelLabel}
            stage={status.status === 'extracting' ? 'extracting' : 'translating'}
            progress={status.progress}
            onRetry={handleRetry}
            isRetrying={retryMutation.isPending}
          />
        )}

        {currentId && status?.status === 'failed' && (
          <FailedState
            filename={currentModelLabel}
            error={status.error}
            onRetry={handleRetry}
            onUploadDifferent={() => setShowUploadModal(true)}
            isRetrying={retryMutation.isPending}
          />
        )}

        {currentId && status?.status === 'complete' && !elements && <ViewerSkeleton />}

        {currentId && status?.status === 'complete' && elements && (
          <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr 300px', gap: 16, flex: 1, minHeight: 0 }}>
            <div style={{ background: 'white', border: '1px solid #E0E0E0', borderRadius: 12, overflow: 'hidden', minHeight: 0 }}>
              <BimElementTree elements={elements} selectedMark={selectedElement?.ifc_type === 'IfcElementAssembly' ? selectedElement.mark : null} onSelectMark={handleSelectMark} onSelectPhase={handleSelectPhase} />
            </div>
            <div style={{ borderRadius: 12, overflow: 'hidden' }}>
              {viewerToken
                ? <BimViewport urn={viewerToken.urn} accessToken={viewerToken.access_token} onSelect={handleViewerSelect} focusRequest={focusRequest} />
                : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#F0F0F0', border: '0.5px solid #E0E0E0', color: '#ABABAB' }}>
                    <Loader2 size={20} className="animate-spin" />
                  </div>}
            </div>
            <div style={{ background: 'white', border: '1px solid #E0E0E0', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid #E0E0E0', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#8E8E8E' }}>
                Properties
              </div>
              <BimPropertyPanel
                element={selectedElement}
                instanceIndex={instanceIndex}
                instanceCount={instanceSiblings.length}
                onNextInstance={handleNextInstance}
              />
            </div>
          </div>
        )}
      </div>

      {showUploadModal && activeProject && (
        <BimUploadModal
          projectLabel={`${activeProject.project_code} — ${activeProject.name}`}
          latestVersion={latestVersion?.major_version != null ? { major: latestVersion.major_version, minor: latestVersion.minor_version! } : null}
          versionChoice={versionChoice}
          onVersionChoiceChange={setVersionChoice}
          isUploading={uploadMutation.isPending}
          onFilesAdded={handleFilesAdded}
          onClose={() => setShowUploadModal(false)}
        />
      )}
    </div>
  )
}

// Mirrors the shape of the real tree/viewport/property-panel grid it's
// standing in for — shown while `elements`/`viewerToken` are still loading
// right after status flips to "complete", so the page doesn't go blank
// (confirmed 2026-07-21: that gap previously rendered nothing at all).
function ViewerSkeleton() {
  const treeRowWidths = [72, 55, 88, 64, 45, 80, 68, 58, 92, 50]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr 300px', gap: 16, flex: 1, minHeight: 0 }}>
      <div style={{ background: 'white', border: '1px solid #E0E0E0', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid #E0E0E0' }}>
          <div className="bim-skeleton" style={{ height: 12, width: 90, borderRadius: 4 }} />
        </div>
        <div style={{ margin: '10px 12px' }}>
          <div className="bim-skeleton" style={{ height: 30, borderRadius: 7 }} />
        </div>
        <div style={{ flex: 1, padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 14, overflow: 'hidden' }}>
          {treeRowWidths.map((w, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="bim-skeleton" style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0 }} />
              <div className="bim-skeleton" style={{ height: 10, borderRadius: 4, width: `${w}%` }} />
            </div>
          ))}
        </div>
      </div>

      <div style={{ borderRadius: 12, overflow: 'hidden', background: '#F0F0F0', border: '0.5px solid #E0E0E0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ABABAB' }}>
        <Loader2 size={22} className="animate-spin" />
      </div>

      <div style={{ background: 'white', border: '1px solid #E0E0E0', borderRadius: 12, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid #E0E0E0' }}>
          <div className="bim-skeleton" style={{ height: 12, width: 70, borderRadius: 4 }} />
        </div>
        <div style={{ padding: '14px' }}>
          <div className="bim-skeleton" style={{ height: 10, width: 55, borderRadius: 4, marginBottom: 16 }} />
          {[[60, 90], [70, 110], [50, 130], [65, 70], [55, 100], [45, 80]].map(([kw, vw], i) => (
            <div key={i} className="flex items-center justify-between" style={{ padding: '9px 0', borderBottom: '1px solid #F5F5F5' }}>
              <div className="bim-skeleton" style={{ height: 10, width: kw, borderRadius: 4 }} />
              <div className="bim-skeleton" style={{ height: 10, width: vw, borderRadius: 4 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function NoModelState({ hasModels, onUpload }: { hasModels: boolean; onUpload: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 flex-1" style={{ color: '#8E8E8E' }}>
      <CuboidIcon size={40} style={{ opacity: 0.2 }} />
      <div style={{ fontSize: 14, fontWeight: 500 }}>{hasModels ? 'Select a model above to view it' : 'No models yet for this project'}</div>
      <button
        onClick={onUpload}
        className="flex items-center gap-1.5 rounded-md text-white"
        style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, background: hasModels ? '#185FA5' : '#C8202A', marginTop: 8 }}
      >
        {hasModels ? <RefreshCcw size={14} /> : <Upload size={14} />}{hasModels ? 'Upload New Model' : 'Upload First Model'}
      </button>
    </div>
  )
}

const PROCESSING_STEPS = [
  { key: 'upload', label: 'Upload' },
  { key: 'translate', label: 'Translate' },
  { key: 'extract', label: 'Extract' },
  { key: 'ready', label: 'Ready' },
] as const

function ProcessingState({ filename, stage, progress, onRetry, isRetrying }: {
  filename?: string; stage: 'translating' | 'extracting'; progress?: string; onRetry: () => void; isRetrying: boolean
}) {
  // A crash mid-extraction (server OOM, etc.) can leave a model parked in
  // "extracting" forever — checkStatus() only advances a model OUT of that
  // state, it never re-attempts extraction on its own poll. Surface a manual
  // way out after a while rather than trapping the user in an infinite
  // spinner with no recourse (confirmed real 2026-07-21: two models stuck
  // this way after a container OOM crash needed a direct DB/API fix).
  const STUCK_THRESHOLD_MS = 90_000
  const [showStuckRetry, setShowStuckRetry] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setShowStuckRetry(true), STUCK_THRESHOLD_MS)
    return () => clearTimeout(timer)
  }, [])

  // Step index of the stage currently RUNNING — everything before it is done
  // (checkmark), everything after is still upcoming.
  const activeIndex = stage === 'translating' ? 1 : 2

  // Autodesk's manifest.progress (e.g. "45% complete") only describes ITS
  // OWN job — it has nothing to say about our own extraction step, so only
  // trust it as a determinate bar during "translating". "extracting" always
  // falls back to the indeterminate animation below.
  const translatedPct = stage === 'translating' ? Number(progress?.match(/(\d+)\s*%/)?.[1]) : NaN
  const determinatePct = Number.isFinite(translatedPct) ? translatedPct : null

  return (
    <div style={{ maxWidth: 560, margin: '60px auto', background: 'white', border: '1px solid #E5E7EB', boxShadow: '0 8px 32px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)', borderRadius: 14, padding: '40px 32px', textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, margin: '0 auto 20px', borderRadius: 14, background: '#FCEBEB', color: '#C8202A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={24} className="animate-spin" />
      </div>
      <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>{stage === 'translating' ? 'Translating model...' : 'Extracting element data...'}</h3>
      <p style={{ margin: '0 0 24px', color: '#8E8E8E', fontSize: 13 }}>{filename}</p>

      <div className="flex items-center" style={{ marginBottom: 22 }}>
        {PROCESSING_STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center" style={{ flex: i < PROCESSING_STEPS.length - 1 ? 1 : undefined }}>
            <div className="flex flex-col items-center" style={{ minWidth: 60 }}>
              <div style={{
                width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700, flexShrink: 0,
                background: i <= activeIndex ? '#C8202A' : '#E0E0E0',
                color: i <= activeIndex ? 'white' : '#ABABAB',
                boxShadow: i === activeIndex ? '0 0 0 4px rgba(200,32,42,0.15)' : 'none',
              }}>
                {i < activeIndex ? '✓' : i + 1}
              </div>
              <span style={{ fontSize: 11, marginTop: 6, color: i <= activeIndex ? '#333' : '#ABABAB', whiteSpace: 'nowrap' }}>{s.label}</span>
            </div>
            {i < PROCESSING_STEPS.length - 1 && (
              <div style={{ flex: 1, height: 2, background: i < activeIndex ? '#C8202A' : '#E0E0E0', margin: '0 4px 18px' }} />
            )}
          </div>
        ))}
      </div>

      <div style={{ height: 8, borderRadius: 4, background: '#F0F0F0', overflow: 'hidden', marginBottom: 8, position: 'relative' }}>
        {determinatePct != null
          ? <div style={{ height: '100%', width: `${determinatePct}%`, background: '#C8202A', borderRadius: 4, transition: 'width 0.4s ease' }} />
          : <div className="bim-progress-indeterminate" style={{ position: 'absolute', top: 0, bottom: 0, width: '28%', background: '#C8202A', borderRadius: 4 }} />}
      </div>
      <p style={{ margin: '0 0 20px', color: '#8E8E8E', fontSize: 12 }}>
        {determinatePct != null ? `${determinatePct}%` : stage === 'translating' ? 'Autodesk is processing...' : 'Saving element data to the database...'}
      </p>

      <div style={{ background: '#FCEBEB', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#C8202A', textAlign: 'left' }}>
        Safe to leave this page — processing continues on the server. Reopen this model anytime to check its status.
      </div>

      {showStuckRetry && (
        <div style={{ marginTop: 16, fontSize: 12, color: '#8E8E8E' }}>
          Taking longer than expected?{' '}
          <button
            onClick={onRetry}
            disabled={isRetrying}
            style={{ color: '#C8202A', fontWeight: 600, background: 'none', border: 'none', padding: 0, cursor: isRetrying ? 'default' : 'pointer', textDecoration: 'underline' }}
          >
            {isRetrying ? 'Retrying...' : 'Retry'}
          </button>
        </div>
      )}
    </div>
  )
}

function FailedState({ filename, error, onRetry, onUploadDifferent, isRetrying }: {
  filename?: string; error: string | null; onRetry: () => void; onUploadDifferent: () => void; isRetrying: boolean
}) {
  return (
    <div style={{ maxWidth: 560, margin: '60px auto', background: 'white', border: '1px solid #E5E7EB', boxShadow: '0 8px 32px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)', borderRadius: 14, padding: '48px 32px', textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, margin: '0 auto 16px', borderRadius: 14, background: '#FCEBEB', color: '#C8202A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <AlertTriangle size={24} />
      </div>
      <h3 style={{ margin: '0 0 6px', fontSize: 16 }}>Model translation failed</h3>
      <p style={{ margin: '0 0 20px', color: '#8E8E8E', fontSize: 13 }}>{filename}</p>
      {error && (
        <div style={{ background: '#FCEBEB', color: '#8A1520', borderRadius: 8, padding: '10px 14px', fontSize: 12, textAlign: 'left', margin: '0 auto 20px', fontFamily: 'IBM Plex Mono, monospace' }}>
          {error}
        </div>
      )}
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={onRetry}
          disabled={isRetrying}
          className="flex items-center gap-1.5 rounded-md text-white disabled:opacity-40"
          style={{ height: 36, padding: '0 20px', fontSize: 13, fontWeight: 600, background: '#C8202A' }}
        >
          {isRetrying ? <Loader2 size={14} className="animate-spin" /> : null}Retry
        </button>
        <button
          onClick={onUploadDifferent}
          className="rounded-md"
          style={{ height: 36, padding: '0 20px', fontSize: 13, fontWeight: 600, background: 'transparent', border: '1px solid #C2C2C2' }}
        >
          Upload a different file
        </button>
      </div>
    </div>
  )
}
