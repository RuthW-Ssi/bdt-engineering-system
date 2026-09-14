import { useState } from 'react'
import { X, Upload, Loader2, FileText } from 'lucide-react'
import { FileDropzone } from '../bom/FileDropzone'

type FileType = 'dwg' | 'pdf'

const DRAWING_FORMATS: Record<FileType, string[]> = { dwg: ['.dwg'], pdf: ['.pdf'] }
const DRAWING_HINT: Record<FileType, string> = { dwg: 'DWG · up to 50 MB each', pdf: 'PDF · up to 50 MB each' }
const MAX_DRAWING_SIZE = 50_000_000 // 50MB
const MAX_FILES = 1500 // a project's worth of sheets in one go, not unbounded

interface Props {
  scopeLabel: string
  isUploading: boolean
  onFilesConfirmed: (files: File[], fileType: FileType) => void
  onClose: () => void
}

export function DrawingUploadModal({ scopeLabel, isUploading, onFilesConfirmed, onClose }: Props) {
  // DWG (source CAD, needs APS) and PDF (print-ready companion, viewed
  // directly) are functionally different artifacts with independent version
  // histories (see useUploadDrawings) — picking one up front, rather than
  // inferring it per-file after drop, keeps a batch from ever mixing the two
  // and makes the dropzone's accepted-format restriction unambiguous.
  const [fileType, setFileType] = useState<FileType>('dwg')

  // Staged, not uploaded yet — matches BimUploadModal's pattern: picking
  // files only stages them, the Upload button below is what actually sends
  // them, giving a chance to double-check (or remove and re-pick) first.
  const [stagedFiles, setStagedFiles] = useState<File[]>([])

  const handleTypeChange = (next: FileType) => {
    setFileType(next)
    setStagedFiles([]) // switching type mid-stage would otherwise mix DWG + PDF in one batch
  }

  const handleConfirm = () => {
    if (stagedFiles.length > 0) onFilesConfirmed(stagedFiles, fileType)
  }

  const removeFile = (index: number) => {
    setStagedFiles(files => files.filter((_, i) => i !== index))
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget && !isUploading) onClose() }}
    >
      <div style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth: 480, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="flex items-center justify-between">
          <span style={{ fontSize: 16, fontWeight: 600, color: '#1F1F1F' }}>Upload Drawing</span>
          <button
            onClick={onClose}
            disabled={isUploading}
            className="flex items-center justify-center rounded hover:bg-chrome-50 disabled:opacity-40"
            style={{ width: 28, height: 28, color: '#8E8E8E' }}
          >
            <X size={14} />
          </button>
        </div>

        <div style={{ fontSize: 12, color: '#8E8E8E' }}>
          {scopeLabel}
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: '#555' }}>
          File type
          <select
            value={fileType}
            onChange={e => handleTypeChange(e.target.value as FileType)}
            disabled={isUploading}
            style={{ height: 32, padding: '0 8px', fontSize: 13, borderRadius: 6, border: '1px solid #E0E0E0', background: 'white', fontWeight: 400, color: '#1F1F1F' }}
          >
            <option value="dwg">DWG</option>
            <option value="pdf">PDF</option>
          </select>
        </label>

        {stagedFiles.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
            {stagedFiles.map((file, i) => (
              <div key={`${file.name}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: '#FAFAFA', border: '1px solid #ECECEC', borderRadius: 8, fontSize: 13 }}>
                <FileText size={16} style={{ color: '#8E8E8E', flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{file.name}</span>
                <button
                  onClick={() => removeFile(i)}
                  disabled={isUploading}
                  className="flex items-center justify-center rounded hover:bg-chrome-100 disabled:opacity-40"
                  style={{ width: 22, height: 22, color: '#8E8E8E', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        {stagedFiles.length < MAX_FILES && (
          <FileDropzone
            maxFiles={MAX_FILES}
            currentCount={stagedFiles.length}
            acceptedFormats={DRAWING_FORMATS[fileType]}
            maxSizeBytes={MAX_DRAWING_SIZE}
            hint={DRAWING_HINT[fileType]}
            onFilesAdded={accepted => setStagedFiles(files => [...files, ...accepted])}
            disabled={isUploading}
          />
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={isUploading}
            className="disabled:opacity-40"
            style={{ fontSize: 13, color: '#555', padding: '6px 16px', borderRadius: 6, border: '1px solid #E0E0E0', background: 'white' }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={stagedFiles.length === 0 || isUploading}
            className="flex items-center gap-1.5 rounded-md text-white disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ height: 36, padding: '0 20px', fontSize: 13, fontWeight: 600, background: '#0C447C' }}
          >
            {isUploading
              ? <><Loader2 size={13} className="animate-spin" />Uploading...</>
              : <><Upload size={13} />Upload{stagedFiles.length > 1 ? ` (${stagedFiles.length})` : ''}</>}
          </button>
        </div>
      </div>
    </div>
  )
}
