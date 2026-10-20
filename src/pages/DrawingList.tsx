import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Upload, Trash2, Download, FileText, Loader2, RefreshCw, Search } from 'lucide-react'
import { useProjectSelection } from '../hooks/useProjectSelection'
import { useProjectZones } from '../hooks/useProjectZones'
import { useSubZones } from '../hooks/useSubZones'
import { useZoneDrawings, useUploadDrawings, useDeleteDrawing, useDrawingBomMarks } from '../hooks/useDrawings'
import { downloadDrawing, type Drawing } from '../api/drawings'
import { buildMarkRows, type MarkRow, type MarkRevGroup } from '../lib/drawingMarkRows'
import { useConfirm } from '../components/ui/ConfirmDialog'
import { useIsCustomer } from '../hooks/useIsCustomer'
import { DrawingUploadModal } from '../components/drawings/DrawingUploadModal'
import { DrawingPreviewPanel } from '../components/drawings/DrawingPreviewPanel'

const filterSelectStyle = { height: 32, padding: '0 8px', fontSize: 13, borderRadius: 6, border: '1px solid #E0E0E0', background: 'white' }
const revSelectStyle = { fontSize: 12, padding: '1px 4px', borderRadius: 4, border: '1px solid #D0D0D0', background: 'white' }

type FileType = 'dwg' | 'pdf'

// .pdf-only since 2026-09-15's DWG removal — DrawingList always calls this
// with 'pdf' now (the browse-side DWG/PDF toggle this fed was removed the
// same day; 'dwg' support stays on the type signature only because the
// function itself is otherwise still a correct, generic, tested filter).
export function filterDrawingsByType(drawings: Drawing[], fileType: FileType): Drawing[] {
  const suffix = `.${fileType}`
  return drawings.filter(d => d.file_name.toLowerCase().endsWith(suffix))
}

// A null mark (a handful of legacy rows predate the mark/rev backfill — see
// api/drawings.ts) has no string to key a Record<mark, rev> entry with;
// there's at most one such row (buildMarkRows collects every null-mark
// drawing into one), so an empty-string sentinel is safe — a real mark is
// never '' (the upload review table treats blank input as unparsed, not "").
const markKey = (mark: string | null) => mark ?? ''

// Same format MoDetail.tsx / WoDetail.tsx / MoHistoryTimeline.tsx already use
// for a timestamp that needs to show both date and time, not just one.
function formatUploadedAt(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// The rev actually shown for a row: the user's pick if it still exists on
// this row, else the highest rev — a pick can stop existing mid-session
// (e.g. its last file gets deleted while it's the one being viewed), so this
// is recomputed every render rather than stored and corrected after the fact.
function resolveRev(row: MarkRow, pickedRev: Record<string, number>): number {
  const picked = pickedRev[markKey(row.mark)]
  return picked != null && row.revs.some(r => r.rev === picked) ? picked : row.revs[0].rev
}

// Deleting the only file of the CURRENT (top) rev makes the previous rev
// current with no extra write (current-rev.ts mirrors this on the backend) —
// told to the user before they confirm, not discovered after. Returns null
// when this delete doesn't change what's current (not the top rev, more than
// one file left in it, or there's no older rev to fall back to).
function revFallbackNote(row: MarkRow, rev: number, revGroup: MarkRevGroup): string | null {
  if (row.revs[0].rev !== rev || revGroup.files.length !== 1 || row.revs.length < 2) return null
  return `Rev ${row.revs[1].rev} will become the current rev.`
}

export function DrawingList() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { activeProject, projects, selectProject } = useProjectSelection(searchParams, setSearchParams)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const confirm = useConfirm()
  // Customers: view/download only — no upload/delete, no dates (stripped),
  // no rev picker (the API already returns only the current rev for them).
  const customer = useIsCustomer()

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

  const { data: drawingsListRaw = [], isLoading: drawingsLoading, isError: drawingsError, refetch } = useZoneDrawings(numericZoneId, numericSubZoneId)
  const { data: bomMarks = [] } = useDrawingBomMarks(numericZoneId, numericSubZoneId)
  const uploadDrawingsMutation = useUploadDrawings({
    projectId, projectCode: activeProject?.project_code,
    zoneId: numericZoneId, zoneCode: selectedZone?.code,
    subZoneId: numericSubZoneId, subZoneCode: selectedSubZone?.code ?? null,
  })
  const deleteDrawingMutation = useDeleteDrawing(numericZoneId, numericSubZoneId)

  // PDF only — no browse-side type toggle anymore. Legacy pre-2026-09-15
  // .dwg files stay in storage/DB (not deleted) but are no longer browsable
  // through this page at all, at the user's explicit request.
  const drawingsList = filterDrawingsByType(drawingsListRaw, 'pdf')

  // One row per mark, each holding every rev (not just current) so the
  // per-row rev <select> below can offer them — see lib/drawingMarkRows.ts.
  const markRows = buildMarkRows(drawingsList)

  const [search, setSearch] = useState('')
  const [pickedRev, setPickedRev] = useState<Record<string, number>>({})
  // Zone/sub-zone switched — any search text or manual rev pick was scoped
  // to the old one.
  useEffect(() => {
    setSearch('')
    setPickedRev({})
  }, [numericZoneId, numericSubZoneId])

  const filteredMarkRows = search.trim() === ''
    ? markRows
    : markRows.filter(row => row.mark !== null && row.mark.toLowerCase().includes(search.trim().toLowerCase()))

  // Derived, not stored directly — a plain effect-set selection can go stale
  // (the previewed file gets deleted, or the search/rev pick changes what's
  // in view) without a clean single event to reset it on. Falls back to the
  // first visible file automatically whenever the manual pick isn't valid
  // anymore.
  const visibleFiles = filteredMarkRows.flatMap(row => {
    const rev = resolveRev(row, pickedRev)
    return row.revs.find(r => r.rev === rev)?.files ?? []
  })
  const [manualDrawingId, setManualDrawingId] = useState<number | null>(null)
  const selectedDrawing = visibleFiles.find(d => d.id === manualDrawingId) ?? visibleFiles[0] ?? null

  const handleDelete = async (dwg: Drawing, row: MarkRow, rev: number, revGroup: MarkRevGroup) => {
    const fallback = revFallbackNote(row, rev, revGroup)
    const message = fallback ? `This cannot be undone. ${fallback}` : 'This cannot be undone'
    const ok = await confirm({ title: `Delete "${dwg.file_name}"?`, message, variant: 'danger', confirmLabel: 'Delete' })
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
                {markRows.length} mark{markRows.length === 1 ? '' : 's'}
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
          {!customer && (
          <button
            onClick={() => setShowUploadModal(true)}
            disabled={!zoneId}
            title={!zoneId ? 'Select a zone above first' : undefined}
            className="flex items-center gap-1.5 rounded-md text-white disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, background: drawingsList.length === 0 ? '#C8202A' : '#0C447C' }}
          >
            <Upload size={14} />{drawingsList.length === 0 ? 'Upload Drawing' : 'Update'}
          </button>
          )}
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
            <div style={{ fontSize: 13 }}>No PDF files uploaded for {selectedZone?.code ?? 'this zone'} yet</div>
            {!customer && (
            <button
              onClick={() => setShowUploadModal(true)}
              className="flex items-center gap-1.5 rounded-md text-white"
              style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 600, background: '#C8202A', marginTop: 4 }}
            >
              <Upload size={14} />Upload Drawing
            </button>
            )}
          </div>
        )}
        {zoneId && !drawingsLoading && !drawingsError && drawingsList.length > 0 && (
          <div className="flex flex-col gap-2" style={{ height: '100%', minHeight: 0 }}>
            <div style={{ position: 'relative', width: 380 }}>
              <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#8E8E8E', pointerEvents: 'none' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="ค้นหา mark…"
                style={{ width: '100%', height: 32, padding: '0 8px 0 28px', fontSize: 13, borderRadius: 6, border: '1px solid #E0E0E0' }}
              />
            </div>
            <div className="flex gap-4" style={{ flex: 1, minHeight: 0 }}>
              <div
                className="bg-white rounded-lg border border-chrome-100"
                style={{ width: 380, flexShrink: 0, overflowY: 'auto' }}
              >
                {filteredMarkRows.length === 0 && (
                  <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: '#8E8E8E' }}>ไม่พบ mark ที่ค้นหา</div>
                )}
                {filteredMarkRows.map(row => {
                  const rev = resolveRev(row, pickedRev)
                  const revGroup = row.revs.find(r => r.rev === rev)!
                  const files = revGroup.files
                  const hasMultipleRevs = row.revs.length > 1
                  const isSingleFile = files.length === 1
                  const label = row.mark ?? 'ไม่ระบุ mark'

                  return (
                    <div key={markKey(row.mark)} style={{ borderBottom: '1px solid #ECECEC' }}>
                      <div
                        onClick={isSingleFile ? () => setManualDrawingId(files[0].id) : undefined}
                        className="flex items-center gap-2 hover:bg-chrome-50"
                        style={{
                          padding: '10px 12px', cursor: isSingleFile ? 'pointer' : 'default',
                          background: isSingleFile && selectedDrawing?.id === files[0].id ? '#FCEBEB' : undefined,
                        }}
                      >
                        <FileText size={15} style={{ color: '#8E8E8E', flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="flex items-center gap-1.5">
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#1F1F1F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                            {hasMultipleRevs && !customer ? (
                              <select
                                value={rev}
                                onClick={e => e.stopPropagation()}
                                onChange={e => {
                                  const newRev = Number(e.target.value)
                                  setPickedRev(prev => ({ ...prev, [markKey(row.mark)]: newRev }))
                                }}
                                style={revSelectStyle}
                              >
                                {row.revs.map(r => <option key={r.rev} value={r.rev}>Rev {r.rev}</option>)}
                              </select>
                            ) : (
                              <span style={{ fontSize: 12, color: '#8E8E8E' }}>Rev {rev}</span>
                            )}
                          </div>
                          {!customer && <div style={{ fontSize: 11, color: '#8E8E8E' }}>{formatUploadedAt(revGroup.uploadedAt)}</div>}
                        </div>
                        {isSingleFile && (
                          <>
                            <button
                              onClick={e => { e.stopPropagation(); downloadDrawing(files[0].file_key, files[0].file_name) }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0C447C', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                            >
                              <Download size={14} />
                            </button>
                            {!customer && (
                            <button
                              onClick={e => { e.stopPropagation(); handleDelete(files[0], row, rev, revGroup) }}
                              disabled={deleteDrawingMutation.isPending}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C8202A', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                            >
                              <Trash2 size={14} />
                            </button>
                            )}
                          </>
                        )}
                      </div>
                      {!isSingleFile && files.map(f => (
                        <div
                          key={f.id}
                          onClick={() => setManualDrawingId(f.id)}
                          className="flex items-center gap-2 hover:bg-chrome-50"
                          style={{
                            padding: '8px 12px 8px 32px', cursor: 'pointer',
                            background: selectedDrawing?.id === f.id ? '#FCEBEB' : undefined,
                          }}
                        >
                          <FileText size={13} style={{ color: '#C2C2C2', flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.file_name}</div>
                          <button
                            onClick={e => { e.stopPropagation(); downloadDrawing(f.file_key, f.file_name) }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0C447C', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                          >
                            <Download size={13} />
                          </button>
                          {!customer && (
                          <button
                            onClick={e => { e.stopPropagation(); handleDelete(f, row, rev, revGroup) }}
                            disabled={deleteDrawingMutation.isPending}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C8202A', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                          >
                            <Trash2 size={13} />
                          </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
              <div className="bg-white rounded-lg border border-chrome-100" style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                <DrawingPreviewPanel drawing={selectedDrawing} />
              </div>
            </div>
          </div>
        )}
      </div>

      {showUploadModal && zoneId && !customer && (
        <DrawingUploadModal
          scopeLabel={scopeLabel}
          existing={drawingsList}
          bomMarks={bomMarks}
          isUploading={uploadDrawingsMutation.isPending}
          onConfirm={items => uploadDrawingsMutation.mutate(items, { onSuccess: () => setShowUploadModal(false) })}
          onClose={() => setShowUploadModal(false)}
        />
      )}
    </div>
  )
}
