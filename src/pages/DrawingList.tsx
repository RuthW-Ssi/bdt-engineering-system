import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Upload, Trash2, Download, FileText, Loader2, RefreshCw } from 'lucide-react'
import { useProjectSelection } from '../hooks/useProjectSelection'
import { useProjectZones } from '../hooks/useProjectZones'
import { useSubZones } from '../hooks/useSubZones'
import { useZoneDrawings, useUploadDrawings, useDeleteDrawing } from '../hooks/useDrawings'
import { downloadDrawing, type Drawing } from '../api/drawings'
import { useConfirm } from '../components/ui/ConfirmDialog'
import { DrawingUploadModal } from '../components/drawings/DrawingUploadModal'
import { DrawingPreviewPanel } from '../components/drawings/DrawingPreviewPanel'

const filterSelectStyle = { height: 32, padding: '0 8px', fontSize: 13, borderRadius: 6, border: '1px solid #E0E0E0', background: 'white' }

export function DrawingList() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { activeProject, projects, selectProject } = useProjectSelection(searchParams, setSearchParams)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const confirm = useConfirm()

  const projectId = activeProject?.id

  const [zoneId, setZoneId] = useState('')
  const [subZoneId, setSubZoneId] = useState('')
  const { data: zonesData } = useProjectZones(projectId)
  const zones = zonesData ?? []
  const { data: subZonesData } = useSubZones(zoneId ? parseInt(zoneId) : null)
  const subZones = subZonesData ?? []
  const selectedZone = zones.find(z => z.id === (zoneId ? parseInt(zoneId) : undefined))
  const selectedSubZone = subZones.find(sz => sz.id === (subZoneId ? parseInt(subZoneId) : undefined))

  const handleZoneChange = (val: string) => {
    setZoneId(val)
    setSubZoneId('')
  }

  // Project switched — any zone/sub-zone pick was scoped to the old one.
  useEffect(() => {
    handleZoneChange('')
  }, [projectId])

  const numericZoneId = zoneId ? parseInt(zoneId) : undefined
  const numericSubZoneId = subZoneId ? parseInt(subZoneId) : null

  const { data: drawingsList = [], isLoading: drawingsLoading, isError: drawingsError, refetch } = useZoneDrawings(numericZoneId, numericSubZoneId)
  const uploadDrawingsMutation = useUploadDrawings({
    projectId, projectCode: activeProject?.project_code,
    zoneId: numericZoneId, zoneCode: selectedZone?.code,
    subZoneId: numericSubZoneId, subZoneCode: selectedSubZone?.code ?? null,
  })
  const deleteDrawingMutation = useDeleteDrawing(numericZoneId, numericSubZoneId)

  // Versioning is sparse — each version is "what was added in that upload
  // action", not a full snapshot (see wiki: features/file-storage-gcs-backup-plan.md).
  // Scoped per zone(+sub-zone), not per project, since 2026-08-25's Zone
  // rescope (see wiki: features/drawing-zone-scope-plan.md). So this is a
  // changelog filter over the already-fetched list, not a separate fetch per
  // version, and not a BIM-style current-snapshot switcher.
  //
  // `selectedVersion` is derived, not stored directly — a manually-picked
  // version can stop existing mid-session (its last file gets deleted while
  // it's the one being viewed), and a plain useEffect keyed on `latestVersion`
  // wouldn't re-fire in that case (latestVersion itself doesn't change), which
  // left the filter pinned to a now-empty version showing a blank list despite
  // a nonzero drawing count. Recomputing this way self-corrects every render
  // instead of needing to catch every case that should invalidate the pick.
  const versions = [...new Set(drawingsList.map(d => d.version))].sort((a, b) => b - a)
  const latestVersion = versions[0] ?? null
  const [manualVersion, setManualVersion] = useState<number | null>(null)
  useEffect(() => {
    setManualVersion(null) // zone/sub-zone switched — any manual pick was scoped to the old one
  }, [numericZoneId, numericSubZoneId])
  const selectedVersion = manualVersion != null && versions.includes(manualVersion) ? manualVersion : latestVersion
  const visibleDrawings = selectedVersion == null ? drawingsList : drawingsList.filter(d => d.version === selectedVersion)

  // Same derived-value approach as `selectedVersion` above, same reason —
  // a plain effect-set selection can go stale (e.g. the previewed file gets
  // deleted, or the version filter changes and it's no longer in view)
  // without a clean single event to reset it on. Falls back to the first
  // visible row automatically whenever the manual pick isn't valid anymore.
  const [manualDrawingId, setManualDrawingId] = useState<number | null>(null)
  const selectedDrawing = visibleDrawings.find(d => d.id === manualDrawingId) ?? visibleDrawings[0] ?? null

  const handleDelete = async (dwg: Drawing) => {
    const ok = await confirm({ title: `Delete "${dwg.file_name}"?`, message: 'This cannot be undone', variant: 'danger', confirmLabel: 'Delete' })
    if (!ok) return
    deleteDrawingMutation.mutate(dwg.id)
  }

  const scopeLabel = activeProject
    ? `${activeProject.project_code} — ${activeProject.name}${selectedZone ? ` · ${selectedZone.code}` : ''}${selectedSubZone ? ` / ${selectedSubZone.code ?? selectedSubZone.name}` : ''}`
    : ''

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      {/* ── Header ────────────────────────────────────────────── */}
      <div className="bg-white flex items-center justify-between border-b border-chrome-100 px-6" style={{ height: 56, flexShrink: 0 }}>
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 18, fontWeight: 600, color: '#1F1F1F' }}>Drawings</span>
          {zoneId && (
            <>
              <span style={{ color: '#C2C2C2' }}>·</span>
              <span style={{ background: '#F5F5F5', border: '1px solid #E0E0E0', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 500, color: '#555' }}>
                {drawingsList.length} drawing{drawingsList.length === 1 ? '' : 's'}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={!zoneId}
            className="flex items-center justify-center rounded hover:bg-chrome-50 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ width: 32, height: 32, color: '#8E8E8E' }}
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => setShowUploadModal(true)}
            disabled={!zoneId}
            title={!zoneId ? 'Select a zone above first' : undefined}
            className="flex items-center gap-1.5 rounded-md text-white disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, background: drawingsList.length === 0 ? '#C8202A' : '#0C447C' }}
          >
            <Upload size={14} />{drawingsList.length === 0 ? 'Upload Drawing' : 'Update'}
          </button>
        </div>
      </div>

      {/* ── Filter bar — project + zone + sub-zone pickers (mirrors BomUpload.tsx) ──── */}
      <div className="flex items-center gap-2 px-6 border-b border-chrome-100" style={{ height: 44, background: '#F5F5F5', flexShrink: 0 }}>
        <select
          value={activeProject?.id ?? ''}
          onChange={e => {
            const project = projects.find(p => p.id === Number(e.target.value))
            if (project) selectProject(project)
          }}
          style={{ ...filterSelectStyle, minWidth: 220 }}
        >
          {projects.length === 0
            ? <option value="" disabled>No projects found</option>
            : projects.map(p => <option key={p.id} value={p.id}>{p.project_code} — {p.name}</option>)}
        </select>
        <select
          disabled={!activeProject}
          value={zoneId}
          onChange={e => handleZoneChange(e.target.value)}
          style={{ ...filterSelectStyle, minWidth: 160, opacity: activeProject ? 1 : 0.5 }}
        >
          <option value="">Select Zone...</option>
          {zones.map(z => <option key={z.id} value={z.id}>{z.code} — {z.label}</option>)}
        </select>
        <select
          disabled={!zoneId || subZones.length === 0}
          value={subZoneId}
          onChange={e => setSubZoneId(e.target.value)}
          style={{ ...filterSelectStyle, minWidth: 160, opacity: !zoneId || subZones.length === 0 ? 0.5 : 1 }}
        >
          <option value="">{subZones.length === 0 && zoneId ? '(no sub-zones)' : '(No sub-zone)'}</option>
          {subZones.map(sz => <option key={sz.id} value={sz.id}>{sz.code ? `${sz.code} — ` : ''}{sz.name}</option>)}
        </select>
        {versions.length > 0 && (
          <select
            value={selectedVersion ?? ''}
            onChange={e => setManualVersion(e.target.value ? Number(e.target.value) : null)}
            style={{ ...filterSelectStyle, minWidth: 160 }}
          >
            {versions.map(v => {
              const count = drawingsList.filter(d => d.version === v).length
              return <option key={v} value={v}>v{v} ({count} file{count === 1 ? '' : 's'})</option>
            })}
          </select>
        )}
      </div>

      {/* ── Body ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 24 }}>
        {!zoneId && (
          <div className="flex flex-col items-center justify-center gap-3" style={{ padding: 64, color: '#8E8E8E' }}>
            <FileText size={32} style={{ opacity: 0.3 }} />
            <div style={{ fontSize: 13 }}>{!activeProject ? 'Select a project above to view or upload its drawings' : 'Select a zone above to view or upload its drawings'}</div>
          </div>
        )}

        {zoneId && drawingsLoading && (
          <div className="flex items-center justify-center gap-2" style={{ padding: 64, color: '#8E8E8E' }}>
            <Loader2 size={20} className="animate-spin" />Loading...
          </div>
        )}
        {zoneId && drawingsError && !drawingsLoading && (
          <div className="flex flex-col items-center justify-center gap-2" style={{ padding: 64, color: '#C8202A', fontSize: 13 }}>
            Failed to load drawings — please try again
          </div>
        )}
        {zoneId && !drawingsLoading && !drawingsError && drawingsList.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3" style={{ padding: 64, color: '#8E8E8E' }}>
            <FileText size={32} style={{ opacity: 0.3 }} />
            <div style={{ fontSize: 13 }}>No drawings uploaded for {selectedZone?.code ?? 'this zone'} yet</div>
            <button
              onClick={() => setShowUploadModal(true)}
              className="flex items-center gap-1.5 rounded-md text-white"
              style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, background: '#C8202A', marginTop: 4 }}
            >
              <Upload size={14} />Upload Drawing
            </button>
          </div>
        )}
        {zoneId && !drawingsLoading && !drawingsError && drawingsList.length > 0 && (
          <div className="flex gap-4" style={{ height: '100%', minHeight: 0 }}>
            <div
              className="bg-white rounded-lg border border-chrome-100"
              style={{ width: 380, flexShrink: 0, overflowY: 'auto' }}
            >
              {visibleDrawings.map(dwg => (
                <div
                  key={dwg.id}
                  onClick={() => setManualDrawingId(dwg.id)}
                  className="flex items-center gap-2 border-b border-chrome-100 hover:bg-chrome-50"
                  style={{
                    padding: '10px 12px', cursor: 'pointer',
                    background: selectedDrawing?.id === dwg.id ? '#FCEBEB' : undefined,
                  }}
                >
                  <FileText size={15} style={{ color: '#8E8E8E', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: '#1F1F1F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dwg.file_name}</div>
                    <div style={{ fontSize: 11, color: '#8E8E8E' }}>{new Date(dwg.create_date).toLocaleDateString()}</div>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); downloadDrawing(dwg.file_key, dwg.file_name) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0C447C', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                  >
                    <Download size={14} />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(dwg) }}
                    disabled={deleteDrawingMutation.isPending}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C8202A', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-lg border border-chrome-100" style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
              <DrawingPreviewPanel drawing={selectedDrawing} />
            </div>
          </div>
        )}
      </div>

      {showUploadModal && zoneId && (
        <DrawingUploadModal
          scopeLabel={scopeLabel}
          isUploading={uploadDrawingsMutation.isPending}
          onFilesConfirmed={files => uploadDrawingsMutation.mutate(files, { onSuccess: () => setShowUploadModal(false) })}
          onClose={() => setShowUploadModal(false)}
        />
      )}
    </div>
  )
}
