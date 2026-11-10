import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { X, Upload, Loader2, AlertTriangle, Check } from 'lucide-react'
import { toast } from 'sonner'
import { FileDropzone } from '../bom/FileDropzone'
import type { FileRejection } from '../bom/FileDropzone'
import { useUploadCuttingPlanWithPreview } from '../../hooks/useCuttingPlan'
import { CuttingPlanPreviewModal } from './CuttingPlanPreviewModal'
import { countDistinctPlates } from '../../lib/cuttingPlan/ncFileCheck'
import { groupPlateFiles, plateFileProblems, plateFileWarnings, PLATE_FILE_KINDS } from '../../lib/cuttingPlan/fileSet'
import { useProjectSelection } from '../../hooks/useProjectSelection'
import { useProjectZones } from '../../hooks/useProjectZones'
import { useSubZones } from '../../hooks/useSubZones'
import type { CuttingPlanDetail } from '../../api/cutting-plan'
import { usePermission } from '../../hooks/usePermission'

// Four files per plate, same name (2026-11-06): .txt (parsed) + .xls + .pdf + .dxf, all kept in storage.
const PLATE_FORMATS = ['.txt', '.xls', '.pdf', '.dxf']
const MAX_FILES = 1000 // = 250 plates; same cap as the server. The biggest real upload is 244 plates (Tao 2026-11-06: raise from 400)
const MAX_FILE_BYTES = 30 * 1024 * 1024 // same as the server
const MAX_TXT_BYTES = 1024 * 1024 // same as the server: a real report is under 60 KB

interface FileEntry {
  file: File
  plateCountHint: number | null // null = not checked yet
}

// Tag was dropped 2026-11-06; Lot is free text, optional.
const FIELDS = [
  { key: 'lot', label: 'Lot', required: false, maxLength: 60 },
  { key: 'description', label: 'Description', required: false, maxLength: 500 },
  { key: 'version', label: 'Version', required: true, maxLength: 20 },
  { key: 'revision', label: 'Revision', required: true, maxLength: 20 },
] as const

type FieldKey = (typeof FIELDS)[number]['key']

const PLAN_TYPES = [
  { key: 'plate', label: 'Plate', ready: true },
  { key: 'shape', label: 'Shape', ready: false },
] as const

// Upload form as a modal on the Cutting Plan list (2026-11-06; was the /cutting-plan/upload page).
export function CuttingPlanUploadModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  // Same project pick as BOM upload: kept in the URL, remembered across visits.
  const { activeProject, projects, selectProject } = useProjectSelection(searchParams, setSearchParams)
  const [values, setValues] = useState<Record<FieldKey, string>>({
    lot: '', description: '', version: '', revision: '',
  })
  // Zone required, sub-zone optional (2026-11-06)
  const [zoneId, setZoneId] = useState('')
  const [subZoneId, setSubZoneId] = useState('')
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [progress, setProgress] = useState<number | null>(null)
  const uploadFlow = useUploadCuttingPlanWithPreview()
  const { data: zonesData } = useProjectZones(activeProject?.id)
  const zones = zonesData ?? []
  const { data: subZonesData } = useSubZones(zoneId ? Number(zoneId) : null)
  const subZones = subZonesData ?? []
  const canWrite = usePermission('cutting-plan', 'create')

  const setValue = (key: FieldKey, value: string) => setValues(prev => ({ ...prev, [key]: value }))

  const onFilesAdded = (accepted: File[], rejected: FileRejection[]) => {
    const over = rejected.filter(r => r.reason.startsWith('Maximum')).length
    const big = rejected.filter(r => r.reason.toLowerCase().includes('mb')).length
    const wrong = rejected.length - over - big
    if (over) toast.error(`อัปได้ไม่เกิน ${MAX_FILES} ไฟล์ (${MAX_FILES / 4} แผ่น) ต่อครั้ง ไม่รับอีก ${over} ไฟล์`)
    if (big) toast.error(`ไฟล์ใหญ่เกิน 30 MB ${big} ไฟล์`)
    if (wrong) toast.error(`ไม่รับไฟล์ ${wrong} ไฟล์ (รับเฉพาะ .txt / .xls / .pdf / .dxf)`)
    setEntries(prev => {
      const have = new Set(prev.map(e => e.file.name))
      return [...prev, ...accepted.filter(f => !have.has(f.name)).map(file => ({ file, plateCountHint: null }))]
    })
    // Client-only hint (also checked authoritatively by the backend preview) —
    // read each .txt and flag ones that likely bundle >1 plate.
    accepted.filter(f => f.name.toLowerCase().endsWith('.txt')).forEach(async file => {
      const text = await file.text()
      const count = countDistinctPlates(text)
      setEntries(prev => prev.map(e => (e.file === file ? { ...e, plateCountHint: count } : e)))
    })
  }

  const removePlate = (names: string[]) => setEntries(prev => prev.filter(e => !names.includes(e.file.name)))
  // Only the .txt is required (2026-11-09). An empty .xls / .pdf / .dxf is left out of the upload, so its
  // plate shows that file as missing (a warning); an empty .txt blocks, the parser can't read it.
  const emptyOther = entries.filter(e => e.file.size === 0 && !e.file.name.toLowerCase().endsWith('.txt'))
  const kept = entries.filter(e => !emptyOther.includes(e))
  const grouping = groupPlateFiles(kept.map(e => e.file.name))
  const emptyTxt = kept.filter(e => e.file.size === 0).map(e => e.file.name)
  const bigTxt = kept.filter(e => e.file.name.toLowerCase().endsWith('.txt') && e.file.size > MAX_TXT_BYTES).map(e => e.file.name)
  const problems = [
    ...plateFileProblems(grouping),
    ...(emptyTxt.length ? [`ไฟล์ว่าง (0 byte): ${emptyTxt.join(', ')}`] : []),
    ...(bigTxt.length ? [`Not a nesting report, larger than 1 MB: ${bigTxt.join(', ')}`] : []),
  ]
  const warnings = [
    ...plateFileWarnings(grouping),
    ...(emptyOther.length ? [`ไฟล์ว่าง (0 byte) ไม่ถูกเก็บ: ${emptyOther.map(e => e.file.name).join(', ')}`] : []),
  ]
  const hint = (name?: string) => entries.find(e => e.file.name === name)?.plateCountHint ?? null

  const requiredFilled = !!activeProject && zoneId !== '' && FIELDS.filter(f => f.required).every(f => values[f.key].trim() !== '')
  const canSubmit = canWrite && requiredFilled && entries.length > 0 && problems.length === 0 && !uploadFlow.uploadMutation.isPending && !uploadFlow.isPreviewing

  const handleError = (err: unknown) => {
    const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
    toast.error(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Cutting plan upload failed — please try again'))
    setProgress(null)
  }

  const handleSuccess = (res: CuttingPlanDetail) => {
    setProgress(null)
    onClose()
    navigate(`/cutting-plan/${res.id}`)
  }

  // Preview posts only the .txt files plus every file name (for the four-files check);
  // save stages all files to storage first, then posts their keys.
  const buildInput = () => {
    const previewForm = new FormData()
    kept.filter(e => e.file.name.toLowerCase().endsWith('.txt')).forEach(e => previewForm.append('files', e.file))
    FIELDS.forEach(f => previewForm.append(f.key, values[f.key]))
    previewForm.append('project_id', String(activeProject!.id))
    previewForm.append('zone_id', zoneId)
    if (subZoneId) previewForm.append('sub_zone_id', subZoneId)
    previewForm.append('file_names', JSON.stringify(kept.map(e => e.file.name)))
    return {
      previewForm,
      files: kept.map(e => e.file),
      fields: {
        project_id: activeProject!.id, zone_id: Number(zoneId), sub_zone_id: subZoneId ? Number(subZoneId) : undefined,
        lot: values.lot.trim() || undefined, description: values.description.trim() || undefined,
        version: values.version.trim(), revision: values.revision.trim(),
      },
    }
  }

  const handleSubmit = async () => {
    if (!canSubmit) return
    setProgress(0)
    try {
      await uploadFlow.submit(buildInput(), pct => setProgress(pct))
      setProgress(null)
    } catch (err: unknown) {
      handleError(err)
    }
  }

  const handleConfirm = async () => {
    setProgress(0)
    try {
      const res = await uploadFlow.confirm()
      if (res == null) return
      handleSuccess(res)
    } catch (err: unknown) {
      handleError(err)
    }
  }

  const busy = uploadFlow.isPreviewing || uploadFlow.uploadMutation.isPending

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget && !busy) onClose() }}
    >
      <div style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth: 560, maxHeight: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column' }}>
        <div className="flex items-center justify-between" style={{ padding: '20px 24px 0' }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: '#1F1F1F' }}>Upload Cutting Plan</span>
          <button
            onClick={onClose}
            disabled={busy}
            className="flex items-center justify-center rounded hover:bg-chrome-50 disabled:opacity-40"
            style={{ width: 28, height: 28, color: '#8E8E8E' }}
          >
            <X size={14} />
          </button>
        </div>

      <div style={{ overflowY: 'auto', padding: '16px 24px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Project */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>
            Project <span style={{ color: '#C8202A' }}>*</span>
          </label>
          <select
            style={{ width: '100%', height: 36, padding: '0 10px', fontSize: 13, border: '1px solid #E0E0E0', borderRadius: 6, background: 'white' }}
            value={activeProject?.id ?? ''}
            onChange={e => {
              const project = projects.find(p => p.id === Number(e.target.value))
              if (project) { selectProject(project); setZoneId(''); setSubZoneId('') }
            }}
          >
            {projects.length === 0
              ? <option value="" disabled>No projects found</option>
              : projects.map(p => <option key={p.id} value={p.id}>{p.project_code} — {p.name}</option>)
            }
          </select>
        </div>

        {/* Zone */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>
            Zone <span style={{ color: '#C8202A' }}>*</span>
          </label>
          <select
            disabled={!activeProject}
            style={{ width: '100%', height: 36, padding: '0 10px', fontSize: 13, border: `1px solid ${zoneId ? '#C8202A' : '#E0E0E0'}`, borderRadius: 6, background: activeProject ? 'white' : '#F5F5F5' }}
            value={zoneId}
            onChange={e => { setZoneId(e.target.value); setSubZoneId('') }}
          >
            <option value="">Select Zone...</option>
            {zones.map(z => <option key={z.id} value={z.id}>{z.code} — {z.label}</option>)}
          </select>
        </div>

        {/* Sub-zone */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>
            Sub-zone
            <span style={{ fontSize: 11, fontWeight: 400, color: '#8E8E8E', marginLeft: 6 }}>
              {subZones.length === 0 && zoneId ? '(this zone has no sub-zones)' : '(optional)'}
            </span>
          </label>
          <select
            disabled={!zoneId || subZones.length === 0}
            style={{ width: '100%', height: 36, padding: '0 10px', fontSize: 13, border: `1px solid ${subZoneId ? '#C8202A' : '#E0E0E0'}`, borderRadius: 6, background: zoneId && subZones.length > 0 ? 'white' : '#F5F5F5', opacity: !zoneId || subZones.length === 0 ? 0.5 : 1 }}
            value={subZoneId}
            onChange={e => setSubZoneId(e.target.value)}
          >
            <option value="">(None)</option>
            {subZones.map(sz => <option key={sz.id} value={sz.id}>{sz.code ? `${sz.code} — ` : ''}{sz.name}</option>)}
          </select>
        </div>

        {FIELDS.map(f => (
          <div key={f.key}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>
              {f.label} {f.required
                ? <span style={{ color: '#C8202A' }}>*</span>
                : <span style={{ fontSize: 11, fontWeight: 400, color: '#8E8E8E', marginLeft: 6 }}>(optional)</span>}
            </label>
            <input
              value={values[f.key]}
              maxLength={f.maxLength}
              onChange={e => setValue(f.key, e.target.value)}
              style={{ width: '100%', height: 36, padding: '0 10px', fontSize: 13, border: '1px solid #E0E0E0', borderRadius: 6, background: 'white' }}
            />
          </div>
        ))}

        {/* Type — Shape (CutLogic PDF for pipe / rod) is the next step */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 8 }}>
            Cutting Plan Type <span style={{ color: '#C8202A' }}>*</span>
          </label>
          <div style={{ display: 'flex', gap: 12 }}>
            {PLAN_TYPES.map(t => (
              <label
                key={t.key}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, cursor: t.ready ? 'pointer' : 'default',
                  padding: '8px 16px', borderRadius: 8, fontSize: 13,
                  border: `1px solid ${t.key === 'plate' ? '#C8202A' : '#E0E0E0'}`,
                  background: t.key === 'plate' ? '#FEF2F2' : 'white',
                  color: t.ready ? '#1F1F1F' : '#CCC',
                  opacity: t.ready ? 1 : 0.4,
                }}
              >
                <input type="radio" value={t.key} checked={t.key === 'plate'} disabled={!t.ready} readOnly style={{ accentColor: '#C8202A' }} />
                {t.label}
                {!t.ready && <span style={{ fontSize: 11, color: '#8E8E8E' }}>(coming soon)</span>}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>
            ไฟล์แผนตัด <span style={{ color: '#C8202A' }}>*</span>
            <span style={{ fontSize: 11, fontWeight: 400, color: '#8E8E8E', marginLeft: 6 }}>
              ทุกแผ่นต้องมี 4 ไฟล์ชื่อเดียวกัน: .txt .xls .pdf .dxf
            </span>
          </label>
          <FileDropzone
            maxFiles={MAX_FILES}
            currentCount={entries.length}
            acceptedFormats={PLATE_FORMATS}
            maxSizeBytes={MAX_FILE_BYTES}
            hint={`.txt .xls .pdf .dxf · ไม่เกิน ${MAX_FILES} ไฟล์ (${MAX_FILES / 4} แผ่น) · ไฟล์ละไม่เกิน 30 MB`}
            onFilesAdded={onFilesAdded}
            disabled={false}
          />
        </div>

        {entries.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', marginBottom: 6 }}>
              แผ่น ({grouping.plates.length}) · ไฟล์ ({entries.length})
            </div>
            <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid #E0E0E0', borderRadius: 6, background: '#FAFAFA' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ color: '#8E8E8E', textAlign: 'left' }}>
                    <th style={{ padding: '6px 8px', fontWeight: 600 }}>แผ่น</th>
                    {PLATE_FILE_KINDS.map(k => <th key={k} style={{ padding: '6px 4px', fontWeight: 600, textAlign: 'center' }}>.{k}</th>)}
                    <th style={{ width: 28 }} />
                  </tr>
                </thead>
                <tbody>
                  {grouping.plates.map(p => {
                    const many = hint(p.files.txt)
                    return (
                      <tr key={p.plate} style={{ borderTop: '1px solid #ECECEC', background: !p.files.txt ? '#FEF2F2' : p.missing.length ? '#FFFBEB' : 'white' }}>
                        <td style={{ padding: '5px 8px', fontFamily: 'monospace', color: '#333' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            {p.plate}
                            {many != null && many > 1 && (
                              <span title={`May contain ~${many} plates — only 1 will be captured`} style={{ display: 'flex', color: '#B45309' }}><AlertTriangle size={13} /></span>
                            )}
                          </span>
                        </td>
                        {PLATE_FILE_KINDS.map(k => (
                          <td key={k} style={{ textAlign: 'center' }} title={p.files[k] ?? `ขาด .${k}`}>
                            {p.files[k] ? <Check size={13} style={{ color: '#15803D', display: 'inline' }} /> : <X size={13} style={{ color: '#C8202A', display: 'inline' }} />}
                          </td>
                        ))}
                        <td>
                          <button onClick={() => removePlate(Object.values(p.files) as string[])} aria-label={`เอาแผ่น ${p.plate} ออก`}
                            style={{ fontSize: 11, color: '#8E8E8E', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {problems.length > 0 && (
              <div style={{ marginTop: 8, background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 6, padding: '8px 10px', fontSize: 12, color: '#991B1B', lineHeight: 1.6 }}>
                <div style={{ fontWeight: 600 }}>บันทึกไม่ได้จนกว่าจะแก้</div>
                {problems.map(m => <div key={m}>{m}</div>)}
                {(grouping.notAllowed.length > 0 || grouping.duplicates.length > 0) && (
                  <button onClick={() => removePlate([...grouping.notAllowed, ...grouping.duplicates])}
                    style={{ marginTop: 4, fontSize: 12, color: '#991B1B', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    เอาไฟล์ที่ไม่รับ/ซ้ำออก
                  </button>
                )}
              </div>
            )}
            {warnings.length > 0 && (
              <div style={{ marginTop: 8, background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 6, padding: '8px 10px', fontSize: 12, color: '#92400E', lineHeight: 1.6, maxHeight: 140, overflowY: 'auto' }}>
                <div style={{ fontWeight: 600 }}>บันทึกได้ แต่บางแผ่นไฟล์ไม่ครบ ({warnings.length})</div>
                {warnings.map(m => <div key={m}>{m}</div>)}
              </div>
            )}
          </div>
        )}

        {progress !== null && (
          <div>
            <div style={{ height: 6, background: '#E0E0E0', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progress}%`, background: '#C8202A', transition: 'width 0.2s' }} />
            </div>
            <div style={{ fontSize: 12, color: '#8E8E8E', marginTop: 4, textAlign: 'right' }}>{progress}%</div>
          </div>
        )}

        <div className="flex items-center justify-between" style={{ paddingTop: 4 }}>
          <button onClick={onClose} disabled={busy} style={{ fontSize: 13, color: '#555', background: 'none', border: 'none', cursor: 'pointer' }}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex items-center gap-1.5 rounded-md text-white disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ height: 36, padding: '0 20px', fontSize: 13, fontWeight: 600, background: '#C8202A' }}
          >
            {uploadFlow.isPreviewing
              ? <><Loader2 size={14} className="animate-spin" />Parsing...</>
              : uploadFlow.uploadMutation.isPending
                ? <><Loader2 size={14} className="animate-spin" />Saving...</>
                : <><Upload size={14} />Upload</>}
          </button>
        </div>
      </div>
      </div>

      {uploadFlow.pendingPreview && (
        <CuttingPlanPreviewModal
          preview={uploadFlow.pendingPreview}
          onCancel={uploadFlow.cancel}
          onConfirm={handleConfirm}
          isUploading={uploadFlow.uploadMutation.isPending}
        />
      )}
    </div>
  )
}
