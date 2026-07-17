import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Upload, Loader2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { FileDropzone } from '../components/bom/FileDropzone'
import type { FileRejection } from '../components/bom/FileDropzone'
import { useUploadCuttingPlanWithPreview } from '../hooks/useCuttingPlan'
import { CuttingPlanPreviewModal } from '../components/cuttingPlan/CuttingPlanPreviewModal'
import { countDistinctPlates } from '../lib/cuttingPlan/ncFileCheck'
import { useProjects } from '../hooks/useProjects'
import type { CuttingPlanDetail } from '../api/cutting-plan'

const TXT_FORMATS = ['.txt']

interface FileEntry {
  file: File
  plateCountHint: number | null // null = not checked yet
}

const FIELDS = [
  { key: 'tag', label: 'Tag', required: true },
  { key: 'description', label: 'Description', required: false },
  { key: 'version', label: 'Version', required: true },
  { key: 'revision', label: 'Revision', required: true },
] as const

type FieldKey = (typeof FIELDS)[number]['key']

export function CuttingPlanUpload() {
  const navigate = useNavigate()
  const [values, setValues] = useState<Record<FieldKey, string>>({
    tag: '', description: '', version: '', revision: '',
  })
  const [projectCode, setProjectCode] = useState('')
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [progress, setProgress] = useState<number | null>(null)
  const uploadFlow = useUploadCuttingPlanWithPreview()
  const { data: projectsData } = useProjects({ limit: 100 })
  const projects = projectsData?.items ?? []

  const setValue = (key: FieldKey, value: string) => setValues(prev => ({ ...prev, [key]: value }))

  const onFilesAdded = (accepted: File[], _rejected: FileRejection[]) => {
    const newEntries: FileEntry[] = accepted.map(file => ({ file, plateCountHint: null }))
    setEntries(prev => [...prev, ...newEntries])
    // Client-only hint (also checked authoritatively by the backend preview) —
    // read each file's text and flag ones that likely bundle >1 plate.
    accepted.forEach(async file => {
      const text = await file.text()
      const count = countDistinctPlates(text)
      setEntries(prev => prev.map(e => (e.file === file ? { ...e, plateCountHint: count } : e)))
    })
  }

  const removeFile = (index: number) => setEntries(prev => prev.filter((_, i) => i !== index))

  const requiredFilled = FIELDS.filter(f => f.required).every(f => values[f.key].trim() !== '')
  const canSubmit = requiredFilled && entries.length > 0 && !uploadFlow.uploadMutation.isPending && !uploadFlow.isPreviewing

  const handleError = (err: unknown) => {
    const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
    toast.error(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Cutting plan upload failed — please try again'))
    setProgress(null)
  }

  const handleSuccess = (res: CuttingPlanDetail) => {
    setProgress(null)
    navigate(`/cutting-plan/${res.id}`)
  }

  const buildFormData = () => {
    const formData = new FormData()
    entries.forEach(e => formData.append('files', e.file))
    FIELDS.forEach(f => formData.append(f.key, values[f.key]))
    if (projectCode) formData.append('project_code', projectCode)
    return formData
  }

  const handleSubmit = async () => {
    if (!canSubmit) return
    setProgress(0)
    try {
      await uploadFlow.submit(buildFormData(), pct => setProgress(pct))
      setProgress(null)
    } catch (err: unknown) {
      handleError(err)
    }
  }

  const handleConfirm = async () => {
    try {
      const res = await uploadFlow.confirm()
      if (res == null) return
      handleSuccess(res)
    } catch (err: unknown) {
      handleError(err)
    }
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)', overflowY: 'auto' }}>
      <div className="bg-white flex items-center gap-3 border-b border-chrome-100 px-6" style={{ height: 56, flexShrink: 0 }}>
        <button
          onClick={() => navigate('/cutting-plan')}
          className="flex items-center justify-center rounded hover:bg-chrome-50"
          style={{ width: 32, height: 32, color: '#8E8E8E' }}
        >
          <ArrowLeft size={16} />
        </button>
        <span style={{ fontSize: 16, fontWeight: 600, color: '#1F1F1F' }}>Upload Cutting Plan</span>
      </div>

      <div style={{ maxWidth: 640, width: '100%', margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>
            Project
            <span style={{ fontSize: 11, fontWeight: 400, color: '#8E8E8E', marginLeft: 6 }}>
              optional — pre-fills project code on every order part from this upload
            </span>
          </label>
          <select
            value={projectCode}
            onChange={e => setProjectCode(e.target.value)}
            style={{ width: '100%', height: 36, padding: '0 10px', fontSize: 13, border: '1px solid #E0E0E0', borderRadius: 6, background: 'white' }}
          >
            <option value="">Select project...</option>
            {projects.map(p => <option key={p.id} value={p.project_code}>{p.project_code} — {p.name}</option>)}
          </select>
        </div>

        {FIELDS.map(f => (
          <div key={f.key}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>
              {f.label} {f.required && <span style={{ color: '#C8202A' }}>*</span>}
            </label>
            <input
              value={values[f.key]}
              onChange={e => setValue(f.key, e.target.value)}
              style={{ width: '100%', height: 36, padding: '0 10px', fontSize: 13, border: '1px solid #E0E0E0', borderRadius: 6, background: 'white' }}
            />
          </div>
        ))}

        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>
            Cutting Plan Reports <span style={{ color: '#C8202A' }}>*</span>
            <span style={{ fontSize: 11, fontWeight: 400, color: '#8E8E8E', marginLeft: 6 }}>
              .txt nesting reports — any number of files
            </span>
          </label>
          <FileDropzone
            maxFiles={50}
            currentCount={entries.length}
            acceptedFormats={TXT_FORMATS}
            hint=".txt · up to 50 files"
            onFilesAdded={onFilesAdded}
            disabled={false}
          />
        </div>

        {entries.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', marginBottom: 6 }}>FILES ({entries.length})</div>
            <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, border: '1px solid #E0E0E0', borderRadius: 6, padding: '6px', background: '#FAFAFA' }}>
              {entries.map((e, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', background: 'white', borderRadius: 4, border: '1px solid #ECECEC', fontSize: 12, flexShrink: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                    <span style={{ color: '#333', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.file.name}</span>
                    {e.plateCountHint != null && e.plateCountHint > 1 && (
                      <span title={`May contain ~${e.plateCountHint} plates — only 1 will be captured`} style={{ display: 'flex', alignItems: 'center', color: '#B45309', flexShrink: 0 }}>
                        <AlertTriangle size={13} />
                      </span>
                    )}
                  </span>
                  <button onClick={() => removeFile(i)} style={{ fontSize: 11, color: '#8E8E8E', background: 'none', border: 'none', cursor: 'pointer', marginLeft: 8, flexShrink: 0 }}>✕</button>
                </div>
              ))}
            </div>
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
          <button onClick={() => navigate('/cutting-plan')} style={{ fontSize: 13, color: '#555', background: 'none', border: 'none', cursor: 'pointer' }}>
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
