import { useState } from 'react'
import { Upload, Loader2, X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useUploadBom } from '../../hooks/useBomDispatches'
import { FileDropzone } from './FileDropzone'
import { FilePreviewItem } from './FilePreviewItem'
import { classifyFilename } from '../../lib/bom/filenameClassifier'
import type { DocType } from '../../lib/bom/filenameClassifier'
import type { FileRejection } from './FileDropzone'

interface FileEntry {
  file: File
  detectedType: DocType | null
  error?: string
}

interface Props {
  dispatchId: number
  projectId: number
  zoneId: number
  subZoneId: number | null
  onClose: () => void
}

export function UpdateBomModal({ dispatchId, projectId, zoneId, subZoneId, onClose }: Props) {
  const qc = useQueryClient()
  const uploadMutation = useUploadBom()
  const [files, setFiles] = useState<FileEntry[]>([])
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onFilesAdded = (accepted: File[], rejected: FileRejection[]) => {
    const entries: FileEntry[] = []
    accepted.forEach(f => {
      const detectedType = classifyFilename(f.name)
      const existingTypes = files.filter(e => !e.error).map(e => e.detectedType)
      if (detectedType && existingTypes.includes(detectedType)) {
        entries.push({ file: f, detectedType, error: `A file of type "${detectedType}" already exists` })
      } else {
        entries.push({ file: f, detectedType })
      }
    })
    const rejectedEntries: FileEntry[] = rejected.map(r => ({ file: r.file, detectedType: null, error: r.reason }))
    setFiles(prev => [...prev, ...entries, ...rejectedEntries])
  }

  const removeFile = (i: number) => setFiles(prev => prev.filter((_, j) => j !== i))

  const updateType = (index: number, type: DocType) => {
    setFiles(prev => prev.map((entry, i) => {
      if (i !== index) return entry
      const otherTypes = prev.filter((_, j) => j !== i && !prev[j].error).map(e => e.detectedType)
      if (otherTypes.includes(type)) return { ...entry, detectedType: type, error: `A file of type "${type}" already exists` }
      return { ...entry, detectedType: type, error: undefined }
    }))
  }

  const validFiles = files.filter(e => !e.error && e.detectedType !== null)
  const canSubmit = validFiles.length >= 1 && !uploadMutation.isPending

  const handleSubmit = async () => {
    setError(null)
    setProgress(0)
    const formData = new FormData()
    formData.append('project_id', String(projectId))
    formData.append('zone_id', String(zoneId))
    if (subZoneId != null) formData.append('sub_zone_id', String(subZoneId))
    formData.append('dispatch_id', String(dispatchId))
    validFiles.forEach(e => {
      formData.append('files', e.file)
      formData.append('doc_types', e.detectedType!)
    })
    try {
      await uploadMutation.mutateAsync({ formData, onProgress: pct => setProgress(pct) })
      qc.invalidateQueries({ queryKey: ['dispatch', dispatchId] })
      qc.invalidateQueries({ queryKey: ['dispatch-history', dispatchId] })
      qc.invalidateQueries({ queryKey: ['dispatches'] })
      onClose()
    } catch {
      setError('Upload failed — check that the backend is running')
      setProgress(null)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth: 520, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="flex items-center justify-between">
          <span style={{ fontSize: 16, fontWeight: 600, color: '#1F1F1F' }}>Update BOM</span>
          <button onClick={onClose} className="flex items-center justify-center rounded hover:bg-chrome-50" style={{ width: 28, height: 28, color: '#8E8E8E' }}>
            <X size={14} />
          </button>
        </div>

        <div style={{ fontSize: 13, color: '#92400E', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 6, padding: '8px 12px' }}>
          A new revision will be added — existing files are not deleted, history is preserved
        </div>

        <FileDropzone
          maxFiles={3}
          currentCount={files.filter(e => !e.error).length}
          onFilesAdded={onFilesAdded}
          disabled={files.filter(e => !e.error).length >= 3}
        />

        {files.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {files.map((entry, i) => (
              <FilePreviewItem
                key={i}
                file={entry.file}
                detectedType={entry.detectedType}
                error={entry.error}
                onRemove={() => removeFile(i)}
                onTypeChange={type => updateType(i, type)}
              />
            ))}
          </div>
        )}

        {progress !== null && (
          <div>
            <div style={{ height: 4, background: '#E0E0E0', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progress}%`, background: '#185FA5', transition: 'width 0.2s' }} />
            </div>
          </div>
        )}

        {error && (
          <div style={{ fontSize: 13, color: '#C8202A', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, padding: '8px 12px' }}>
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} style={{ fontSize: 13, color: '#555', padding: '6px 16px', borderRadius: 6, border: '1px solid #E0E0E0', background: 'white' }}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex items-center gap-1.5 rounded-md text-white disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ height: 36, padding: '0 20px', fontSize: 13, fontWeight: 600, background: '#185FA5' }}
          >
            {uploadMutation.isPending
              ? <><Loader2 size={13} className="animate-spin" />Uploading...</>
              : <><Upload size={13} />Upload ({validFiles.length})</>}
          </button>
        </div>
      </div>
    </div>
  )
}
