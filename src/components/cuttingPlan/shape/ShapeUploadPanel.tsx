import { useState } from 'react'
import { Upload, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { FileDropzone } from '../../bom/FileDropzone'
import type { FileRejection } from '../../bom/FileDropzone'
import { classifyShapeFiles } from '../../../lib/cuttingPlan/shapeFiles'
import { useUploadShapeWithPreview } from '../../../hooks/useCuttingPlan'
import { ShapePreviewModal } from './ShapePreviewModal'
import type { CuttingPlanDetail, SaveCuttingPlanPayload, ShapePreviewResult } from '../../../api/cutting-plan'

// Cutting Plan Shape (2026-11-10): drop the whole CutLogic folder; only CP-*.pdf is uploaded, one per size.
const FORMATS = ['.pdf', '.xls', '.xlsx']
const MAX_FILES = 200 // a folder holds CP + PS per size plus part lists; at most 60 CP files are saved
const MAX_CP_FILES = 60
const MAX_CP_BYTES = 5 * 1024 * 1024 // same as the server
const MAX_FILE_BYTES = 30 * 1024 * 1024

interface Props {
  // project + zone pick and the form fields from the modal; null until required fields are filled
  fields: Omit<SaveCuttingPlanPayload, 'staged'> | null
  canWrite: boolean
  onCancel: () => void
  onSaved: (res: CuttingPlanDetail) => void
}

export function ShapeUploadPanel({ fields, canWrite, onCancel, onSaved }: Props) {
  const [files, setFiles] = useState<File[]>([])
  const [progress, setProgress] = useState<number | null>(null)
  const [preview, setPreview] = useState<ShapePreviewResult | null>(null)
  const { preview: previewMutation, upload } = useUploadShapeWithPreview()

  const { cp, notUsed, rejected } = classifyShapeFiles(files.map(f => f.name))
  const cpFiles = files.filter(f => cp.some(c => c.name === f.name))
  const big = cpFiles.filter(f => f.size > MAX_CP_BYTES).map(f => f.name)
  const problems = [
    ...rejected.map(n => `${n}: not a CutLogic CP-*.pdf (PS-*.pdf and Part Lists are left out)`),
    ...big.map(n => `${n}: larger than 5 MB`),
    ...(cp.length > MAX_CP_FILES ? [`${cp.length} CP files; the limit is ${MAX_CP_FILES} per upload`] : []),
  ]
  const busy = previewMutation.isPending || upload.isPending
  const canSubmit = canWrite && !!fields && cp.length > 0 && problems.length === 0 && !busy

  const onFilesAdded = (accepted: File[], rej: FileRejection[]) => {
    if (rej.length) toast.error(`${rej.length} file(s) not added: only .pdf / .xls / .xlsx up to 30 MB`)
    setFiles(prev => [...prev, ...accepted.filter(f => !prev.some(p => p.name === f.name))])
  }

  const fail = (err: unknown) => {
    const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message
    toast.error(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Cutting plan upload failed — please try again'))
    setProgress(null)
  }

  const submit = async () => {
    if (!canSubmit) return
    const form = new FormData()
    cpFiles.forEach(f => form.append('files', f))
    form.append('project_id', String(fields!.project_id))
    if (fields!.zone_id) form.append('zone_id', String(fields!.zone_id))
    if (fields!.sub_zone_id) form.append('sub_zone_id', String(fields!.sub_zone_id))
    for (const k of ['lot', 'description', 'version', 'revision'] as const) if (fields![k]) form.append(k, fields![k]!)
    form.append('file_names', JSON.stringify(files.map(f => f.name)))
    try { setPreview(await previewMutation.mutateAsync(form)) } catch (err) { fail(err) }
  }

  const confirm = async () => {
    setPreview(null)
    setProgress(0)
    try {
      const res = await upload.mutateAsync({ input: { previewForm: new FormData(), files: cpFiles, fields: fields! }, onProgress: setProgress })
      setProgress(null)
      onSaved(res)
    } catch (err) { fail(err) }
  }

  return (
    <>
      <div>
        <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>
          CutLogic files <span style={{ color: '#C8202A' }}>*</span>
          <span style={{ fontSize: 11, fontWeight: 400, color: '#8E8E8E', marginLeft: 6 }}>drop the whole folder; only CP-*.pdf (one per size) is saved</span>
        </label>
        <FileDropzone
          maxFiles={MAX_FILES} currentCount={files.length} acceptedFormats={FORMATS} maxSizeBytes={MAX_FILE_BYTES}
          hint={`CP-*.pdf from CutLogic 1D · up to ${MAX_CP_FILES} sizes · 5 MB per PDF`}
          onFilesAdded={onFilesAdded} disabled={false}
        />
      </div>

      {files.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#8E8E8E', marginBottom: 6 }}>Sizes ({cp.length}) · Files ({files.length})</div>
          <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid #E0E0E0', borderRadius: 6, background: '#FAFAFA' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr style={{ color: '#8E8E8E', textAlign: 'left' }}><th style={{ padding: '6px 8px' }}>Size</th><th style={{ padding: '6px 8px' }}>File</th><th style={{ width: 28 }} /></tr></thead>
              <tbody>
                {cp.map(c => (
                  <tr key={c.name} style={{ borderTop: '1px solid #ECECEC', background: 'white' }}>
                    <td style={{ padding: '5px 8px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{c.size ?? '—'}</td>
                    <td style={{ padding: '5px 8px', color: '#555', wordBreak: 'break-all' }}>{c.name}</td>
                    <td><button onClick={() => setFiles(prev => prev.filter(f => f.name !== c.name))} aria-label={`Remove ${c.name}`}
                      style={{ fontSize: 11, color: '#8E8E8E', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {notUsed.length > 0 && <div style={{ marginTop: 6, fontSize: 11, color: '#8E8E8E' }}>Not used ({notUsed.length}): {notUsed.join(', ')}</div>}
          {problems.length > 0 && (
            <div style={{ marginTop: 8, background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 6, padding: '8px 10px', fontSize: 12, color: '#991B1B', lineHeight: 1.6 }}>
              <div style={{ fontWeight: 600 }}>Cannot save until these are fixed</div>
              {problems.map(m => <div key={m}>{m}</div>)}
              {rejected.length > 0 && (
                <button onClick={() => setFiles(prev => prev.filter(f => !rejected.includes(f.name)))}
                  style={{ marginTop: 4, fontSize: 12, color: '#991B1B', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  Remove rejected files
                </button>
              )}
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
        <button onClick={onCancel} disabled={busy} style={{ fontSize: 13, color: '#555', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
        <button onClick={submit} disabled={!canSubmit} className="flex items-center gap-1.5 rounded-md text-white disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ height: 36, padding: '0 20px', fontSize: 13, fontWeight: 600, background: '#C8202A' }}>
          {previewMutation.isPending ? <><Loader2 size={14} className="animate-spin" />Reading...</>
            : upload.isPending ? <><Loader2 size={14} className="animate-spin" />Saving...</>
              : <><Upload size={14} />Upload</>}
        </button>
      </div>

      {preview && <ShapePreviewModal preview={preview} onCancel={() => setPreview(null)} onConfirm={confirm} isUploading={upload.isPending} />}
    </>
  )
}
